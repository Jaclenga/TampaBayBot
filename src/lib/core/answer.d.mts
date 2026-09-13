import type { JurisdictionId } from '../coverage.mjs';

export type ServiceCategory = 'housing' | 'zoning' | 'permitting' | 'development' | 'navigation';
export type AnswerStatus = 'answered' | 'insufficient_evidence' | 'conflicting_evidence' | 'potentially_outdated' | 'needs_location' | 'needs_jurisdiction' | 'official_judgment' | 'out_of_scope' | 'unavailable_source' | 'missing_geographic_coverage';
export interface Source {
  source_id: string; title: string; agency: string; canonical_url: string;
  authoritative_status: string; source_type?: string; categories?: string[];
  jurisdiction_ids?: string[];
  keywords?: string[]; retrieval_date?: string | null; source_updated_date?: string | null;
  refresh_days?: number; topic_id?: string; availability?: string; last_fetch_status?: string;
  next_step?: { label: string; url: string }; [key: string]: unknown;
}
export interface Chunk {
  id: string; source_id: string; text: string; title?: string; section?: string | null;
  page?: number | null; record_id?: string | null; layer?: string | null;
  retrieved_at?: string; content_hash?: string; url?: string; [key: string]: unknown;
}
export interface Evidence {
  language?: 'en' | 'es' | 'und';
  id: string; chunk_id: string; source_id: string; title: string; agency: string;
  quote: string; section: string | null; page: number | null; record_id: string | null;
  layer: string | null; url: string; retrieved_at: string | null;
  source_updated_date: string | null; authoritative_status: string; stale: boolean;
  content_hash: string | null;
}
export interface ResidentAnswer {
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
