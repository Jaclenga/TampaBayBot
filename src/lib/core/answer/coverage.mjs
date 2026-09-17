import { scopeCorpus } from '../../retrieval/scope.mjs';

export function scopeAnswerCorpus(sources, chunks, plan) {
  const scoped = scopeCorpus(sources, chunks, plan.route);
  return { sources: scoped.sources, chunks: scoped.documents.map(item => item.chunk) };
}

/** A top-k lexical search cannot establish an exhaustive program inventory. */
export function answerCoverage(plan, sources, evidence = []) {
  return {
    kind: 'retrieved_resources', exhaustive: false,
    jurisdictionId: plan.route.jurisdictionId, category: plan.subjectCategory,
    registrySourceCount: sources.filter(source => source.categories?.includes(plan.subjectCategory)).length,
    citedSourceCount: new Set(evidence.map(item => item.source_id)).size,
    statement: 'These are resources found in the reviewed collection. Other programs or resources may exist.',
  };
}
