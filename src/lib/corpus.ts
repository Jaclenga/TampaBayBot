import snapshot from "@/data/corpus.json";
import { FACT_TYPES } from './domain/facts.mjs';
import type { Chunk, EvidenceFact } from './domain/types.mjs';
// JSON imports widen enum strings. Check those annotations once at the bundle
// boundary; do not cast a populated corpus to the empty-release inferred type.
type JsonFact = Omit<EvidenceFact, 'factType' | 'confidence'> & {factType: string; confidence: string};
type JsonChunk = Pick<Chunk, 'id' | 'source_id' | 'text' | 'title' | 'section' | 'page' | 'record_id' | 'layer' | 'retrieved_at' | 'content_hash' | 'url' | 'answer_sections' | 'locator'> & {facts?: JsonFact[]};
function assertFactAnnotations(values: JsonChunk[]): asserts values is Chunk[] {
  for (const chunk of values) for (const fact of chunk.facts ?? []) {
    if (fact.confidence !== 'explicit' || !FACT_TYPES.some(type => type === fact.factType))
      throw new Error('Invalid bundled evidence fact annotation.');
  }
}
const bundledChunks: JsonChunk[] = snapshot.chunks;
assertFactAnnotations(bundledChunks);
// One immutable generation supplies both registry and passages to every route.
export const sources = snapshot.sources;
export const chunks = bundledChunks;
export const corpusGeneration = snapshot.generation;
export const demoMode = sources.some((source) => "demo" in source && source.demo === true);
