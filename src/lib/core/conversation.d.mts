import type { ResidentAnswer, Source, ServiceCategory } from './answer.mjs';
import type { JurisdictionId } from '../coverage.mjs';
export interface ConversationContext {
  version: 1; topic: ServiceCategory; housingNeed: 'urgent' | 'homelessness' | 'eviction' | 'arrears' | 'repair' | 'buy' | 'rental' | 'rent' | 'general';
  sourceId: string | null; jurisdictionId: JurisdictionId; awaitingJurisdiction: boolean; turns: number;
}
export function readConversation(value: unknown, sources?: Source[]): ConversationContext | null;
export function resolveConversation(question: string, options?: { conversation?: unknown; jurisdictionId?: JurisdictionId; sources?: Source[] }): {question: string; jurisdictionId: JurisdictionId; used: boolean; turns: number};
export function nextConversation(question: string, answer: ResidentAnswer, turns?: number, sources?: Source[]): ConversationContext | null;
