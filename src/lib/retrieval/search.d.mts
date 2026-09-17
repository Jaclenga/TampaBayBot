import type { Source, Chunk } from '../core/answer.mjs';
import type { QuestionRoute } from '../core/router.mjs';
import type { QueryPlan } from '../core/query-plan.mjs';
export const ANSWER_RETRIEVAL_LIMIT: 15;
export interface RetrievalHit { source: Source; chunk: Chunk; score: number; matches: number; stale: boolean; detailScore: number }
export { requestedDetailScore, requestedDetails } from './details.mjs';
export function tokens(text: unknown, expand?: boolean): string[];
export function isInstructionText(text: unknown): boolean;
export function isAuthoritative(source: Partial<Source>): boolean;
export function sourceIsStale(source: Partial<Source>, chunk?: Partial<Chunk>, now?: Date): boolean;
export interface RetrievalRejection {
  chunkId: string;
  sourceId: string;
  stage: 'corpus_scope' | 'evidence_eligibility' | 'candidate_generation';
  reason: 'outside_jurisdiction' | 'unregistered_source' | 'source_mismatch' | 'empty_text' | 'untrusted_instructions' | 'unusable_evidence' | 'outside_topic' | 'no_matching_signal';
}
export interface RetrievalDiagnostics {
  inputCount: number;
  scopedCount: number;
  eligibleCount: number;
  candidateCount: number;
  rankedCount: number;
  returnedCount: number;
  rejected: RetrievalRejection[];
  unmatched: RetrievalRejection[];
  candidates: { chunkId: string; sourceId: string; lexicalScore: number; preferenceScore: number; entityScore: number; matches: number }[];
  ranked: { chunkId: string; sourceId: string; rank: number; score: number; stale: boolean; detailScore: number; returned: boolean }[];
}
export function retrieve(question: string, options: {
  sources: Source[]; chunks: Chunk[]; now?: Date; limit?: number;
} & ({ route: QuestionRoute; queryPlan?: QueryPlan } | { queryPlan: QueryPlan; route?: QuestionRoute })): {
  hits: RetrievalHit[]; quarantined: string[]; diagnostics: RetrievalDiagnostics;
};
