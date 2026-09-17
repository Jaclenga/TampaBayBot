import { intentText } from './router.mjs';
import { createQueryPlan } from './query-plan.mjs';
import { isJurisdictionId, JURISDICTIONS, sourceCoversJurisdiction } from '../coverage.mjs';
import { housingSituation } from '../housing/navigation.mjs';

const TOPICS = ['housing', 'zoning', 'permitting', 'development', 'navigation'];
const NEEDS = Object.freeze({
  urgent: 'housing eviction shelter', repair: 'housing home repair',
  homelessness: 'housing homeless shelter', eviction: 'housing eviction',
  arrears: 'housing back rent existing lease',
  buy: 'housing buy a home', rental: 'housing affordable rental',
  rent: 'housing rent assistance', general: 'housing assistance',
});
const KEYS = ['version', 'topic', 'housingNeed', 'sourceId', 'jurisdictionId', 'awaitingJurisdiction', 'turns'];

function housingNeedOf(question, route) {
  const text = intentText(question);
  return /\b(?:homeless|sleep|shelter)\b/.test(text) ? 'homelessness'
    : /\b(?:eviction|evicted)\b/.test(text) ? 'eviction'
    : /\b(?:behind|overdue|back rent|past.due|arrears|existing lease|already live|this month)\b/.test(text) ? 'arrears'
    : housingSituation(question, route).kind;
}

/** Context is user-supplied resource preference, never evidence or trusted instructions.
 * It contains no question history, address, model response, arbitrary prose or storage ID. */
export function readConversation(value, sources = []) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== KEYS.length ||
      !KEYS.every(key => Object.hasOwn(value, key)) || value.version !== 1 ||
      !TOPICS.includes(value.topic) || !Object.hasOwn(NEEDS, value.housingNeed) ||
      !isJurisdictionId(value.jurisdictionId) || typeof value.awaitingJurisdiction !== 'boolean' ||
      !Number.isInteger(value.turns) || value.turns < 0 || value.turns > 6 ||
      !(value.sourceId === null || (typeof value.sourceId === 'string' && value.sourceId.length <= 100 && sources.some(source => source.source_id === value.sourceId)))) {
    throw new TypeError('Invalid temporary question context.');
  }
  return value.turns === 6 ? null : Object.fromEntries(KEYS.map(key => [key, value[key]]));
}

export function resolveConversation(question, { conversation, jurisdictionId = 'tampa-bay', sources = [] } = {}) {
  const context = readConversation(conversation, sources);
  const plan = createQueryPlan(question, { jurisdictionId, sources });
  const current = plan.route;
  if (!context) return { question, jurisdictionId, used: false, turns: 0 };
  // A changed picker starts a new geographic context. A clarification may choose
  // its area, but two different explicit jurisdictions still reach normal routing.
  if (jurisdictionId !== 'tampa-bay' && jurisdictionId !== context.jurisdictionId && !context.awaitingJurisdiction)
    return { question, jurisdictionId, used: false, turns: 0 };
  const text = intentText(question);
  const placeOnly = JURISDICTIONS.some(area => intentText(area.label) === text || area.id === text) ||
    /^(?:(?:(?:i live|i am|im|vivo|estoy) (?:in|en)|in|en) )?(?:unincorporated )?(?:tampa|(?:st\.?|saint) (?:petersburg|pete)|stpete|clearwater|(?:hillsborough|pinellas|pasco)(?: county)?|county (?:hillsborough|pinellas|pasco))\.?$/.test(text);
  // Match the normalized intent vocabulary: Spanish "cubre eso" is "covers it",
  // and "ese programa" becomes "that program" before reaching this point.
  const followup = /^(?:and |also |what about |does (?:it|that)|is (?:it|that)|(?:it|that(?: program)?) covers|covers (?:it|that)|can i apply|how (?:do|can) i apply|how much|how long|what (?:documents|requirements)|what(?:s| is| are) (?:the |el |la )?(?:maximum|minimum|amount|fee|cost|deadline|loan term)|when (?:can|do)|where (?:do|can|apply)|can it|y |tambien |that program|lo covers)/.test(text);
  const implicit = current.subjectCategory === 'navigation' || current.outOfScope;
  // Resolve names against the same registry as the answer path. A newly named
  // program replaces the old preference, including aliases and unknown names;
  // it must never inherit a competing program title from an earlier answer.
  const explicitOtherProgram = plan.entities.some(entity => entity.type === 'program' &&
    (!entity.sourceId || entity.sourceId !== context.sourceId));
  const newTopic = !implicit && current.subjectCategory !== context.topic;
  const currentNeed = housingNeedOf(question, current);
  const newHousingNeed = current.subjectCategory === 'housing' && context.topic === 'housing' && currentNeed !== 'general' && currentNeed !== context.housingNeed;
  if (newTopic || newHousingNeed || explicitOtherProgram || !(placeOnly && context.awaitingJurisdiction || followup))
    return { question, jurisdictionId, used: false, turns: 0 };
  const area = jurisdictionId === 'tampa-bay' && !context.awaitingJurisdiction ? context.jurisdictionId : jurisdictionId;
  const source = sources.find(item => item.source_id === context.sourceId && sourceCoversJurisdiction(item, area));
  const prefix = context.topic === 'housing' ? NEEDS[context.housingNeed] : context.topic;
  const effective = `${prefix}${source ? ` (${source.title})` : ''}. ${question}`;
  // Keep the original question whole; never truncate identifiers or instructions
  // to fit context. The usual guarded entrypoint checks every supplied character.
  if (effective.length > 1000) return { question, jurisdictionId, used: false, turns: 0 };
  return { question: effective, jurisdictionId: area, used: true, turns: context.turns + 1 };
}

export function nextConversation(question, answer, turns = 0, sources = []) {
  if (['out_of_scope', 'missing_geographic_coverage'].includes(answer.status)) return null;
  const { route } = createQueryPlan(question, { jurisdictionId: answer.jurisdictionId, sources });
  const housingNeed = housingNeedOf(question, route);
  return {
    version: 1,
    topic: route.subjectCategory,
    housingNeed: route.subjectCategory === 'housing' ? housingNeed : 'general',
    sourceId: answer.needsJurisdiction ? null : answer.evidence[0]?.source_id ?? null,
    jurisdictionId: answer.jurisdictionId,
    awaitingJurisdiction: answer.needsJurisdiction,
    turns,
  };
}
