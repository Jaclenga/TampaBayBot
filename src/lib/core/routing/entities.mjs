import { normalizeQuestion } from './normalize.mjs';
import { sourceCoversJurisdiction } from '../../coverage.mjs';

const SUBJECTS = new Set(['housing', 'zoning', 'permitting', 'development']);

/** A recognized name can supply a missing subject, never resolve ambiguous
 * domains or extend the jurisdiction covered by its registry record. */
export function detectEntitySubject(entities, sources, jurisdictionId) {
  const namedSources = new Set(entities.filter(entity => entity.type === 'program' && entity.sourceId).map(entity => entity.sourceId));
  const subjects = new Set(sources.filter(source => namedSources.has(source.source_id) && sourceCoversJurisdiction(source, jurisdictionId))
    .flatMap(source => Array.isArray(source.categories) ? source.categories.filter(category => SUBJECTS.has(category)) : []));
  return subjects.size === 1 ? [...subjects][0] : null;
}

function includesPhrase(text, value) {
  const clean = value => normalizeQuestion(value).replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const phrase = clean(value);
  return phrase.length > 1 && ` ${clean(text)} `.includes(` ${phrase} `);
}

/** Registry names identify requested entities, not verified facts or eligibility.
 * A new program can supply entity_aliases without changing routing code. */
export function detectEntities(question, { sources = [], addresses = [] } = {}) {
  const original = String(question ?? '');
  const text = normalizeQuestion(original);
  const entities = addresses.map(value => ({ type: 'address', value }));
  for (const source of sources) {
    if (!source.program_id && !source.entity_aliases && !/\b(?:program|grant|loan|fund|assistance)\b/i.test(source.title ?? '')) continue;
    const aliases = [
      ...(Array.isArray(source.entity_aliases) ? source.entity_aliases : []),
      source.title,
      ...String(source.title ?? '').matchAll(/\(([A-Z][A-Z\d-]{1,11})\)/g),
    ].map(value => Array.isArray(value) ? value[1] : value).filter(value => typeof value === 'string');
    const matched = aliases.find(alias => includesPhrase(text, alias));
    if (!matched) continue;
    entities.push({
      type: 'program',
      value: matched,
      programId: source.program_id ?? source.topic_id ?? source.source_id,
      sourceId: source.source_id,
    });
  }
  for (const match of original.matchAll(/\b(?:[A-Z][\p{L}\d'-]*\s+){1,8}(?:Program|Grant|Fund|Loan)\b/gu)) {
    if (!entities.some(entity => entity.type === 'program' && includesPhrase(normalizeQuestion(match[0]), entity.value)))
      entities.push({ type: 'program', value: match[0] });
  }
  for (const match of text.matchAll(/\b(?:rm-?\d+|rs-?\d+|nt-?\d+|ns-?\d+|nsm-?\d+|ldr|lmdr|mdr|hdr|mhdr)\b/g))
    entities.push({ type: 'zoning_designation', value: match[0].toUpperCase() });
  return entities.filter((entity, index) => !entities.slice(0, index).some(prior =>
    prior.type === entity.type && prior.value === entity.value && prior.sourceId === entity.sourceId));
}
