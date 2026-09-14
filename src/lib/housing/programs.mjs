import { intentText } from '../core/router.mjs';
import { housingNeeds } from './navigation.mjs';

// Mechanisms describe the help a passage offers. They are not eligibility rules,
// program identifiers, or a list of programs expected by an evaluation fixture.
const MECHANISMS = {
  repair: /\b(?:home repairs?|repairs?\b.{0,40}\b(?:homes?|houses?|roofs?)|rehabilitation|reconstruction|rebuild|home preservation|leaking roofs?|code.related (?:home )?(?:improvements|deficiencies))\b/,
  accessibility: /\b(?:accessibility|ada (?:accessibility|accommodations|improvements)|home modifications?|wheelchair ramps?|retrofit)\b/,
  buy: /\b(?:homebuyers?|homeownership|down payments?|closing costs?|purchas(?:e|es|ing) (?:a |the |your )?homes?|buy(?:ing)? (?:a |the |your )?homes?|builds? and sells? homes?|first mortgages?|second mortgage loan)\b/,
  rent: /\b(?:rental assistance|rent(?:al)? (?:payments?|assistance|subsidies|bills|arrears)|(?:overdue|past due|back) rent|housing (?:choice )?vouchers?|section 8|eviction prevention|pay(?:ing|ment of)?\b[^.!?]{0,65}\brent)\b/,
  rental: /\b(?:affordable rental|rental housing|housing locator|available rentals|income restricted units|housing (?:choice )?vouchers?|section 8)\b/,
  move: /\b(?:move in|moving costs?|security deposits?|rental deposits?|first month.{0,8}rent|last month.{0,8}rent)\b/,
  utilities: /\b(?:utilit(?:y|ies) (?:bills?|assistance|payments?)|(?:electric|electricity|energy|water|heating) (?:bills?|assistance)|home energy assistance|past due electric)\b/,
  shelter: /\b(?:homeless(?:ness)?|temporary housing|emergency (?:housing|shelters?)|shelters? providing|shelters? (?:offer|provid))\b/,
};

const DESCRIBES_HELP = /\b(?:provid(?:e|es|ing|ed)|offer(?:s|ing|ed)?|help(?:s|ing)?|assist(?:s|ing)?|receive|funding (?:is |will be )?(?:available|through|for)|financ(?:e|es|ing)|reserv(?:e|es|ing) funds|(?:grants?|loans?) (?:for|to)|payment of|pays? for|supports?|makes? .{0,40}affordable|builds? and sells?|locator service|apply for|assistance (?:is )?(?:available|for))\b/;
const NAVIGATION = /^(?:for (?:more|additional) information|please (?:contact|call|visit)|contact |find out how|use .{0,80}(?:wizard|learn more)|to (?:begin|learn)|the following (?:local )?agencies|welcome to|resources for)\b/;
const GENERAL_SECTION = /^(?:program (?:overview|services|goals)|core programs|what we do|(?:frequently asked )?questions|eligibility|loan features|homeownership opportunities|housing assistance|homebuyers and renters|human services|about |step \d)/;
const PROCUREMENT = /\b(?:requests? for proposals?|rfp|notice of funding availability|nofa|solicit(?:ation|ing) bids?|competitive bidding|procurement)\b/;

function normalized(text) {
  return intentText(String(text ?? '')).replace(/[-/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function mechanisms(text) {
  const body = normalized(text);
  const needs = Object.entries(MECHANISMS).filter(([, pattern]) => pattern.test(body)).map(([need]) => need);
  // A move-in benefit that happens to pay first/last month's rent is not an
  // arrears benefit. Likewise, an energy deposit is not help with an overdue bill.
  if (/\b(?:move in|moving costs?)\b[^.!?]{0,70}\bonly\b|\bexclusively\b[^.!?]{0,60}\bmove in\b/.test(body)) {
    return needs.filter(need => !['rent', 'rental'].includes(need));
  }
  return needs;
}

function sentenceSpans(text) {
  // Periods inside web addresses do not discard the words before the domain.
  return [...text.matchAll(/[^\n]+?(?:[.!?](?=\s|$)|(?=\n|$))/g)].map(match => {
    const body = match[0].trim();
    const start = match.index + match[0].indexOf(body);
    return { text: body, start, end: start + body.length };
  });
}

function cleanLabel(text) {
  return text.replace(/^(?:The |A |An |Resource Centers )+/i, '').replace(/\s+/g, ' ').trim();
}

function namedPrograms(text) {
  // Capitalized names are recognized structurally; no proper program names are
  // embedded here. Parenthesized acronyms remain part of the literal label.
  const pattern = /\b(?=[A-Z])(?:(?:[A-Z][\p{L}\d'’\-]*(?:\s+|(?=\())|(?:and|for|of|the|to|with|&)\s+|\([^\n)]{1,24}\)\s*)){1,15}(?:Program|Loans?|Fund|Grant|Service|Partnership)(?:\s*\([^\n)]{1,24}\))?(?:\s+program)?\b/gu;
  return [...text.matchAll(pattern)].map(match => ({ label: cleanLabel(match[0]), start: match.index, end: match.index + match[0].length }));
}

function fallbackLabel(hit, body, needs) {
  const section = String(hit.chunk.section ?? '').trim();
  const sourceTitle = String(hit.source.title ?? hit.chunk.title ?? '').trim();
  if (section && section.length <= 110 && !GENERAL_SECTION.test(normalized(section)) && mechanisms(section).length) return section;
  if (/\b(?:program|loans?|fund|grant)\b/.test(normalized(sourceTitle)) && mechanisms(sourceTitle).length) return sourceTitle;
  // Some genuine mechanisms are agency services rather than named programs.
  // Keep a source-local mechanism identity instead of inventing a program name.
  const agency = body.match(/^(.{4,100}?)\s+(?:provides?|offers?|helps?|supports?|builds? and sells?)\b/i)?.[1];
  return agency ? `${cleanLabel(agency)}: ${needs.join(', ')}` : `${section || sourceTitle}: ${needs.join(', ')}`;
}

/** Identify substantive housing mechanisms in one retrieved passage. Offsets are
 * literal positions in chunk.text and can be used to preserve identifying text.
 * The caller remains responsible for jurisdiction, authority and freshness. */
export function recognizeHousingPrograms(hit) {
  const text = hit.chunk.text;
  if (typeof text !== 'string' || text.length < 45 || text.includes(' | ')) return [];
  const names = namedPrograms(text);
  const descriptions = sentenceSpans(text).filter(sentence => {
    const body = normalized(sentence.text);
    if (NAVIGATION.test(body)) return false;
    if (PROCUREMENT.test(body)) return false;
    if (/^(?:seek |when |you (?:are still responsible|must)|must have|applicants should)/.test(body)) return false;
    if (/\b(?:does not|will not|cannot|must not|may not)\b.{0,25}\b(?:pay|assist|provide|offer)\b/.test(body)) return false;
    if (/\b(?:resources|information)\b/.test(body) && /^(?:find|here you will find|this (?:page|guide)|visit)\b/.test(body)) return false;
    if (/\bresources\b.{0,45}\bhelp\b/.test(body) && !/\b(?:loans?|grants?|payment|bills?|provides?|offers?)\b/.test(body)) return false;
    return DESCRIBES_HELP.test(body) && mechanisms(sentence.text).length > 0;
  });
  const programs = [];
  for (const description of descriptions) {
    const localNames = names.filter(name => name.start >= description.start && name.start < description.end);
    const needs = mechanisms(description.text);
    if (!localNames.length) {
      const precedingName = names.findLast(name => name.end <= description.start && description.start - name.end < 200 && mechanisms(name.label).some(need => needs.includes(need)));
      const label = precedingName?.label ?? fallbackLabel(hit, description.text, needs);
      programs.push({ id: `${hit.source.source_id}:${normalized(label)}`, label, needs, start: description.start, end: description.end });
      continue;
    }
    for (const name of localNames) {
      // Named programs with distinct mechanisms in the same sentence retain
      // their own need; otherwise the surrounding description supplies it.
      const nameNeeds = mechanisms(name.label);
      const recognizedNeeds = nameNeeds.length ? nameNeeds : needs;
      programs.push({ id: `${hit.source.source_id}:${normalized(name.label)}`, label: name.label, needs: recognizedNeeds, start: description.start, end: description.end, nameStart: name.start, nameEnd: name.end });
    }
  }
  // An opening sentence can name a program whose financing is explained next.
  // Attach that name to the next description rather than losing it at quotation.
  for (const name of names) {
    if (programs.some(program => normalized(program.label) === normalized(name.label))) continue;
    const next = descriptions.find(sentence => sentence.start >= name.end && sentence.start - name.end < 180);
    if (next) programs.push({ id: `${hit.source.source_id}:${normalized(name.label)}`, label: name.label, needs: mechanisms(name.label).length ? mechanisms(name.label) : mechanisms(next.text), start: name.start, end: next.end, nameStart: name.start, nameEnd: name.end });
  }
  return programs.filter((program, index) => !programs.slice(0, index).some(prior => prior.id === program.id && prior.start === program.start));
}

function coveredBy(program, start, end) {
  return (program.nameStart ?? program.start) >= start && (program.nameEnd ?? Math.min(program.end, program.start + 100)) <= end;
}

function includeContext(text, window, maxLength) {
  const sentences = sentenceSpans(text);
  let { start, end } = window;
  const next = sentences.find(sentence => sentence.start >= end);
  if (next && next.end - start <= maxLength) end = next.end;
  const previous = sentences.findLast(sentence => sentence.end <= start);
  if (previous && end - previous.start <= maxLength) start = previous.start;
  // Adjacent qualifications stay attached to the program description. Keep a
  // contiguous source substring; do not stitch distant caution sentences.
  for (const sentence of sentences.filter(sentence => sentence.start >= end)) {
    if (!/\b(?:must|only|eligible|eligibility|limited|not |cannot|applications?|require|approval|approve)\b/i.test(sentence.text)) break;
    if (sentence.end - start > maxLength) break;
    end = sentence.end;
  }
  return { start, end };
}

function quoteWindow(text, programs, maxLength) {
  if (text.length <= maxLength) return { start: 0, end: text.length };
  const relevantStart = Math.min(...programs.map(program => program.start));
  const relevantEnd = Math.max(...programs.map(program => program.end));
  if (relevantEnd - relevantStart <= maxLength) return includeContext(text, { start: relevantStart, end: relevantEnd }, maxLength);
  let best;
  for (const program of programs) {
    const focus = (program.nameEnd ?? program.start) - program.start > maxLength ? program.nameStart : program.start;
    const start = Math.max(0, Math.min(focus, text.length - maxLength));
    const end = Math.min(text.length, start + maxLength);
    const count = programs.filter(item => coveredBy(item, start, end)).length;
    if (!best || count > best.count) best = { start, end, count };
  }
  const lastSentence = sentenceSpans(text).findLast(sentence => sentence.end <= best.end && sentence.end > best.start);
  if (lastSentence && programs.filter(program => coveredBy(program, best.start, lastSentence.end)).length === best.count) best.end = lastSentence.end;
  return includeContext(text, { start: best.start, end: best.end }, maxLength);
}

function explicitlyIncompatible(question, text) {
  const query = normalized(question);
  const body = normalized(text).replace(/\b(?:cannot|can not|does not|will not)\s+(?:pay|cover|assist with|include)\b[^.!?]*/g, '');
  const water = /\b(?:water|sewer|wastewater)\b/;
  const energy = /\b(?:electric(?:ity)?|energy|power|gas|heating)\b/;
  if (energy.test(query) && !water.test(query) && water.test(body) && !energy.test(body)) return true;
  if (water.test(query) && !energy.test(query) && energy.test(body) && !water.test(body)) return true;
  if (/\b(?:children|kids|baby|babies|toddler)\b/.test(query) && /\b(?:adults? only|only (?:for )?adults?|no (?:minor|child)|children (?:are )?not (?:accepted|permitted|eligible))\b/.test(body)) return true;
  return false;
}

/** Retain different housing programs even when they share a page. Inputs must
 * already have passed the retrieval guardrails. Return exact quotation windows,
 * never rewritten excerpts or an eligibility determination. */
export function programCandidates(question, hits, { limit = 8, maxQuoteLength = 720 } = {}) {
  const requested = new Set(housingNeeds(question));
  const broad = !requested.size && /\b(?:housing|programs|resources|assistance)\b/.test(normalized(question)) && !/\b(?:not|no|dont|don t|without)\b/.test(normalized(question));
  if (!requested.size && !broad) return [];
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const candidates = [];
  const queryNames = namedPrograms(String(question)).map(name => normalized(name.label));
  const boundedLength = Math.max(100, Math.min(720, Number.isFinite(maxQuoteLength) ? Math.floor(maxQuoteLength) : 720));
  for (const hit of hits) {
    if (explicitlyIncompatible(question, hit.chunk.text)) continue;
    const recognized = recognizeHousingPrograms(hit);
    const programs = recognized.filter(program => (broad || program.needs.some(need => requested.has(need))) &&
      (!queryNames.length || queryNames.some(name => normalized(program.label).includes(name))));
    if (!programs.length) continue;
    const programQuote = quoteWindow(hit.chunk.text, programs, boundedLength);
    const covered = programs.filter(program => coveredBy(program, programQuote.start, programQuote.end));
    if (!covered.length) continue;
    candidates.push({ ...hit, programs: covered, programQuote });
  }
  const selected = [];
  const seenPrograms = new Set();
  const seenChunks = new Set();
  const coveredNeeds = new Set();
  while (selected.length < Math.floor(limit)) {
    const remaining = candidates.filter(hit => !seenChunks.has(hit.chunk.id) && hit.programs.some(program => !seenPrograms.has(program.id)));
    if (!remaining.length) break;
    // Give each expressed need a chance before extra programs for one need fill
    // the evidence budget. Ties retain retrieval order.
    const newNeeds = hit => new Set(hit.programs.flatMap(program => program.needs).filter(need => requested.has(need) && !coveredNeeds.has(need))).size;
    remaining.sort((a, b) => newNeeds(b) - newNeeds(a));
    const hit = remaining[0];
    selected.push(hit);
    seenChunks.add(hit.chunk.id);
    for (const program of hit.programs) {
      seenPrograms.add(program.id);
      for (const need of program.needs) coveredNeeds.add(need);
    }
  }
  return selected;
}
