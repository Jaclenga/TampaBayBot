import { tokens } from '../retrieval/tokens.mjs';
import { isAuthoritative, sourceIsStale, evidenceSafetyReason } from '../retrieval/eligibility.mjs';
import { requestedDetailScorer } from '../retrieval/details.mjs';
import { factsForChunk } from '../domain/facts.mjs';

const quoteTokenCache = new Map();

function quoteTokens(text) {
  if (text.length > 8192) return tokens(text);
  const cached = quoteTokenCache.get(text);
  if (cached) return cached;
  const words = tokens(text);
  if (quoteTokenCache.size >= 512) quoteTokenCache.delete(quoteTokenCache.keys().next().value);
  quoteTokenCache.set(text, words);
  return words;
}

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
  const detailScoreFor = requestedDetailScorer(question);
  const scored = sentences.map(sentence => ({ ...sentence,
    detailScore: detailScoreFor(sentence.text),
    score: quoteTokens(sentence.text).reduce((total, token) => total + (query.has(token) ? 1 : 0), 0) + (/not (?:currently )?accepting|closed|online only|move.in|paused/i.test(sentence.text) ? 1 : 0),
  }));
  scored.sort((a, b) => b.detailScore - a.detailScore || b.score - a.score || a.index - b.index);
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
  const quote = focusedQuote || selectQuote(chunk.text, question);
  // Preview permission is an explicit registry decision. Public reachability or
  // a preserved snapshot alone never grants permission to republish more text.
  const previewStatus = source.preview_policy === 'short_excerpt' ? 'permitted' : 'not_permitted';
  return {
    id: `E${index + 1}`, chunk_id: chunk.id, source_id: source.source_id,
    title: source.title, agency: source.agency, publisher: source.agency ?? null,
    source_date: source.source_updated_date ?? null,
    previewStatus, preview: previewStatus === 'permitted' ? quote.slice(0, 200) : null,
    quote, section: chunk.section ?? null,
    page: chunk.page ?? null, record_id: chunk.record_id ?? null,
    layer: chunk.layer ?? null, url,
    retrieved_at: chunk.retrieved_at ?? source.retrieval_date ?? null,
    source_updated_date: source.source_updated_date ?? null,
    authoritative_status: source.authoritative_status,
    stale: sourceIsStale(source, chunk, now), content_hash: chunk.content_hash ?? null,
  };
}

/** Check the final citation contract against the scoped, retrieved corpus.
 * A passing marker must resolve to a literal passage of its registered source;
 * answer text alone is never trusted as provenance. */
export function validateCitationIntegrity(answer, { sources = [], chunks = [], now } = {}) {
  const errors = [];
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.evidence) || typeof answer.answer !== 'string') {
    return { valid: false, errors: ['invalid_answer'] };
  }
  const bySource = new Map();
  for (const source of sources) {
    const id = source?.source_id;
    if (typeof id !== 'string') continue;
    const entries = bySource.get(id) ?? [];
    entries.push(source);
    bySource.set(id, entries);
  }
  const byChunk = new Map();
  for (const chunk of chunks) {
    if (typeof chunk?.source_id !== 'string' || typeof chunk?.id !== 'string') continue;
    const sourceChunks = byChunk.get(chunk.source_id) ?? new Map();
    const entries = sourceChunks.get(chunk.id) ?? [];
    entries.push(chunk);
    sourceChunks.set(chunk.id, entries);
    byChunk.set(chunk.source_id, sourceChunks);
  }
  const byEvidenceId = new Map();
  for (const [index, item] of answer.evidence.entries()) {
    const id = item?.id;
    if (id !== `E${index + 1}` || byEvidenceId.has(id)) errors.push('invalid_evidence_id');
    else byEvidenceId.set(id, item);
    const registered = bySource.get(item?.source_id) ?? [];
    if (registered.length !== 1) { errors.push(`source_not_unique:${id}`); continue; }
    const source = registered[0];
    const matches = byChunk.get(item.source_id)?.get(item.chunk_id) ?? [];
    if (matches.length !== 1) { errors.push(`chunk_not_unique:${id}`); continue; }
    const chunk = matches[0];
    if (evidenceSafetyReason(source, chunk) || typeof item.quote !== 'string' || !item.quote.trim() ||
      item.quote.length > 720 || !chunk.text.includes(item.quote)) errors.push(`unsupported_quote:${id}`);
    const url = safeSourceUrl(chunk.url, source.canonical_url);
    if (!url || item.url !== url) errors.push(`source_url_mismatch:${id}`);
    if (item.title !== source.title || item.agency !== source.agency ||
      item.publisher !== (source.agency ?? null) ||
      item.source_date !== (source.source_updated_date ?? null) ||
      item.source_updated_date !== (source.source_updated_date ?? null) ||
      item.authoritative_status !== source.authoritative_status ||
      item.section !== (chunk.section ?? null) || item.page !== (chunk.page ?? null) ||
      item.record_id !== (chunk.record_id ?? null) || item.layer !== (chunk.layer ?? null) ||
      item.retrieved_at !== (chunk.retrieved_at ?? source.retrieval_date ?? null) ||
      item.content_hash !== (chunk.content_hash ?? null)) errors.push(`source_metadata_mismatch:${id}`);
    if (now !== undefined && item.stale !== sourceIsStale(source, chunk, new Date(now))) {
      errors.push(`stale_status_mismatch:${id}`);
    }
    const allowed = source.preview_policy === 'short_excerpt';
    if (item.previewStatus !== (allowed ? 'permitted' : 'not_permitted') ||
      item.preview !== (allowed ? item.quote?.slice(0, 200) : null)) errors.push(`preview_policy_mismatch:${id}`);
  }
  const markers = [...answer.answer.matchAll(/\[(E\d+)\]/g)];
  // These fields describe interpretation and uncertainty. Their UI treatment
  // is plain text, so citation-shaped tokens here would be misleading.
  if (typeof answer.meaning === 'string' && /\[E\d+\]/.test(answer.meaning) ||
    Array.isArray(answer.warnings) && answer.warnings.some(warning => typeof warning === 'string' && /\[E\d+\]/.test(warning))) {
    errors.push('unclickable_citation');
  }
  for (const marker of markers) {
    const item = byEvidenceId.get(marker[1]);
    if (!item) { errors.push(`unknown_citation:${marker[1]}`); continue; }
    if (answer.status === 'answered') {
      const preceding = answer.answer.slice(0, marker.index).trimEnd();
      if (!preceding.endsWith(item.quote) && !preceding.endsWith(`“${item.quote}”`)) {
        errors.push(`unsupported_claim:${marker[1]}`);
      }
    }
  }
  if (answer.status === 'answered' && !markers.length) errors.push('missing_citation');
  if (answer.status === 'conflicting_evidence') {
    const cited = new Set(markers.map(marker => marker[1]));
    if (answer.evidence.length < 2 || answer.evidence.some(item => !cited.has(item.id))) {
      errors.push('incomplete_conflict_citations');
    }
  }
  if (answer.requiredEvidenceIds !== undefined) {
    if (!Array.isArray(answer.requiredEvidenceIds) || answer.requiredEvidenceIds.some(id =>
      !byEvidenceId.has(id) || answer.status === 'answered' && !markers.some(marker => marker[1] === id))) {
      errors.push('required_citation_missing');
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
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
