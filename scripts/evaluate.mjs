import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuestion } from '../src/lib/core/answer.mjs';
import { isAuthoritative, sourceIsStale } from '../src/lib/retrieval/search.mjs';
import { benchmarks } from '../evaluation/benchmarks.mjs';
import { prepareScenario, EVALUATION_DATE } from '../evaluation/scenarios.mjs';
import { scoreNavigationAnswer } from '../evaluation/suite/scoring.mjs';
import { readCorpus } from '../src/lib/ingestion/generation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sources, chunks } = await readCorpus(root);
const results = [];
const ratio = values => values.length ? { passed: values.filter(Boolean).length, total: values.length, rate: Number((values.filter(Boolean).length / values.length).toFixed(4)) } : { passed: 0, total: 0, rate: null };

for (const benchmark of benchmarks) {
  const corpus = prepareScenario(benchmark.scenario, sources, chunks);
  const answer = answerQuestion(benchmark.question, { ...corpus, jurisdictionId: benchmark.jurisdictionId, now: EVALUATION_DATE });
  const evidenceText = answer.evidence.map(evidence => evidence.quote).join(' ').toLowerCase();
  const citationResults = answer.evidence.map(evidence => {
    const source = corpus.sources.find(item => item.source_id === evidence.source_id);
    const chunk = corpus.chunks.find(item => item.id === evidence.chunk_id);
    return {
      citation_id: evidence.id,
      source_registered: Boolean(source),
      quotation_exact: Boolean(chunk && chunk.source_id === evidence.source_id && chunk.text.includes(evidence.quote)),
      locator_matches: Boolean(chunk && (chunk.page ?? null) === evidence.page && (chunk.record_id ?? null) === evidence.record_id && (chunk.layer ?? null) === evidence.layer),
      original_hash_matches: Boolean(chunk && chunk.content_hash === evidence.content_hash),
      official: Boolean(source && isAuthoritative(source)),
      stale_flag_correct: Boolean(source && chunk && sourceIsStale(source, chunk, new Date(EVALUATION_DATE)) === evidence.stale),
    };
  });
  const markers = [...answer.answer.matchAll(/\[(E\d+)\]/g)].map(match => match[1]);
  const checks = {
    category_routing: answer.category === benchmark.category,
    expected_source_retrieved: benchmark.expected_source.length ? benchmark.expected_source.some(id => answer.evidence.some(evidence => evidence.source_id === id)) : null,
    uncertainty_state: answer.status === benchmark.expected_uncertainty_behavior,
    next_step_routing: benchmark.expected_next_step_resource ? answer.nextSteps.some(step => step.url === corpus.sources.find(source => source.source_id === benchmark.expected_next_step_resource)?.next_step?.url) : null,
    evidence_key_terms: benchmark.expected_evidence_terms ? benchmark.expected_evidence_terms.every(term => evidenceText.includes(term.toLowerCase())) : null,
    markers_resolve: markers.every(marker => answer.evidence.some(evidence => evidence.id === marker)),
    factual_excerpt_has_marker: answer.status === 'answered' ? markers.length > 0 : null,
    location_request: benchmark.expected_needs_address ? answer.needsAddress : null,
    citation_results: citationResults,
    strict_failures: scoreNavigationAnswer({ benchmark, answer, ...corpus, now: EVALUATION_DATE })
      .filter(check => check.passed === false).map(check => check.id),
  };
  results.push({ ...benchmark, synthetic_fixture: benchmark.scenario !== 'baseline', answer, checks });
}

const citations = results.flatMap(result => result.checks.citation_results);
const summary = {
  schema_version: 1, evaluated_as_of: EVALUATION_DATE,
  benchmark_count: results.length, baseline_count: results.filter(result => !result.synthetic_fixture).length,
  synthetic_scenario_count: results.filter(result => result.synthetic_fixture).length,
  metrics: {
    retrieval_expected_source_hit: ratio(results.map(result => result.checks.expected_source_retrieved).filter(value => value !== null)),
    authoritative_source_selection: ratio(citations.map(citation => citation.official)),
    citation_exact_quotation: ratio(citations.map(citation => citation.quotation_exact)),
    citation_provenance_integrity: ratio(citations.map(citation => citation.source_registered && citation.locator_matches && citation.original_hash_matches)),
    citation_completeness_template_proxy: ratio(results.map(result => result.checks.factual_excerpt_has_marker).filter(value => value !== null)),
    expected_evidence_key_terms_proxy: ratio(results.map(result => result.checks.evidence_key_terms).filter(value => value !== null)),
    factual_support: { score: null, status: 'human_review_pending', note: 'Exact extraction is measured separately; it does not prove the selected evidence answers the question or includes every exception.' },
    unsupported_claim_rate: { rate: null, status: 'human_review_pending', note: 'No semantic claim audit has been performed. A zero exact-quote mismatch rate must not be presented as a zero unsupported-claim rate.' },
    stale_source_detection: ratio(citations.map(citation => citation.stale_flag_correct)),
    stale_scenario_uncertainty: ratio(results.filter(result => result.scenario === 'stale' || result.challenge === 'outdated content').map(result => result.checks.uncertainty_state)),
    appropriate_uncertainty: ratio(results.map(result => result.checks.uncertainty_state)),
    category_routing: ratio(results.map(result => result.checks.category_routing)),
    government_next_step_routing: ratio(results.map(result => result.checks.next_step_routing).filter(value => value !== null)),
    geographic_correctness: { score: null, status: 'separate_gis_tests_and_human_review', note: 'This benchmark does not resolve coordinates. Unit tests exercise GIS boundaries and distances; resident correctness needs property-case review.' },
    requests_location_when_required: ratio(results.map(result => result.checks.location_request).filter(value => value !== null)),
    next_step_usefulness: { score: null, status: 'human_review_pending', note: 'Expected official URL selection is measured above; whether the resource solves the resident need requires review.' },
  },
  known_limitations: [
    'This is a small hand-authored development benchmark, not a blind holdout or evidence of broad language understanding.',
    'Application open/closed conflicts are detected only for explicitly matching topic IDs or source IDs. Other semantic contradictions are not automatically detected.',
    'Automated source-ID, literal quote, and keyword checks are proxies, not factual correctness or accessibility scores.',
    'Synthetic fixtures exercise failure handling and never represent actual government pages.',
    'Human audit scores remain null until a named person performs and records the review.',
  ],
  failures: results.filter(result => result.checks.strict_failures.length || Object.values(result.checks).some(value => value === false))
    .map(result => ({ id: result.id, question: result.question, checks: {
      ...Object.fromEntries(Object.entries(result.checks).filter(([, value]) => value === false)),
      ...Object.fromEntries(result.checks.strict_failures.map(id => [`strict.${id}`, false])),
    } })),
};
await fs.mkdir(path.join(root, 'evaluation/results'), { recursive: true });
await fs.mkdir(path.join(root, 'evaluation/human-audit'), { recursive: true });
await fs.writeFile(path.join(root, 'evaluation/results/latest.json'), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(root, 'evaluation/results/responses.json'), JSON.stringify(results, null, 2) + '\n');

const representativeIds = ['h01','h02','h03','h05','h06','h08','h10','h11','h13','h15','h18','h19','h22','h23','h25','h27','z02','z05','z07','z09','z11','z13','p02','p03','p06','p07','d01','d06','n03','n08'];
const rubricKeys = ['factual_correctness','evidence_quality','citation_support','plain_language','completeness','uncertainty_calibration','accessibility_usability','geographic_correctness','next_step_usefulness','misleading_wording'];
const pendingAudit = representativeIds.map(id => {
  const result = results.find(item => item.id === id);
  return { id, question: result.question, challenge: result.challenge, synthetic_fixture: result.synthetic_fixture,
    answer: result.answer, review_status: 'pending_human_review', reviewer: null, reviewed_at: null,
    scores: Object.fromEntries(rubricKeys.map(key => [key, null])), notes: null };
});
// Do not overwrite completed human judgments when benchmarks are rerun.
const auditPath = path.join(root, 'evaluation/human-audit/responses.json');
let existingAudit = [];
try { existingAudit = JSON.parse(await fs.readFile(auditPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.writeFile(auditPath, JSON.stringify(pendingAudit.map(item => {
  const prior = existingAudit.find(record => record.id === item.id && record.review_status === 'reviewed_by_human');
  return prior ? { ...prior, response_changed_since_review: JSON.stringify(prior.answer) !== JSON.stringify(item.answer) } : item;
}), null, 2) + '\n');

console.log(JSON.stringify({ benchmark_count: summary.benchmark_count, metrics: summary.metrics, failures: summary.failures }, null, 2));
if (process.argv.includes('--strict') && summary.failures.length) process.exitCode = 1;
