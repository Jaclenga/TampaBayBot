import { sourceCoversJurisdiction } from '../coverage.mjs';

/** Registry membership and explicit jurisdiction coverage are mandatory. */
export function scopeCorpus(sources, chunks, route) {
  const registry = new Map(sources.map(source => [source.source_id, source]));
  const scopedRegistry = new Map(sources
    .filter(source => sourceCoversJurisdiction(source, route.jurisdictionId ?? 'tampa-bay'))
    .map(source => [source.source_id, source]));
  const documents = [];
  const rejected = [];
  for (const chunk of chunks) {
    const source = scopedRegistry.get(chunk.source_id);
    if (source) documents.push({ source, chunk });
    else rejected.push({
      chunkId: chunk.id, sourceId: chunk.source_id, stage: 'corpus_scope',
      reason: registry.has(chunk.source_id) ? 'outside_jurisdiction' : 'unregistered_source',
    });
  }
  return { sources: [...scopedRegistry.values()], documents, rejected };
}

export function sourceMatchesTopic(source, route) {
  const topic = route.subjectCategory ?? route.category;
  return !source.categories?.length || topic === 'navigation' || source.categories.includes(topic);
}
