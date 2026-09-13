import type { answerWithGuardrails } from '../guardrails/navigator.mjs';
import type { ConversationContext } from './conversation.mjs';
import type { ResidentAnswer } from './answer.mjs';
export function answerResidentQuestion(question: string, options?: Parameters<typeof answerWithGuardrails>[1] & {conversation?: unknown; locale?: 'en' | 'es'}): Promise<ResidentAnswer & {conversation: ConversationContext | null; conversationUsed: boolean; guardrails: {version: '1'; status: 'passed' | 'model_skipped'}} >;
