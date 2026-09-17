import type { Chunk, Source, FactType, EvidenceFact } from './types.mjs';
export type { FactType, EvidenceFact } from './types.mjs';
export const FACT_TYPES: readonly FactType[];
export function startsAtSentenceBoundary(previousText: string, text: string): boolean;
export function deriveFacts(chunk: Chunk, source: Source): EvidenceFact[];
export function factsForChunk(chunk: Chunk, source: Source): EvidenceFact[];
export function factAnnotationsMatch(chunk: Chunk, source: Source): boolean;
