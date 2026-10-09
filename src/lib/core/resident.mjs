import { answerWithGuardrails } from '../guardrails/navigator.mjs';
import { resolveConversation, nextConversation } from './conversation.mjs';
import { localizeAnswer } from '../i18n/answer.mjs';
import housingDirectory from '../../../pages-demo/src/housing-resources.json' with { type: 'json' };
import { buildCrisisPlan, inferCrisisInput } from '../housing/crisis.mjs';

/** Stateless entrypoint shared by HTTP and self-contained workflow tests. */
export async function answerResidentQuestion(question, { conversation, locale = 'en', crisisResources = housingDirectory.resources, ...options } = {}) {
  if (!['en', 'es'].includes(locale)) throw new TypeError('Unsupported interface language.');
  const resolved = resolveConversation(question, { conversation, jurisdictionId: options.jurisdictionId, sources: options.sources });
  const answer = await answerWithGuardrails(resolved.question, { ...options, jurisdictionId: resolved.jurisdictionId });
  const response = {
    ...answer,
    query: question,
    conversation: nextConversation(resolved.question, answer, resolved.turns, options.sources),
    conversationUsed: resolved.used,
    evidence: answer.evidence.map(item => {
      const source = options.sources?.find(source => source.source_id === item.source_id);
      const language = ['en', 'es'].includes(source?.language) ? source.language : 'und';
      return { ...item, language };
    }),
  };
  // Use the route's resolved jurisdiction, including its conflict state. The
  // picker alone may disagree with a place named in the question.
  const crisisInput = inferCrisisInput(resolved.question, {
    jurisdictionId: answer.needsJurisdiction ? 'tampa-bay' : answer.jurisdictionId,
  });
  if (crisisInput) response.crisisPlan = buildCrisisPlan(crisisInput, crisisResources, { locale, now: options.now ?? new Date() });
  return localizeAnswer(response, locale);
}
