import type { JurisdictionId } from '../coverage.mjs';
import type { ServiceCategory } from './routing/types.mjs';
import type { Source, Chunk } from '../domain/types.mjs';
export type { Source, Chunk } from '../domain/types.mjs';

export type { ServiceCategory } from './routing/types.mjs';
export type AnswerStatus = 'answered' | 'insufficient_evidence' | 'conflicting_evidence' | 'potentially_outdated' | 'needs_location' | 'needs_jurisdiction' | 'official_judgment' | 'out_of_scope' | 'unavailable_source' | 'missing_geographic_coverage';
export interface Evidence {
  language?: 'en' | 'es' | 'und';
  id: string; chunk_id: string; source_id: string; title: string; agency: string;
  quote: string; section: string | null; page: number | null; record_id: string | null;
  layer: string | null; url: string; retrieved_at: string | null;
  source_updated_date: string | null; authoritative_status: string; stale: boolean;
  content_hash: string | null;
}
export interface ResidentAnswer {
  coverage?: {
    kind: 'retrieved_resources'; exhaustive: false;
    jurisdictionId: JurisdictionId; category: ServiceCategory;
    registrySourceCount: number; citedSourceCount: number; statement: string;
  };
  requiredEvidenceIds?: string[];
  conversation?: import('./conversation.mjs').ConversationContext | null;
  conversationUsed?: boolean;
  generation?: {
    mode: 'extractive' | 'llm';
    provider: 'none' | 'ollama' | 'openai-compatible' | 'invalid';
    status: 'disabled' | 'used' | 'skipped' | 'fallback';
    reason?: string;
  };
  category: ServiceCategory; status: AnswerStatus; query: string; answer: string;
  meaning: string | null; evidence: Evidence[];
  nextSteps: {label: string; url: string; agency: string}[];
  warnings: string[]; needsAddress: boolean; situation?: string;
  jurisdictionId: JurisdictionId; jurisdictionLabel: string; needsJurisdiction: boolean;
  requirementsToVerify?: string[];
}
export function answerQuestion(question: string, options?: {sources?: Source[]; chunks?: Chunk[]; now?: Date | string | number; jurisdictionId?: JurisdictionId}): ResidentAnswer;
