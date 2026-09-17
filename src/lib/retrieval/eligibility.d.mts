import type { Source, Chunk } from '../core/answer.mjs';
import type { QuestionRoute } from '../core/router.mjs';
import type { RetrievalRejection } from './search.mjs';

export function usableChunk(chunk: Chunk): boolean;
export function isInstructionText(text: unknown): boolean;
export function isAuthoritative(source: Partial<Source>): boolean;
export function sourceIsStale(source: Partial<Source>, chunk?: Partial<Chunk>, now?: Date): boolean;
export function evidenceSafetyReason(source?: Partial<Source> | null, chunk?: Partial<Chunk> | null): 'source_mismatch' | 'empty_text' | 'untrusted_instructions' | null;
export function eligibleEvidence(documents: { source: Source; chunk: Chunk }[], route: QuestionRoute): {
  documents: { source: Source; chunk: Chunk }[]; rejected: RetrievalRejection[]; quarantined: string[];
};
