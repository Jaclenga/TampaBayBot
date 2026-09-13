import { sourceIsStale } from '../retrieval/search.mjs';

export function corpusReadiness(sources, chunks, now = new Date()) {
  const bySource = new Map(sources.map(source => [source.source_id, source]));
  const totals = { sources: sources.length, chunks: chunks.length, fresh_chunks: 0, stale_chunks: 0,
    unavailable_sources: sources.filter(source => source.status !== 'available' && source.ingestion_method !== 'live-query-only').length,
    live_query_sources: sources.filter(source => source.ingestion_method === 'live-query-only').length,
    sources_without_evidence: 0, invalid_chunks: 0 };
  const present = new Set();
  for (const chunk of chunks) {
    const source = bySource.get(chunk.source_id);
    if (!source || typeof chunk.text !== 'string' || !chunk.text.trim()) { totals.invalid_chunks++; continue; }
    present.add(source.source_id);
    if (source.status !== 'available') continue;
    if (sourceIsStale(source, chunk, now)) totals.stale_chunks++;
    else totals.fresh_chunks++;
  }
  totals.sources_without_evidence = sources.filter(source => source.ingestion_method !== 'live-query-only' && !present.has(source.source_id)).length;
  const reasons = [];
  if (!chunks.length) reasons.push('no_evidence');
  else if (!totals.fresh_chunks) reasons.push('no_fresh_evidence');
  if (totals.stale_chunks) reasons.push('stale_evidence');
  if (totals.unavailable_sources) reasons.push('unavailable_sources');
  if (totals.sources_without_evidence) reasons.push('missing_source_evidence');
  if (totals.invalid_chunks) reasons.push('invalid_evidence');
  return { ready: reasons.length === 0, status: !chunks.length ? 'no_evidence' : reasons.length ? 'degraded' : 'ready', ...totals, reasons,
    scope: 'Snapshot availability and retrieval-age policy; not live publisher truth or a GIS uptime check.' };
}

export function readinessResponse(corpus, operations, version, generation) {
  const ready = corpus.ready && operations.ready;
  return { status: ready ? 'ready' : corpus.status === 'no_evidence' ? 'no_evidence' : 'degraded',
    ready, version, generation, sources: corpus.sources, chunks: corpus.chunks, corpus, operations };
}
