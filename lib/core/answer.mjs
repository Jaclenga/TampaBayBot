import { routeQuestion, normalizeQuestion } from './router.mjs';
import { retrieve, isInstructionText, isAuthoritative } from '../retrieval/search.mjs';
import { makeEvidence, safeSourceUrl, findApplicationConflicts } from '../citations/evidence.mjs';
import { housingSituation, verificationQuestions } from '../housing/navigation.mjs';

function unknownSpecificClaim(question, sources, chunks) {
  const text = normalizeQuestion(question);
  const corpus = normalizeQuestion(sources.map(source => `${source.title} ${(source.keywords ?? []).join(' ')} ${source.source_id}`).join(' ') + ' ' + chunks.map(chunk => chunk.text).join(' '));
  const ordinance = text.match(/\b(?:ordinance|section|statute|code)\s+(\d[\w.-]*)/);
  if (ordinance && !corpus.includes(ordinance[1])) return 'ordinance';
  if (/\b(free house|guaranteed housing|pirate|privateer grant|unicorn|sunshine key|dolphin|moonlight|universal rent|magic|free mansion|tampa gold|free-home|no questions asked)\b/.test(text)) return 'program';
  const named = String(question).match(/["“]([^"”]{4,100})["”]/);
  if (named && /\b(program|grant|fund|ordinance)\b/i.test(question) && !corpus.includes(normalizeQuestion(named[1]))) return 'program';
  const properName = String(question).match(/\b(?:[A-Z][a-zA-Z-]+\s+){1,5}(?:Program|Grant|Fund|Award)\b/);
  if (properName && !corpus.includes(normalizeQuestion(properName[0]))) return 'program';
  return null;
}

function nextSteps(hits) {
  const result = [];
  for (const { source } of hits) {
    if (!isAuthoritative(source)) continue;
    const target = source.next_step ?? { label: `Visit ${source.title}`, url: source.canonical_url };
    const url = safeSourceUrl(target.url, source.canonical_url);
    if (!url || result.some(item => item.url === url)) continue;
    result.push({ label: target.label, url, agency: source.agency });
  }
  return result.slice(0, 3);
}

function selectHits(hits, question, route, sources, chunks) {
  const ranked = [...hits];
  const text = normalizeQuestion(question);
  const priority = [];
  if (route.subjectCategory === 'housing') {
    const preferred = housingSituation(question).preferredSourceIds;
    priority.push(...preferred);
    ranked.sort((a, b) => {
      const aPreferred = preferred.indexOf(a.source.source_id);
      const bPreferred = preferred.indexOf(b.source.source_id);
      return (aPreferred < 0 ? 99 : aPreferred) - (bPreferred < 0 ? 99 : bPreferred) || b.score - a.score;
    });
  }
  if (route.subjectCategory === 'zoning') priority.push(/\b(flu|future land use|comprehensive)\b/.test(text) ? 'plan-hillsborough-maps' : 'tampa-zoning', 'tampa-development-contact');
  if (route.subjectCategory === 'permitting') priority.push(/\b(new construction|application guide|documents|checklist)\b/.test(text) ? 'tampa-permit-guide' : 'tampa-permits', 'tampa-development-contact');
  if (route.subjectCategory === 'development') priority.push('tampa-development-contact');
  if (route.category === 'navigation' && /\b(contact|who|agency|department|phone)\b/.test(text) && route.subjectCategory === 'zoning') priority.unshift('tampa-development-contact');
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
  return selected;
}

/** Deterministic, extractive retrieval and resident navigation. No model/API key. */
export function answerQuestion(question, { sources = [], chunks = [], now = new Date() } = {}) {
  const query = typeof question === 'string' ? question.trim().slice(0, 2000) : '';
  const date = new Date(now);
  const route = routeQuestion(query);
  const answer = {
    category: route.category, status: 'insufficient_evidence', query,
    answer: 'I could not determine this reliably from the available public information.',
    meaning: null, evidence: [], nextSteps: [], warnings: [], needsAddress: route.needsAddress,
    ...(route.subjectCategory === 'housing' ? verificationQuestions(query) : {}),
  };
  if (!query) { answer.answer = 'Enter a question about housing, zoning, permits, development, or an agency you need to find.'; return answer; }
  if (route.outOfScope) {
    answer.needsAddress = false;
    answer.status = 'out_of_scope';
    answer.answer = 'I can help with Tampa housing resources, zoning, permits, development records, and finding the responsible agency.';
    return answer;
  }
  if (route.outsideCoverage) {
    answer.needsAddress = false;
    answer.status = 'missing_geographic_coverage';
    answer.answer = 'This collection focuses on Tampa and Hillsborough County. I cannot verify local programs or property rules for the place you named.';
    answer.meaning = 'Use the government serving that property to confirm local information.';
    return answer;
  }
  const retrieval = retrieve(query, { sources, chunks, route, now: date, limit: 15 });
  if (retrieval.quarantined.length) answer.warnings.push('Some source text was excluded because it contained instructions aimed at an assistant or executable markup.');
  let selected = selectHits(retrieval.hits, query, route, sources, chunks);
  const additionalPassages = [];
  if (route.subjectCategory === 'housing' && /\b(person|disability|disabled|accommodation|cannot.*online)\b/.test(route.normalized)) additionalPassages.push(['tampa-rmap', /If an individual has a disability that substantially limits/i]);
  if (route.subjectCategory === 'housing' && /\b(homeless|sleep|shelter|nowhere)\b/.test(route.normalized)) additionalPassages.push(['hillsborough-help', /Find your closest Community Resource Center or contact the Call Center/i]);
  for (const [sourceId, expression] of additionalPassages) {
    const source = sources.find(item => item.source_id === sourceId);
    const chunk = chunks.find(item => item.source_id === sourceId && expression.test(item.text) && !isInstructionText(item.text));
    if (source && chunk && !selected.some(hit => hit.chunk.id === chunk.id)) selected.push({ source, chunk, score: 1 });
  }
  const unsupported = unknownSpecificClaim(query, sources, chunks);
  if (!selected.length) {
    const relevantSources = sources.filter(source => source.categories?.includes(route.subjectCategory));
    answer.nextSteps = nextSteps(relevantSources.map(source => ({ source })));
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
  answer.nextSteps = nextSteps(selected);
  if (!answer.evidence.length) return answer;
  const main = answer.evidence[0];
  const unavailable = selected.some(hit => /unavailable|failed|error/i.test(String(hit.source.availability ?? hit.source.last_fetch_status ?? hit.source.status ?? '')));
  if (answer.evidence.some(item => item.stale)) answer.warnings.push('One or more snapshots are older than their planned refresh interval. Check the live official page before acting.');
  if (unavailable) answer.warnings.push('A source could not be refreshed; this response uses a previously preserved snapshot.');
  if (answer.evidence.some(item => !isAuthoritative(sources.find(source => source.source_id === item.source_id) ?? {}))) answer.warnings.push('Independent or secondary evidence is labeled. It is not an official government determination.');
  if (unsupported) {
    answer.status = 'insufficient_evidence';
    answer.answer = `I could not verify the ${unsupported} you named in this collection. These sources are places to check; they do not establish that it exists.`;
    answer.meaning = 'Confirm the exact name with the responsible agency before relying on it.';
    return answer;
  }
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
  if (route.subjectCategory === 'zoning' && /\b(what does|what is|define|meaning|mean|definition|maximum|how many|setback|height limit)\b/.test(route.normalized) && /\b(rm-?24|rs-?50|far|adu|setback|density|variance|overlay|maximum|how many|height limit)\b/.test(route.normalized) && !route.officialJudgment) {
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
  if (route.officialJudgment) {
    answer.needsAddress = false;
    answer.status = 'official_judgment';
    answer.answer = 'I cannot make an official eligibility, legal, zoning, or permitting determination. The cited resources can help you ask the responsible agency for a decision.';
    answer.meaning = 'The agency needs the relevant household or project details and current rules. A source page or nearby record does not establish approval.';
    return answer;
  }
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
