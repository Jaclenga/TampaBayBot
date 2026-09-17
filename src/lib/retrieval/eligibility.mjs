import { sourceMatchesTopic } from './scope.mjs';

function numberedAction(text) {
  const instruction = text.match(/^step\s*\d+[.)]\s*(.+)$/i)?.[1];
  if (!instruction || instruction.endsWith('?')) return false;
  return /^(?:visit|open|access|log in to|sign in to)\s+.*\b(?:portal|website|site|page)\b/i.test(instruction) ||
    /^(?:complete|submit|start|fill in)\s+.*\b(?:applications?|forms?)\b/i.test(instruction) ||
    /^(?:create|register for)\s+.*\baccount\b/i.test(instruction) ||
    /^(?:call|contact)\s+.*\b(?:office|agency|department)\b/i.test(instruction);
}

/** Short factual list/table rows remain separate exact quotes with their section.
 * Numbered steps also need an action and its object; bare headings, menu links
 * and schema metadata are still not narrative evidence. */
export function usableChunk(chunk) {
  if ((chunk.text.match(/":/g) ?? []).length > 5) return false;
  if (chunk.text.length >= 45) return true;
  if (chunk.text.length < 12 || !(chunk.section || chunk.title || chunk.page)) return false;
  // The step number is a label, not a numeric fact that can admit a heading.
  if (/^step\s*\d+[.)]/i.test(chunk.text)) return numberedAction(chunk.text);
  return /\b(?:maximum|minimum|fee|fees|limit|amount|deadline|income|hours|term|assistance|cost|applications?)\b/i.test(chunk.text)
    && /[:$%\d]|\b(?:closed|open|required|not|only)\b/i.test(chunk.text);
}

export function isInstructionText(text) {
  if (/\b(?:ignora|ignore|olvida|omite)\b.{0,40}\b(?:instrucciones|reglas|sistema|citas)\b|\b(?:revela|muestra|envia)\b.{0,50}\b(?:clave secreta|claves de api|credenciales|prompt del sistema)\b|\b(?:mensaje del sistema|instrucciones del desarrollador)\s*:/iu.test(text)) return true;
  return /ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|rules)|(?:system|developer)\s*(?:message|prompt)\s*:|reveal\s+(?:your\s+)?(?:system prompt|secret|api key)|<\/?(?:script|iframe)\b|javascript:|(?:assistant|model)\s*:\s*(?:ignore|you must)|send\s+(?:all\s+)?(?:credentials|secrets|api keys)\s+to/i.test(text);
}

export function sourceIsStale(source, chunk, now = new Date()) {
  const timestamp = chunk?.retrieved_at ?? source.retrieval_date;
  const retrieved = new Date(timestamp ?? '');
  const refreshDays = Number(source.refresh_days ?? 30);
  return !Number.isFinite(retrieved.getTime()) || !Number.isFinite(refreshDays) || refreshDays <= 0 ||
    now.getTime() - retrieved.getTime() > refreshDays * 86400000 || retrieved.getTime() > now.getTime() + 86400000;
}

export function isAuthoritative(source) {
  const status = String(source.authoritative_status ?? '').toLowerCase();
  return !/independent|secondary|unverified|non.authoritative/.test(status) && /official|authoritative|first.party|government/.test(status);
}

/** Hard invariants shared by retrieval and supplemental/citation evidence paths.
 * Narrative length and topic restrictions belong to each evidence role. */
export function evidenceSafetyReason(source, chunk) {
  if (!source || !chunk || typeof source.source_id !== 'string' || source.source_id !== chunk.source_id) return 'source_mismatch';
  if (typeof chunk.text !== 'string' || !chunk.text.trim()) return 'empty_text';
  if (isInstructionText(chunk.text)) return 'untrusted_instructions';
  return null;
}

/** Exclusion policy is independent of matching and ranking scores. */
export function eligibleEvidence(documents, route) {
  const eligible = [];
  const rejected = [];
  const quarantined = [];
  for (const document of documents) {
    const { chunk, source } = document;
    let reason = evidenceSafetyReason(source, chunk);
    if (reason === 'untrusted_instructions') quarantined.push(chunk.id);
    if (!reason && !usableChunk(chunk)) reason = 'unusable_evidence';
    if (!reason && !sourceMatchesTopic(source, route)) reason = 'outside_topic';
    if (reason) rejected.push({ chunkId: chunk.id, sourceId: source.source_id, stage: 'evidence_eligibility', reason });
    else eligible.push(document);
  }
  return { documents: eligible, rejected, quarantined };
}
