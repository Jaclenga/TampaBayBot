import { intentText } from './normalize.mjs';
import { detectLocation } from './location.mjs';
import { detectIntent } from './intent.mjs';
import { detectDecision } from './decision.mjs';

/** Resolve independent signals once for both QueryPlan and legacy routing. */
export function analyzeQuestion(question, { jurisdictionId = 'tampa-bay' } = {}) {
  const text = intentText(question);
  const location = detectLocation(text, jurisdictionId);
  const intent = detectIntent(text);
  const decision = detectDecision(text, { scores: intent.scores, startsWithAddress: location.startsWithAddress });
  const category = intent.subjectCategory === 'navigation' && location.startsWithAddress && !intent.directNavigation
    ? 'zoning' : intent.category;
  const subjectCategory = intent.subjectCategory === 'navigation' ? category : intent.subjectCategory;
  const route = {
    category,
    subjectCategory,
    needsAddress: location.geographic && ['zoning', 'development', 'permitting'].includes(subjectCategory),
    hasAddress: location.hasAddress,
    outOfScope: decision.outOfScope,
    outsideCoverage: location.outsideCoverage,
    officialJudgment: decision.consequentialDecision,
    normalized: text,
    ...location.jurisdiction,
  };
  return { text, location, intent, decision, route };
}
