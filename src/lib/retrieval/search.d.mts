import type { Source, Chunk } from '../core/answer.mjs';
import type { QuestionRoute } from '../core/router.mjs';
export interface RetrievalHit { source: Source; chunk: Chunk; score: number; matches: number; stale: boolean }
export function tokens(text: unknown, expand?: boolean): string[];
export function isInstructionText(text: unknown): boolean;
export function isAuthoritative(source: Partial<Source>): boolean;
export function sourceIsStale(source: Partial<Source>, chunk?: Partial<Chunk>, now?: Date): boolean;
export function retrieve(question: string, options: { sources: Source[]; chunks: Chunk[]; route: QuestionRoute; now?: Date; limit?: number }): { hits: RetrievalHit[]; quarantined: string[] };
