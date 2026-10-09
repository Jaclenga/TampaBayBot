import type { answerWithGuardrails } from '../guardrails/navigator.mjs';
import type { ConversationContext } from './conversation.mjs';
import type { ResidentAnswer } from './answer.mjs';
import type { CrisisPlan, CrisisResource } from '../housing/crisis.mjs';
export function answerResidentQuestion(question: string, options?: Parameters<typeof answerWithGuardrails>[1] & {conversation?: unknown; locale?: 'en' | 'es'; crisisResources?: CrisisResource[]}): Promise<ResidentAnswer & {conversation: ConversationContext | null; conversationUsed: boolean; guardrails: {version: '1'; status: 'passed' | 'model_skipped'}; crisisPlan?: CrisisPlan} >;
