import { analyzeQuestion } from './routing/resolve.mjs';

export { normalizeQuestion, intentText } from './routing/normalize.mjs';

/** Compatibility facade for consumers that only need the routing decision. */
export function routeQuestion(question, options = {}) {
  return analyzeQuestion(question, options).route;
}
