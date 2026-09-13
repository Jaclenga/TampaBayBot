import { intentText } from '../core/router.mjs';
import { sourceCoversJurisdiction } from '../coverage.mjs';

const STOP_WORDS = new Set('a an the my me i in is it be to of on at do does this that for and or can could would what which how where who are with have has from about want need please tell help get find show near by as if there any use may your you'.split(' '));
const SYNONYMS = {
  rent: ['rental', 'renter', 'tenant', 'rmap'], housing: ['housing', 'homeowner', 'affordable'],
  moving: ['move', 'rmap'], move: ['moving', 'rmap'], eviction: ['tenant', 'rental'],
  repair: ['rehabilitation', 'hrrp'], roof: ['rehabilitation', 'repair', 'hrrp'],
  buying: ['homebuyer', 'homeownership'], buy: ['homebuyer', 'homeownership'],
  zoning: ['zoning', 'zone'], flu: ['future', 'land', 'use'],
  development: ['construction', 'development'], permit: ['permitting', 'construction'],
  construction: ['development', 'permit'], phone: ['contact'], agency: ['contact'],
  homeless: ['homelessness', 'housing', 'assistance'], sleep: ['homelessness', 'housing'],
  'rm-24': ['zoning'], 'rs-50': ['zoning'],
};

function stem(token) {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokens(text, expand = false) {
  const words = intentText(text).split(/\s+/).filter(word => word.length > 1 && !STOP_WORDS.has(word));
  return (expand ? words.flatMap(word => [word, ...(SYNONYMS[word] ?? [])]) : words).map(stem);
}

/** Short factual list/table rows remain separate exact quotes with their section.
 * Bare headings, menu links and schema metadata are still not narrative evidence. */
function usableChunk(chunk) {
  if ((chunk.text.match(/":/g) ?? []).length > 5) return false;
  if (chunk.text.length >= 45) return true;
  if (chunk.text.length < 12 || !(chunk.section || chunk.title || chunk.page)) return false;
  return /\b(?:maximum|minimum|fee|fees|limit|amount|deadline|income|hours|term|assistance|cost|applications?)\b/i.test(chunk.text)
    && /[:$%\d]|\b(?:closed|open|required|not|only)\b/i.test(chunk.text);
}

/** Match the requested factual field in the passage itself, not its page title. */
export function requestedDetailScore(question, text) {
  const query = intentText(question);
  const body = intentText(text);
  if (!/\d|\b(?:no fee|free of charge)\b/.test(body)) return 0;
  // An income threshold and a benefit amount are different facts even when both
  // contain a dollar figure and the same word "maximum".
  const income = /\b(?:income|ami|earnings?|salary)\b/;
  const fees = /\b(?:fee|fees|cost|costs|charge)\b/;
  if (income.test(query) !== income.test(body)) return 0;
  if (fees.test(query) && !fees.test(body)) return 0;
  if (/\bmaximum\b/.test(query) && /\bminimum\b/.test(body) && !/\bmaximum\b/.test(body)) return 0;
  const fields = [
    { query: /\b(?:maximum|max|how much|amount)\b/, body: /\b(?:maximum|max|up to|amount|limit)\b/, kind: /\$|\b(?:dollars?|usd)\b/ },
    { query: /\b(?:minimum)\b/, body: /\bminimum\b/, kind: /\$|\b(?:dollars?|usd)\b/ },
    { query: /\b(?:fee|fees|cost|costs)\b/, body: /\b(?:fee|fees|cost|costs|charge)\b/, kind: /\$|\b(?:dollars?|usd|no fee|free of charge)\b/ },
    { query: /\b(?:how long|duration|loan term)\b/, body: /\b(?:term|period|for|loan)\b/, kind: /\b(?:days?|months?|years?)\b/ },
    { query: /\b(?:deadline|due date)\b/, body: /\b(?:deadline|due|by)\b/, kind: /\b\d{4}\b/ },
  ];
  return fields.filter(field => field.query.test(query) && field.body.test(body) && field.kind.test(body)).length;
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

function authorityWeight(source) {
  if (!isAuthoritative(source)) return 0.75;
  const type = String(source.source_type ?? '').toLowerCase();
  if (/arcgis|api|record/.test(type)) return 1.3;
  if (/html|web/.test(type)) return 1.25;
  if (/code|ordinance/.test(type)) return 1.2;
  return 1.15;
}

/** Small, reproducible BM25 index; no network or model call occurs during retrieval. */
export function retrieve(question, { sources, chunks, route, now = new Date(), limit = 6 }) {
  const registry = new Map(sources.filter(source => sourceCoversJurisdiction(source, route.jurisdictionId ?? 'tampa-bay')).map(source => [source.source_id, source]));
  const quarantined = [];
  const topic = route.subjectCategory ?? route.category;
  const documents = [];
  for (const chunk of chunks) {
    const source = registry.get(chunk.source_id);
    if (!source || typeof chunk.text !== 'string' || !chunk.text.trim()) continue;
    if (isInstructionText(chunk.text)) { quarantined.push(chunk.id); continue; }
    // Layer schemas and isolated menu headings are provenance, not resident answers.
    if (!usableChunk(chunk)) continue;
    if (source.categories?.length && topic !== 'navigation' && !source.categories.includes(topic)) continue;
    const words = tokens(`${source.title} ${source.title} ${(source.keywords ?? []).join(' ')} ${chunk.title ?? ''} ${chunk.section ?? ''} ${chunk.text}`);
    const frequencies = new Map();
    for (const word of words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    documents.push({ source, chunk, words, frequencies });
  }
  const query = [...new Set(tokens(question, true))];
  const averageLength = documents.reduce((sum, item) => sum + item.words.length, 0) / (documents.length || 1);
  const documentFrequency = new Map(query.map(word => [word, documents.filter(item => item.frequencies.has(word)).length]));
  const ranked = documents.map(document => {
    let score = 0;
    let matches = 0;
    for (const word of query) {
      const frequency = document.frequencies.get(word) ?? 0;
      if (!frequency) continue;
      matches++;
      const inverseFrequency = Math.log(1 + (documents.length - documentFrequency.get(word) + 0.5) / (documentFrequency.get(word) + 0.5));
      score += inverseFrequency * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * document.words.length / averageLength));
    }
    const sourceIdWords = tokens(document.source.source_id);
    if (query.some(word => sourceIdWords.includes(word))) score += 1;
    if (route.category === 'navigation' && document.source.categories?.includes('navigation')) score += 0.2;
    if (route.subjectCategory === 'development' && document.source.source_id === 'tampa-development-contact') score += 0.5;
    const stale = sourceIsStale(document.source, document.chunk, now);
    score *= authorityWeight(document.source) * (stale ? 0.8 : 1);
    const detailScore = requestedDetailScore(question, document.chunk.text);
    // A short row's repeated page metadata must not outrank contextual guidance
    // merely because BM25 rewards its length on a broad assistance question.
    if (document.chunk.text.length < 45 && !detailScore) score *= 0.25;
    return { ...document, score, matches, stale, detailScore };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  return { hits: ranked.slice(0, limit).map(({ chunk, source, score, matches, stale, detailScore }) => ({ chunk, source, score, matches, stale, detailScore })), quarantined };
}
