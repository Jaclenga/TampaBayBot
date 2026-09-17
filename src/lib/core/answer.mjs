import { createQueryPlan } from './query-plan.mjs';
import { retrieve, ANSWER_RETRIEVAL_LIMIT } from '../retrieval/search.mjs';
import { isInstructionText, isAuthoritative } from '../retrieval/eligibility.mjs';
import { makeEvidence, findApplicationConflicts } from '../citations/evidence.mjs';
import { verificationQuestions } from '../housing/navigation.mjs';
import { unknownSpecificClaim } from './answer/claims.mjs';
import { nextSteps } from './answer/next-steps.mjs';
import { scopeAnswerCorpus, answerCoverage } from './answer/coverage.mjs';
import { selectEvidence } from './answer/evidence-selection.mjs';
import { selectIncomeEvidence } from './answer/qualifications.mjs';
import { finishResponse, jurisdictionResponse, officialJudgmentResponse, unsupportedResponse } from './answer/response.mjs';

/** Deterministic, extractive retrieval and resident navigation. No model/API key. */
export function answerQuestion(question, { sources = [], chunks = [], now = new Date(), jurisdictionId = 'tampa-bay' } = {}) {
  const query = typeof question === 'string' ? question.trim().slice(0, 2000) : '';
  const date = new Date(now);
  const plan = createQueryPlan(query, { jurisdictionId, sources });
  const route = plan.route;
  // Apply scope before every retrieval, anchor, conflict, extra passage, and link.
  // A selected city is resource context; property boundaries still need GIS verification.
  ({ sources, chunks } = scopeAnswerCorpus(sources, chunks, plan));
  const answer = {
    category: route.category, status: 'insufficient_evidence', query,
    answer: 'I could not determine this reliably from the available public information.',
    meaning: null, evidence: [], nextSteps: [], warnings: [], needsAddress: route.needsAddress,
    jurisdictionId: route.jurisdictionId, jurisdictionLabel: route.jurisdictionLabel, needsJurisdiction: route.needsJurisdiction,
    coverage: answerCoverage(plan, sources),
    ...(route.subjectCategory === 'housing' ? verificationQuestions(query, route) : {}),
  };
  if (!query) { answer.answer = 'Enter a question about housing, zoning, permits, development, or an agency you need to find.'; return answer; }
  if (route.outOfScope) {
    answer.needsAddress = false;
    answer.needsJurisdiction = false;
    answer.status = 'out_of_scope';
    answer.answer = 'I can help with Tampa Bay housing resources, zoning, permits, development records, and finding the responsible agency.';
    return answer;
  }
  if (route.outsideCoverage) {
    answer.needsAddress = false;
    answer.needsJurisdiction = false;
    answer.status = 'missing_geographic_coverage';
    answer.answer = 'This collection covers selected Tampa Bay resources in Hillsborough, Pinellas, and Pasco counties. I cannot verify local programs or property rules for the place you named.';
    answer.meaning = 'Use the government serving that property to confirm local information.';
    return answer;
  }
  const retrieval = retrieve(query, { sources, chunks, queryPlan: plan, now: date, limit: ANSWER_RETRIEVAL_LIMIT });
  if (retrieval.quarantined.length) answer.warnings.push('Some source text was excluded because it contained instructions aimed at an assistant or executable markup.');
  const unsupported = unknownSpecificClaim(query, sources, chunks);
  let selected = selectEvidence(retrieval.hits, plan, sources, chunks, date, unsupported);
  selected = selectIncomeEvidence(plan, selected, chunks, date);
  if (!selected.length) {
    const relevantSources = sources.filter(source => source.categories?.includes(route.subjectCategory));
    answer.nextSteps = nextSteps(relevantSources);
    if (unsupported) return unsupportedResponse(answer, unsupported);
    if (route.officialJudgment) return officialJudgmentResponse(answer);
    if (route.needsJurisdiction && route.subjectCategory !== 'navigation') return jurisdictionResponse(answer, route);
    if (relevantSources.length && !chunks.some(chunk => relevantSources.some(source => source.source_id === chunk.source_id) && !isInstructionText(chunk.text ?? ''))) {
      answer.status = 'unavailable_source';
      answer.answer = 'I do not have usable source text for this question. Open the official resource to verify the information directly.';
    }
    return answer;
  }
  const safeChunks = chunks.filter(chunk => !isInstructionText(chunk.text ?? ''));
  const conflict = findApplicationConflicts(selected, sources, safeChunks, date);
  if (conflict && !conflict.unquotable) selected = conflict.hits;
  const citations = selected.map((hit, index) => ({ hit, evidence: makeEvidence(hit, query, index, date) })).filter(item => item.evidence);
  answer.evidence = citations.map(item => item.evidence);
  if (citations.some(item => item.hit.required)) answer.requiredEvidenceIds = [...new Set([
    answer.evidence[0].id, ...citations.filter(item => item.hit.required).map(item => item.evidence.id),
  ])];
  answer.nextSteps = nextSteps(selected.map(hit => hit.source));
  answer.coverage = answerCoverage(plan, sources, answer.evidence);
  if (!answer.evidence.length) return answer;
  const unavailable = selected.some(hit => /unavailable|failed|error/i.test(String(hit.source.availability ?? hit.source.last_fetch_status ?? hit.source.status ?? '')));
  if (answer.evidence.some(item => item.stale)) answer.warnings.push('One or more snapshots are older than their planned refresh interval. Check the live official page before acting.');
  if (unavailable) answer.warnings.push('A source could not be refreshed; this response uses a previously preserved snapshot.');
  if (answer.evidence.some(item => !isAuthoritative(sources.find(source => source.source_id === item.source_id) ?? {}))) answer.warnings.push('Independent or secondary evidence is labeled. It is not an official government determination.');
  return finishResponse(answer, { plan, selected, chunks, date, unsupported, conflict });
}
