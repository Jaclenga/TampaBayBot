import { isAuthoritative, sourceIsStale } from './eligibility.mjs';
import { requestedDetailScore } from './details.mjs';

function authorityWeight(source) {
  if (!isAuthoritative(source)) return 0.75;
  const type = String(source.source_type ?? '').toLowerCase();
  if (/arcgis|api|record/.test(type)) return 1.3;
  if (/html|web/.test(type)) return 1.25;
  if (/code|ordinance/.test(type)) return 1.2;
  return 1.15;
}

/** Rank admitted candidates without changing their provenance or eligibility. */
export function rankCandidates(question, candidates, { now = new Date(), requestedFacts } = {}) {
  return candidates.map(candidate => {
    const { source, chunk, baseScore, matches } = candidate;
    const stale = sourceIsStale(source, chunk, now);
    const detailScore = requestedDetailScore(question, chunk.text, requestedFacts);
    let score = baseScore * authorityWeight(source) * (stale ? 0.8 : 1);
    // Short rows need a matching factual request to outrank contextual guidance.
    if (chunk.text.length < 45 && !detailScore) score *= 0.25;
    return { source, chunk, score, matches, stale, detailScore };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
}
