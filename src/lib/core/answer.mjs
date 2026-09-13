import { routeQuestion, normalizeQuestion, intentText } from './router.mjs';
import { retrieve, isInstructionText, isAuthoritative, requestedDetailScore } from '../retrieval/search.mjs';
import { makeEvidence, safeSourceUrl, findApplicationConflicts } from '../citations/evidence.mjs';
import { housingSituation, verificationQuestions } from '../housing/navigation.mjs';
import { sourceCoversJurisdiction } from '../coverage.mjs';

function unknownSpecificClaim(question, sources, chunks) {
  const text = intentText(question);
  const corpus = normalizeQuestion(sources.map(source => `${source.title} ${(source.keywords ?? []).join(' ')} ${source.source_id}`).join(' ') + ' ' + chunks.map(chunk => chunk.text).join(' '));
  const localProgram = text.match(/\b(rmap|hrrp)\b/);
  if (localProgram && !new RegExp('\\b' + localProgram[1] + '\\b').test(corpus)) return 'program';
  const ordinance = text.match(/\b(?:ordinance|section|statute|code)\s+(\d[\w.-]*)/);
  if (ordinance && !corpus.includes(ordinance[1])) return 'ordinance';
  if (/\b(free house|guaranteed housing|pirate|privateer grant|unicorn|sunshine key|dolphin|moonlight|universal rent|magic|free mansion|tampa gold|free-home|no questions asked)\b/.test(text)) return 'program';
  const named = String(question).match(/["“]([^"”]{4,100})["”]/);
  if (named && /\b(program|grant|fund|ordinance)\b/i.test(text) && !corpus.includes(normalizeQuestion(named[1]))) return 'program';
  const properName = String(question).match(/\b(?:[A-Z][a-zA-Z-]+\s+){1,5}(?:Program|Grant|Fund|Award)\b/);
  if (properName && !corpus.includes(normalizeQuestion(properName[0]))) return 'program';
  const spanishName = String(question).match(/\b(?:Programa|Subvenci[oó]n|Fondo)\s+(?:[A-ZÁÉÍÓÚÑ][\p{L}-]*(?:\s+|$)){1,5}/u);
  if (spanishName && !corpus.includes(normalizeQuestion(spanishName[0]))) return 'program';
  return null;
}

function nextSteps(sources) {
  const result = [];
  for (const source of sources) {
    if (!isAuthoritative(source)) continue;
    const target = source.next_step ?? { label: `Visit ${source.title}`, url: source.canonical_url };
    const url = safeSourceUrl(target.url, source.canonical_url);
    if (!url || result.some(item => item.url === url)) continue;
    result.push({ label: target.label, url, agency: source.agency });
  }
  return result.slice(0, 3);
}

function jurisdictionResponse(answer, route) {
  answer.status = 'needs_jurisdiction';
  answer.needsAddress = false;
  answer.answer = route.jurisdictionReason === 'unsupported_municipality'
    ? 'I do not have a verified city-specific collection for the municipality you named. Confirm its local programs and rules with that city; county rules may not apply inside city limits.'
    : route.jurisdictionReason === 'conflict'
      ? 'The question and selected location name different jurisdictions. Confirm the city or county you want to use before I provide local programs or rules.'
      : 'I need the city or county to find the right local programs, rules, and agency. Select a jurisdiction or name it in your question.';
  answer.meaning = 'Any resources shown here are broadly applicable navigation. They do not establish local program eligibility, property jurisdiction, or permission to build.';
  return answer;
}

function officialJudgmentResponse(answer) {
  answer.needsAddress = false;
  answer.status = 'official_judgment';
  answer.answer = 'I cannot make an official eligibility, legal, zoning, or permitting determination. Use the responsible agency to request a decision; any cited resources are starting points.';
  answer.meaning = 'The agency needs the relevant household or project details and current rules. A source page or nearby record does not establish approval.';
  return answer;
}

function unsupportedResponse(answer, unsupported) {
  answer.status = 'insufficient_evidence';
  answer.answer = `I could not verify the ${unsupported} you named in this jurisdiction's collection. Any sources shown are places to check; they do not establish that it exists.`;
  answer.meaning = 'Confirm the exact name and jurisdiction with the responsible agency before relying on it.';
  if (answer.needsJurisdiction) answer.needsAddress = false;
  return answer;
}

function selectHits(hits, question, route, sources, chunks) {
  const ranked = [...hits];
  const text = intentText(question);
  const priority = [];
  if (route.subjectCategory === 'housing') {
    const preferred = housingSituation(question, route).preferredSourceIds;
    priority.push(...preferred);
    ranked.sort((a, b) => {
      const aPreferred = preferred.indexOf(a.source.source_id);
      const bPreferred = preferred.indexOf(b.source.source_id);
      return (aPreferred < 0 ? 99 : aPreferred) - (bPreferred < 0 ? 99 : bPreferred) || b.score - a.score;
    });
  }
  if (route.jurisdictionId === 'tampa') {
    if (route.subjectCategory === 'zoning') priority.push(/\b(flu|future land use|comprehensive)\b/.test(text) ? 'plan-hillsborough-maps' : 'tampa-zoning', 'tampa-development-contact');
    if (route.subjectCategory === 'permitting') priority.push(/\b(new construction|application guide|documents|checklist)\b/.test(text) ? 'tampa-permit-guide' : 'tampa-permits', 'tampa-development-contact');
    if (route.subjectCategory === 'development') priority.push('tampa-development-contact');
    if (route.category === 'navigation' && /\b(contact|who|agency|department|phone)\b/.test(text) && route.subjectCategory === 'zoning') priority.unshift('tampa-development-contact');
  } else if (route.subjectCategory === 'zoning') {
    priority.push(route.jurisdictionId === 'pasco-county' && !/\b(comprehensive|2050|plan update)\b/.test(text) ? 'pasco-maps' : `${route.jurisdictionId.replace('-county', '')}-zoning`);
  } else if (['permitting', 'development'].includes(route.subjectCategory)) {
    priority.push(`${route.jurisdictionId.replace('-county', '')}-permits`);
  }
  const anchors = {
    'tampa-rmap': /\b(hcv|section 8|voucher)\b/.test(text) ? /Yes, Housing Choice Voucher/i
      : /\b(fee|fees)\b/.test(text) ? /does not cover or reimburse application fees/i
      : /\b(apply|application|online|person|portal)\b/.test(text) ? /Applications must be submitted through the online portal only/i
      : /\b(deposit|moving|move in)\b/.test(text) ? /Assistance is available for new move-in costs only/i
      : /This phase of RMAP is a new move-in assistance program only/i,
    'tampa-hrrp': /not currently accepting new applications/i,
    'hillsborough-help': /\b(homeless|sleep|shelter|nowhere)\b/.test(text) ? /partners with community agencies that provide temporary housing/i
      : /\b(hurricane|helene|milton)\b/.test(text) ? /Qualified homeowners whose homes were damaged/i
      : /Here, you will find resources related to affordable housing/i,
    'tampa-housing': /\b(tenant|landlord|eviction|evicted|evicton|legal)\b/.test(text) ? /Call the Housing Information Line at/i
      : /\b(homeless|sleep|shelter)\b/.test(text) ? /Serving the needs of the homeless community/i
      : /The Housing and Community Development Division \(HCD\) plays a lead role/i,
    'florida-housing': /\b(ship)\b/.test(text) ? /Your county or city government may offer down payment/i
      : /\b(buy|buying|homebuyer|down payment|mortgage)\b/.test(text) ? /The Homebuyer Loan Program makes purchasing/i
      : /Floridahousingsearch.org is a free/i,
    'tampa-zoning': /Welcome to the City of Tampa Zoning Maps/i,
    'plan-hillsborough-maps': /\b(survey|accuracy)\b/.test(text) ? /This map is not a survey/i : /Maps are processed quarterly/i,
    'tampa-permits': /\b(condo|condominium)\b/.test(text) ? /Although a condominium/i : /Didn.t find the permit type/i,
    'tampa-permit-guide': /This guide contains minimum permit application filing requirements/i,
    'tampa-development-contact': /\b(variance|exception)\b/.test(text) ? /Variances\/Design Exceptions/i
      : /\b(rezon|subdivision)/.test(text) ? /Rezonings\/Special Use/i
      : /\b(permit|construction)\b/.test(text) ? /Construction Services Division/i
      : /General Inquiries Development Coordination/i,
    'st-petersburg-renters': /\b(eviction|evicted|behind|overdue|notice)\b/.test(text)
      ? /Seek help as soon as you know you will not be able to pay rent/i
      : /This guide helps tenants through the rental process/i,
    'st-petersburg-rehab': /\b(income|ami|limit|limits)\b/.test(text)
      ? /Loan applicant income is limited to 80% Area Median Income/i
      : /Funding is available to qualified applicants who own and occupy/i,
    'st-petersburg-zoning': /\b(chapter|code|ldr)\b/.test(text)
      ? /Chapter 16 of the City Code is formally known/i
      : /To look up zoning on your parcel/i,
    'st-petersburg-permits': /Once the plans are ready to be submitted/i,
    'clearwater-housing': /\b(homeless|sleep|shelter|nowhere)\b/.test(text)
      ? /Call 211 for assistance for people experiencing homelessness/i
      : /Rents and eligibility vary/i,
    'clearwater-rehab': /Due to current funding limitations/i,
    'clearwater-zoning': /View the city.s future land use and zoning maps/i,
    'clearwater-permits': /Step 1.Visit Clearwater.s Accela portal/i,
    'pinellas-housing-directory': /Welcome to the Community Housing Guide/i,
    'pinellas-family-housing': /The Family Housing Assistance Program \(FHAP\) helps families/i,
    'pinellas-permits': /Pinellas County Building and Development Review Services department serves/i,
    'pasco-housing': /Mission: Improving the lives of Pasco.s citizens/i,
    'pasco-rehab': /Pasco County Community Development administers a program/i,
    'pasco-help': /Please call our office at 727-834-3297/i,
    'pasco-maps': /To use the full version of our interactive mapper/i,
    'pasco-permits': /Questions\? Email BCSCustomerService/i,
  };
  // Guidance anchors are literal reviewed source passages, not prewritten factual answers.
  // They prevent a keyword hit on an exception or news headline from becoming a summary.
  for (const sourceId of priority.reverse()) {
    const source = sources.find(item => item.source_id === sourceId);
    if (!source) continue;
    const anchor = anchors[sourceId];
    const chunk = anchor ? chunks.find(item => item.source_id === sourceId && anchor.test(item.text) && !isInstructionText(item.text)) : null;
    const existing = ranked.find(item => item.source.source_id === sourceId);
    if (chunk) ranked.unshift({ source, chunk, score: existing?.score ?? 1, matches: 1 });
    else if (existing) ranked.unshift(existing);
  }
  const selected = [];
  const hasPrioritySource = ranked.some(hit => priority.includes(hit.source.source_id));
  for (const hit of ranked) {
    if (hasPrioritySource && !priority.includes(hit.source.source_id)) continue;
    if (selected.some(item => item.source.source_id === hit.source.source_id)) continue;
    if (selected.length && !priority.includes(hit.source.source_id) && hit.score < ranked[0].score * 0.3) continue;
    selected.push(hit);
    if (selected.length === 3) break;
  }
  // A reviewed opening passage retains qualifications; a matching factual field
  // from that same source can answer the resident's specific amount/term question.
  // Never substitute a number from an unrelated program or another jurisdiction.
  const primary = selected[0];
  const detail = primary && hits.filter(hit => hit.source.source_id === primary.source.source_id && hit.detailScore > 0)
    .sort((a, b) => b.detailScore - a.detailScore || b.score - a.score)[0];
  if (detail && !selected.some(hit => hit.chunk.id === detail.chunk.id)) selected.splice(1, 0, detail);
  if (detail) {
    const closed = /\bapplications?\b.{0,45}\b(?:closed|paused)\b|\bnot (?:currently )?accepting\b/i;
    const qualifications = chunks.filter(chunk => chunk.source_id === primary.source.source_id && chunk.id !== detail.chunk.id &&
      !isInstructionText(chunk.text) && (closed.test(chunk.text) || /\bnot eligible\b|\b(?:program|assistance)\b.{0,60}\bonly\b/i.test(chunk.text)))
      .sort((a, b) => Number(closed.test(b.text)) - Number(closed.test(a.text)));
    const qualification = qualifications[0];
    const primaryQualified = closed.test(primary.chunk.text) || /\bnot eligible\b|\b(?:program|assistance)\b.{0,60}\bonly\b/i.test(primary.chunk.text);
    if (qualification && qualification.id !== primary.chunk.id && (!primaryQualified || closed.test(qualification.text) && !closed.test(primary.chunk.text))) {
      const existing = selected.findIndex(hit => hit.chunk.id === qualification.id);
      if (existing >= 0) selected.splice(existing, 1);
      selected.unshift({ source: primary.source, chunk: qualification, score: primary.score });
    }
  }
  return selected;
}

/** Deterministic, extractive retrieval and resident navigation. No model/API key. */
export function answerQuestion(question, { sources = [], chunks = [], now = new Date(), jurisdictionId = 'tampa-bay' } = {}) {
  const query = typeof question === 'string' ? question.trim().slice(0, 2000) : '';
  const date = new Date(now);
  const route = routeQuestion(query, { jurisdictionId });
  // Apply scope before every retrieval, anchor, conflict, extra passage, and link.
  // A selected city is resource context; property boundaries still need GIS verification.
  sources = sources.filter(source => sourceCoversJurisdiction(source, route.jurisdictionId));
  const sourceIds = new Set(sources.map(source => source.source_id));
  chunks = chunks.filter(chunk => sourceIds.has(chunk.source_id));
  const answer = {
    category: route.category, status: 'insufficient_evidence', query,
    answer: 'I could not determine this reliably from the available public information.',
    meaning: null, evidence: [], nextSteps: [], warnings: [], needsAddress: route.needsAddress,
    jurisdictionId: route.jurisdictionId, jurisdictionLabel: route.jurisdictionLabel, needsJurisdiction: route.needsJurisdiction,
    ...(route.subjectCategory === 'housing' ? verificationQuestions(query, route) : {}),
  };
  if (!query) { answer.answer = 'Enter a question about housing, zoning, permits, development, or an agency you need to find.'; return answer; }
  if (route.outOfScope) {
    answer.needsAddress = false;
    answer.needsJurisdiction = false;
    answer.status = 'out_of_scope';
    answer.answer = 'I can help with Tampa Bay housing resources, zoning, permits, development records, and finding the responsible agency.';
    return answer;
  }
  if (route.outsideCoverage) {
    answer.needsAddress = false;
    answer.needsJurisdiction = false;
    answer.status = 'missing_geographic_coverage';
    answer.answer = 'This collection covers selected Tampa Bay resources in Hillsborough, Pinellas, and Pasco counties. I cannot verify local programs or property rules for the place you named.';
    answer.meaning = 'Use the government serving that property to confirm local information.';
    return answer;
  }
  const retrieval = retrieve(query, { sources, chunks, route, now: date, limit: 15 });
  if (retrieval.quarantined.length) answer.warnings.push('Some source text was excluded because it contained instructions aimed at an assistant or executable markup.');
  let selected = selectHits(retrieval.hits, query, route, sources, chunks);
  const additionalPassages = [];
  if (route.subjectCategory === 'housing' && /\b(person|disability|disabled|accommodation|cannot.*online)\b/.test(route.normalized)) additionalPassages.push(['tampa-rmap', /If an individual has a disability that substantially limits/i]);
  if (route.subjectCategory === 'housing' && /\b(homeless|sleep|shelter|nowhere)\b/.test(route.normalized)) additionalPassages.push(['hillsborough-help', /Find your closest Community Resource Center or contact the Call Center/i]);
  if (selected.some(hit => hit.source.source_id === 'st-petersburg-rehab')) additionalPassages.push(['st-petersburg-rehab', /Loan applicant income is limited to 80% Area Median Income/i]);
  if (selected.some(hit => hit.source.source_id === 'pasco-rehab')) additionalPassages.push(['pasco-rehab', /The funds provided through Pasco County will be a zero-interest 30 year loan/i]);
  for (const [sourceId, expression] of additionalPassages) {
    const source = sources.find(item => item.source_id === sourceId);
    const chunk = chunks.find(item => item.source_id === sourceId && expression.test(item.text) && !isInstructionText(item.text));
    if (source && chunk && !selected.some(hit => hit.chunk.id === chunk.id)) selected.push({ source, chunk, score: 1 });
  }
  const unsupported = unknownSpecificClaim(query, sources, chunks);
  if (!selected.length) {
    const relevantSources = sources.filter(source => source.categories?.includes(route.subjectCategory));
    answer.nextSteps = nextSteps(relevantSources);
    if (unsupported) return unsupportedResponse(answer, unsupported);
    if (route.officialJudgment) return officialJudgmentResponse(answer);
    if (route.needsJurisdiction && route.subjectCategory !== 'navigation') return jurisdictionResponse(answer, route);
    if (relevantSources.length && !chunks.some(chunk => relevantSources.some(source => source.source_id === chunk.source_id) && !isInstructionText(chunk.text ?? ''))) {
      answer.status = 'unavailable_source';
      answer.answer = 'I do not have usable source text for this question. Open the official resource to verify the information directly.';
    }
    return answer;
  }
  const safeChunks = chunks.filter(chunk => !isInstructionText(chunk.text ?? ''));
  const conflict = findApplicationConflicts(selected, sources, safeChunks, date);
  if (conflict) selected = conflict.hits;
  answer.evidence = selected.map((hit, index) => makeEvidence(hit, query, index, date)).filter(Boolean);
  answer.nextSteps = nextSteps(selected.map(hit => hit.source));
  if (!answer.evidence.length) return answer;
  const main = answer.evidence[0];
  const unavailable = selected.some(hit => /unavailable|failed|error/i.test(String(hit.source.availability ?? hit.source.last_fetch_status ?? hit.source.status ?? '')));
  if (answer.evidence.some(item => item.stale)) answer.warnings.push('One or more snapshots are older than their planned refresh interval. Check the live official page before acting.');
  if (unavailable) answer.warnings.push('A source could not be refreshed; this response uses a previously preserved snapshot.');
  if (answer.evidence.some(item => !isAuthoritative(sources.find(source => source.source_id === item.source_id) ?? {}))) answer.warnings.push('Independent or secondary evidence is labeled. It is not an official government determination.');
  if (unsupported) return unsupportedResponse(answer, unsupported);
  if (route.subjectCategory === 'housing' && /\b(income|ami|limit|limits|table|threshold)\b/.test(route.normalized) && /\b(2025|2026|current|today|latest)\b/.test(route.normalized)) {
    const oldTable = chunks.find(chunk => chunk.source_id === 'tampa-rmap' && /Income Limits 2025/i.test(chunk.text));
    if (oldTable) {
      const source = sources.find(item => item.source_id === 'tampa-rmap');
      const evidence = makeEvidence({ source, chunk: oldTable }, query, answer.evidence.length, date);
      if (evidence) answer.evidence.push(evidence);
      answer.status = 'potentially_outdated';
      answer.answer = 'The available RMAP income table is labeled 2025. I cannot confirm that those figures are the current eligibility limits. Check the latest limits with the program agency.' + (evidence ? ' [' + evidence.id + ']' : '');
      answer.warnings.push('A recently retrieved page can still contain an older income table. Retrieval date is not the effective date of a rule.');
      return answer;
    }
  }
  if (route.subjectCategory === 'zoning' && /\b(what does|what is|define|meaning|mean|definition|maximum|how many|setback|height limit)\b/.test(route.normalized) && /\b(rm-?24|rs-?50|nt-?\d|ns-?\d|nsm-?\d|ldr|lmdr|mdr|hdr|mhdr|far|adu|setback|density|variance|overlay|maximum|how many|height limit)\b/.test(route.normalized) && !route.officialJudgment) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'This collection does not contain a verified definition or rule that answers that detail. Use the official zoning source and ask planning staff to confirm the meaning and requirements.';
    answer.meaning = 'A map label alone is not enough to establish a numerical limit or permission to build.';
    return answer;
  }
  if (conflict) {
    answer.status = 'conflicting_evidence';
    answer.answer = 'The available official sources disagree about whether applications are open. I cannot resolve that conflict from these snapshots. [E1] [E2]';
    answer.meaning = 'Ask the program agency to confirm current availability before applying. Both source statements are shown below.';
    return answer;
  }
  if (route.officialJudgment) return officialJudgmentResponse(answer);
  if (route.needsJurisdiction && route.subjectCategory !== 'navigation') return jurisdictionResponse(answer, route);
  if (route.needsAddress) {
    answer.status = 'needs_location';
    answer.answer = route.hasAddress
      ? 'I found sources to start with. Confirm the address and jurisdiction in the property lookup before relying on property-specific information.'
      : 'Enter a full street address in the property lookup so the location and jurisdiction can be checked. I cannot identify a property from this question alone.';
    answer.meaning = route.subjectCategory === 'development'
      ? 'Nearby records describe recorded activity. Distance alone does not show that a record applies to a property or establishes what is allowed there.'
      : 'The official source and the property lookup are starting points. Ask the responsible planning or permitting staff to verify requirements for a specific property.';
    return answer;
  }
  if (route.subjectCategory === 'development' || (route.subjectCategory === 'permitting' && /\b(my permit|permit (?:is )?approved|permit status)\b/.test(route.normalized))) {
    answer.status = 'insufficient_evidence';
    answer.answer = route.subjectCategory === 'development'
      ? 'I cannot establish activity or predict future development from these general pages. Use the property lookup to find dated nearby records, then verify the original record with the agency.'
      : 'I cannot confirm a permit decision from general permit guidance. Find the specific record in the official permit resource and verify its status with the permitting agency.';
    answer.meaning = 'An application, a permit decision, and completed construction are different events. A general source page cannot establish a specific record status.';
    return answer;
  }
  if (main.stale) {
    answer.status = 'potentially_outdated';
    answer.answer = 'The best matching source snapshot may be outdated. I cannot confirm that its program availability or instructions still apply.';
    answer.meaning = `The preserved ${main.title} excerpt is shown below. Check the live page with the agency before acting.`;
    return answer;
  }
  if (route.subjectCategory === 'navigation' && !/\b(housing|zoning|permit|development)\b/.test(route.normalized)) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'Tell me what you are trying to do, such as finding housing help, checking a property, or applying for a permit. I need that detail to identify the right agency.';
    answer.evidence = [];
    answer.nextSteps = [];
    return answer;
  }
  answer.status = 'answered';
  answer.answer = `Start with ${main.title}. The source says: “${main.quote}” [${main.id}]`;
  const detail = answer.evidence.find(item => item.source_id === main.source_id && item.id !== main.id && requestedDetailScore(query, item.quote) > 0 && !item.stale);
  if (detail) {
    answer.answer += `\n\nThe same source gives this detail: “${detail.quote}” [${detail.id}]`;
    answer.requiredEvidenceIds = [main.id, detail.id];
  }
  answer.meaning = route.subjectCategory === 'housing'
    ? 'This resource may be relevant to your situation. Use its official application or contact path and check the questions below; this is not an eligibility decision.'
    : route.subjectCategory === 'development'
      ? 'For observed activity, use public record details and dates. A record does not establish the rules or development rights for another property.'
      : route.subjectCategory === 'zoning'
        ? 'Use the official source to check the designation and ask planning staff to explain how it applies to your property. This response does not interpret the code for a specific project.'
        : route.subjectCategory === 'permitting'
          ? 'Use the permit resource to find the right application path. Ask permitting staff to confirm the requirements for your project.'
          : 'Use the official link below to reach the source or the agency responsible for it.';
  if (/\b(latest|today|right now|current|currently|recent)\b/.test(route.normalized)) answer.warnings.push('This answer uses the dated source snapshot shown in the evidence; it is not a live confirmation of current availability or record status.');
  return answer;
}
