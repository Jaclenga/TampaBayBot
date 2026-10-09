import { tokens } from './tokens.mjs';
import { RETRIEVAL_PREFERENCES } from '../domain/source-policies.mjs';

// Corpus chunks are reused across requests in a Worker isolate. Cache only the
// lexical representation, and recheck every field that contributes to it so
// source refreshes and in-memory edits still produce the same search results.
const lexicalCache = new WeakMap();

function indexDocument(source, chunk) {
  const keywords = (source.keywords ?? []).join(' ');
  const prior = lexicalCache.get(chunk);
  if (prior && prior.source === source && prior.sourceTitle === source.title &&
      prior.keywords === keywords && prior.chunkTitle === chunk.title &&
      prior.section === chunk.section && prior.text === chunk.text) return prior.index;
  const words = tokens(`${source.title} ${source.title} ${keywords} ${chunk.title ?? ''} ${chunk.section ?? ''} ${chunk.text}`);
  const frequencies = new Map();
  for (const word of words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const index = { source, chunk, words, frequencies };
  lexicalCache.set(chunk, {
    source, sourceTitle: source.title, keywords, chunkTitle: chunk.title,
    section: chunk.section, text: chunk.text, index,
  });
  return index;
}

function metadataScore(source, route, query) {
  const sourceIdWords = tokens(source.source_id);
  let score = query.some(word => sourceIdWords.includes(word)) ? 1 : 0;
  if (route.category === 'navigation' && source.categories?.includes('navigation')) score += 0.2;
  for (const preference of RETRIEVAL_PREFERENCES) {
    if (route.subjectCategory === preference.subject && source.source_id === preference.sourceId) score += preference.weight;
  }
  return score;
}

/** Reproducible BM25 candidates over the entire eligible corpus, before weighting. */
export function generateCandidates(question, documents, route, entities = []) {
  // Whole names resolved by the registry are a source-local recall signal.
  // Matching individual alias words would give unrelated resources a boost.
  const namedSources = new Set(entities.filter(entity => entity.type === 'program' && entity.sourceId).map(entity => entity.sourceId));
  const indexed = documents.map(({ source, chunk }) => indexDocument(source, chunk));
  const query = [...new Set(tokens(question, true))];
  const averageLength = indexed.reduce((sum, item) => sum + item.words.length, 0) / (indexed.length || 1);
  const documentFrequency = new Map(query.map(word => [word, indexed.filter(item => item.frequencies.has(word)).length]));
  const candidates = [];
  const unmatched = [];
  for (const document of indexed) {
    let lexicalScore = 0;
    let matches = 0;
    for (const word of query) {
      const frequency = document.frequencies.get(word) ?? 0;
      if (!frequency) continue;
      matches++;
      const inverseFrequency = Math.log(1 + (indexed.length - documentFrequency.get(word) + 0.5) / (documentFrequency.get(word) + 0.5));
      lexicalScore += inverseFrequency * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * document.words.length / averageLength));
    }
    const preferenceScore = metadataScore(document.source, route, query);
    const entityScore = namedSources.has(document.source.source_id) ? 1 : 0;
    const baseScore = lexicalScore + preferenceScore + entityScore;
    if (baseScore > 0) candidates.push({ source: document.source, chunk: document.chunk, lexicalScore, preferenceScore, entityScore, baseScore, matches });
    else unmatched.push({ chunkId: document.chunk.id, sourceId: document.source.source_id, stage: 'candidate_generation', reason: 'no_matching_signal' });
  }
  return { candidates, unmatched, query };
}
