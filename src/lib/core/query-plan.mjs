import { analyzeQuestion } from './routing/resolve.mjs';
import { detectEntities, detectEntitySubject } from './routing/entities.mjs';
import { detectRequestedFacts } from './routing/requested-facts.mjs';

/** Shared domain request. Resource hints never establish parcel boundaries,
 * program eligibility, or source evidence. Conversation resolution runs before
 * this function; originalQuery can retain the resident's unexpanded question. */
export function createQueryPlan(question, { jurisdictionId = 'tampa-bay', sources = [], originalQuery = question } = {}) {
  const { text, location, intent, decision, route } = analyzeQuestion(question, { jurisdictionId });
  const entities = detectEntities(question, { sources, addresses: location.addresses });
  // A scoped registry entity may fill a missing lexical signal, but it cannot
  // override an explicitly excluded request or extend geographic coverage.
  if (route.subjectCategory === 'navigation' && !decision.explicitOutOfScope && !route.outsideCoverage) {
    const subject = detectEntitySubject(entities, sources, route.jurisdictionId);
    if (subject) {
      route.subjectCategory = subject;
      route.outOfScope = false;
      route.category = intent.directNavigation ? 'navigation' : subject;
      route.needsAddress = location.geographic && ['zoning', 'development', 'permitting'].includes(subject);
    }
  }
  return {
    originalQuery: String(originalQuery ?? ''),
    query: String(question ?? ''),
    normalizedQuery: text,
    intent: route.category,
    subjectCategory: route.subjectCategory,
    jurisdiction: location.jurisdiction,
    geography: {
      hasAddress: route.hasAddress,
      needsAddress: route.needsAddress,
      addresses: location.addresses,
      outsideCoverage: route.outsideCoverage,
    },
    entities,
    requestedFacts: detectRequestedFacts(question, text),
    consequentialDecision: route.officialJudgment,
    route,
  };
}
