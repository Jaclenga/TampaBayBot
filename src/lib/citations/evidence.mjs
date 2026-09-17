import { tokens } from '../retrieval/tokens.mjs';
import { isAuthoritative, sourceIsStale, evidenceSafetyReason } from '../retrieval/eligibility.mjs';
import { requestedDetailScore } from '../retrieval/details.mjs';
import { factsForChunk } from '../domain/facts.mjs';

export function safeSourceUrl(candidate, canonical) {
  try {
    const baseline = new URL(canonical);
    if (baseline.protocol !== 'https:') return null;
    const url = new URL(candidate ?? canonical, canonical);
    return url.protocol === 'https:' && url.hostname === baseline.hostname ? url.href : baseline.href;
  } catch { return null; }
}

/** Return a literal source substring. Never rewrite, stitch, or invent a quotation. */
export function selectQuote(text, question, maxLength = 720) {
  if (text.length <= maxLength) return text.trim();
  const query = new Set(tokens(question, true));
  const sentences = [...text.matchAll(/[^.!?\n]+(?:[.!?](?=\s|$)|$)/g)].map(match => ({ text: match[0].trim(), index: match.index + match[0].indexOf(match[0].trim()) }));
  if (!sentences.length) return text.slice(0, maxLength).trim();
  const scored = sentences.map(sentence => ({ ...sentence, score: tokens(sentence.text).reduce((total, token) => total + (query.has(token) ? 1 : 0), 0) + (/not (?:currently )?accepting|closed|online only|move.in|paused/i.test(sentence.text) ? 1 : 0) }));
  scored.sort((a, b) => requestedDetailScore(question, b.text) - requestedDetailScore(question, a.text) || b.score - a.score || a.index - b.index);
  const selected = scored[0];
  const next = sentences.find(sentence => sentence.index > selected.index);
  const end = next && next.text.split(/\s+/).length >= 5 && next.index + next.text.length - selected.index <= maxLength ? next.index + next.text.length : selected.index + selected.text.length;
  return text.slice(selected.index, Math.min(end, selected.index + maxLength)).trim();
}

/** Keep the exact statement used to establish a fact attached to its citation. */
export function withFactEvidence(hit, fact) {
  const { source, chunk } = hit;
  if (evidenceSafetyReason(source, chunk) || fact?.sourceId !== source.source_id ||
      fact.evidenceChunkId !== chunk.id || typeof fact.quote !== 'string' || !fact.quote.trim() || fact.quote.length > 720) return null;
  const start = chunk.text.indexOf(fact.quote);
  if (start < 0) return null;
  return { ...hit, evidenceQuote: { start, end: start + fact.quote.length } };
}

export function makeEvidence(hit, question, index, now = new Date()) {
  const { source, chunk } = hit;
  if (evidenceSafetyReason(source, chunk)) return null;
  const url = safeSourceUrl(chunk.url, source.canonical_url);
  if (!url) return null;
  // Explicit semantic/program windows must survive query-based quote scoring.
  // Invalid supplied windows fail closed rather than citing unrelated text.
  const hasFocus = Object.hasOwn(hit, 'evidenceQuote') || Object.hasOwn(hit, 'programQuote');
  const focus = Object.hasOwn(hit, 'evidenceQuote') ? hit.evidenceQuote : hit.programQuote;
  let focusedQuote;
  if (hasFocus) {
    if (!focus || !Number.isSafeInteger(focus.start) || !Number.isSafeInteger(focus.end) ||
        focus.start < 0 || focus.end <= focus.start || focus.end > chunk.text.length || focus.end - focus.start > 720) return null;
    focusedQuote = chunk.text.slice(focus.start, focus.end).trim();
    if (!focusedQuote) return null;
  }
  return {
    id: `E${index + 1}`, chunk_id: chunk.id, source_id: source.source_id,
    title: source.title, agency: source.agency,
    quote: focusedQuote || selectQuote(chunk.text, question), section: chunk.section ?? null,
    page: chunk.page ?? null, record_id: chunk.record_id ?? null,
    layer: chunk.layer ?? null, url,
    retrieved_at: chunk.retrieved_at ?? source.retrieval_date ?? null,
    source_updated_date: source.source_updated_date ?? null,
    authoritative_status: source.authoritative_status,
    stale: sourceIsStale(source, chunk, now), content_hash: chunk.content_hash ?? null,
  };
}

/** Narrow contradiction rule: same named program, opposite application availability.
 * Other contradictions require source review; this is not a semantic conflict oracle. */
export function findApplicationConflicts(hits, allSources, allChunks, now = new Date()) {
  const topics = new Set(hits.map(hit => hit.source.program_id ?? hit.source.topic_id ?? hit.source.source_id));
  const registry = new Map(allSources.map(source => [source.source_id, source]));
  const groups = new Map();
  for (const chunk of allChunks) {
    const source = registry.get(chunk.source_id);
    if (!source || !isAuthoritative(source) || sourceIsStale(source, chunk, now) || evidenceSafetyReason(source, chunk)) continue;
    const topic = source.program_id ?? source.topic_id ?? source.source_id;
    if (!topics.has(topic)) continue;
    const statuses = factsForChunk(chunk, source).filter(fact => fact.factType === 'application_status');
    if (!statuses.length) continue;
    const statements = groups.get(topic) ?? {};
    for (const fact of statuses) {
      const hit = withFactEvidence({ source, chunk, applicationStatus: fact.value, required: true }, fact);
      if (hit && (!statements[fact.value] || statements[fact.value].unquotable)) statements[fact.value] = hit;
      else statements[fact.value] ??= { unquotable: true };
    }
    groups.set(topic, statements);
  }
  // Preserve topic order and the first quotable passage for each status. An
  // unquotable opposing statement still prevents an unqualified answer.
  for (const [topic, { open, closed }] of groups) {
    if (open && closed) return { topic, hits: [open, closed].filter(hit => !hit.unquotable),
      ...(open.unquotable || closed.unquotable ? { unquotable: true } : {}) };
  }
  return null;
}
