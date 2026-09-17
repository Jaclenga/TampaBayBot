import { SOURCE_POLICIES, GUIDANCE_PRIORITIES } from './source-policies.mjs';

// JSON registry overrides use literal text, never executable expressions.
function matches(pattern, text) {
  return pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(text)
    : typeof pattern === 'string' && text.toLowerCase().includes(pattern.toLowerCase());
}

export function answerPolicy(source) {
  return source.answer_policy ?? SOURCE_POLICIES[source.source_id] ?? {};
}

export function classifyAnswerSections(source, chunk) {
  if (chunk.source_id !== source.source_id) return [];
  return (answerPolicy(source).sections ?? []).filter(section => matches(section.pattern, chunk.text ?? '')).map(section => section.id);
}

export function preferredSections(source, plan) {
  const policy = answerPolicy(source);
  const preference = policy.preferredSections?.find(rule => !rule.when || matches(rule.when, plan.normalizedQuery));
  return preference?.sections ?? policy.sections?.slice(0, 1).map(section => section.id) ?? [];
}

export function supplementalSections(source, plan, selected) {
  return (answerPolicy(source).supplementalSections ?? []).filter(rule =>
    (!rule.selectedOnly || selected) && (!rule.subject || rule.subject === plan.subjectCategory) &&
    (!rule.when || matches(rule.when, plan.normalizedQuery))).map(rule => rule.section);
}

export function guidancePriorities(plan) {
  const ids = [];
  for (const rule of GUIDANCE_PRIORITIES) {
    if (rule.jurisdiction !== plan.route.jurisdictionId || rule.subject !== plan.subjectCategory ||
        (rule.category && rule.category !== plan.intent) || (rule.when && !matches(rule.when, plan.normalizedQuery)) ||
        (rule.unless && matches(rule.unless, plan.normalizedQuery))) continue;
    ids.push(...rule.sources);
    if (rule.terminal) break;
  }
  return [...new Set(ids)];
}
