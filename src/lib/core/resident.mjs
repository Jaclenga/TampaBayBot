import { answerWithGuardrails } from '../guardrails/navigator.mjs';
import { resolveConversation, nextConversation } from './conversation.mjs';
import { localizeAnswer } from '../i18n/answer.mjs';

/** Stateless entrypoint shared by HTTP and self-contained workflow tests. */
export async function answerResidentQuestion(question, { conversation, locale = 'en', ...options } = {}) {
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
  return localizeAnswer(response, locale);
}
