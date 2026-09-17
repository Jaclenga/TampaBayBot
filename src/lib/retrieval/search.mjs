import { scopeCorpus } from './scope.mjs';
import { eligibleEvidence } from './eligibility.mjs';
import { generateCandidates } from './candidates.mjs';
import { rankCandidates } from './ranking.mjs';
import { detectEntities } from '../core/routing/entities.mjs';

// Compatibility exports for existing answer, citation and evaluation consumers.
export { tokens } from './tokens.mjs';
export { requestedDetails, requestedDetailScore } from './details.mjs';
export { isInstructionText, isAuthoritative, sourceIsStale } from './eligibility.mjs';

// Shared by the answer path and program-recall evaluation.
export const ANSWER_RETRIEVAL_LIMIT = 15;

/** Scope -> eligibility -> candidates -> ranking. No network or model calls. */
export function retrieve(question, { sources, chunks, route, queryPlan, now = new Date(), limit = 6 }) {
  const resolvedRoute = queryPlan?.route ?? route;
  if (!resolvedRoute) throw new TypeError('Retrieval requires a QueryPlan or route.');
  const scoped = scopeCorpus(sources, chunks, resolvedRoute);
  const eligible = eligibleEvidence(scoped.documents, resolvedRoute);
  const entities = queryPlan?.entities ?? detectEntities(question, { sources: scoped.sources });
  const generated = generateCandidates(question, eligible.documents, resolvedRoute, entities);
  const ranked = rankCandidates(question, generated.candidates, { now, requestedFacts: queryPlan?.requestedFacts });
  const hits = ranked.slice(0, limit);
  return {
    hits,
    quarantined: eligible.quarantined,
    // IDs and stage-local reasons distinguish policy exclusions, recall misses,
    // and top-k truncation without copying unsafe source text into the trace.
    diagnostics: {
      inputCount: chunks.length,
      scopedCount: scoped.documents.length,
      eligibleCount: eligible.documents.length,
      candidateCount: generated.candidates.length,
      rankedCount: ranked.length,
      returnedCount: hits.length,
      rejected: [...scoped.rejected, ...eligible.rejected],
      unmatched: generated.unmatched,
      candidates: generated.candidates.map(({ chunk, source, lexicalScore, preferenceScore, entityScore, matches }) => ({
        chunkId: chunk.id, sourceId: source.source_id, lexicalScore, preferenceScore, entityScore, matches,
      })),
      ranked: ranked.map(({ chunk, source, score, stale, detailScore }, index) => ({
        chunkId: chunk.id, sourceId: source.source_id, rank: index + 1, score, stale, detailScore, returned: index < hits.length,
      })),
    },
  };
}
