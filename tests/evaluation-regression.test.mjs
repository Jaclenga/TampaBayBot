import test from 'node:test';
import assert from 'node:assert/strict';
import { answerResidentQuestion } from '../src/lib/core/resident.mjs';
import { createQueryPlan } from '../src/lib/core/query-plan.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';
import { reliabilityDataset } from '../evaluation/suite/reliability.mjs';
import { regressionDataset, housingDirectory, validateRegressionDataset,
  scoreRegressionCase, runRegression, buildRegressionReport,
  regressionMarkdown, REGRESSION_CATEGORIES } from '../evaluation/regression.mjs';
import { parseRegressionArguments } from '../scripts/eval-regression.mjs';
import { parseSemanticArguments, selectSemanticCases, evaluateSemantic,
  main as semanticMain } from '../scripts/eval-semantic.mjs';

const fixture = reliabilityDataset.fixture;
const find = id => regressionDataset.cases.find(row => row.id === id);
const checksById = checks => Object.fromEntries(checks.map(row => [row.id, row]));

async function score(id, mutate = value => value) {
  const row = find(id);
  const response = mutate(await answerResidentQuestion(row.question, {
    sources: structuredClone(fixture.sources), chunks: structuredClone(fixture.chunks),
    now: reliabilityDataset.referenceDate, jurisdictionId: row.jurisdiction_id,
    crisisResources: structuredClone(housingDirectory.resources),
    config: parseLlmConfig({ LLM_PROVIDER: 'none' }),
  }));
  const plan = createQueryPlan(row.question, {
    jurisdictionId: row.jurisdiction_id, sources: fixture.sources,
  });
  return checksById(scoreRegressionCase(row, response, plan, {
    sources: fixture.sources, chunks: fixture.chunks,
    now: reliabilityDataset.referenceDate, directory: housingDirectory,
  }));
}

test('versioned oracle has 72 unique questions across all requested categories', () => {
  assert.equal(validateRegressionDataset(regressionDataset), regressionDataset);
  assert.equal(regressionDataset.cases.length, 72);
  assert.deepEqual(new Set(regressionDataset.cases.map(row => row.category)), new Set(REGRESSION_CATEGORIES));
  const duplicate = structuredClone(regressionDataset);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateRegressionDataset(duplicate), /Invalid regression case/);
  const invented = structuredClone(regressionDataset);
  invented.cases[0].expected.source_ids_any = ['fabricated-source'];
  assert.throws(() => validateRegressionDataset(invented), /Invalid regression case/);
  const invalidPattern = structuredClone(regressionDataset);
  invalidPattern.cases[0].expected.forbidden_claims[0].pattern = '(';
  assert.throws(() => validateRegressionDataset(invalidPattern), /Invalid forbidden claim/);
});

test('citation, source, refusal, and forbidden-claim mutations fail independently', async () => {
  const citation = await score('housing-assistance-01', answer => {
    answer.evidence[0].quote = 'An invented benefit is guaranteed.';
    return answer;
  });
  assert.equal(citation.citation_quote_exact.passed, false);
  const source = await score('housing-assistance-01', answer => {
    answer.evidence[0].source_id = 'florida-housing';
    return answer;
  });
  assert.equal(source.source_requirement.passed, false);
  assert.equal(source.citation_source_and_chunk_registered.passed, false);
  const refusal = await score('eligibility-03', answer => {
    answer.status = 'answered';
    return answer;
  });
  assert.equal(refusal.refusal.passed, false);
  const claim = await score('eligibility-03', answer => {
    answer.answer += ' Your family qualifies.';
    return answer;
  });
  assert.equal(claim['forbidden_family-eligibility'].passed, false);
});

test('a conservative nonanswer cannot hide lost required evidence', async () => {
  const lost = await score('housing-assistance-05', answer => ({
    ...answer, status: 'insufficient_evidence', answer: 'Please ask the agency.',
    meaning: null, evidence: [], nextSteps: [],
  }));
  assert.equal(lost.source_requirement.passed, false);
  assert.deepEqual(lost.source_requirement.observed, []);
  const withoutSpecifiedSource = await score('eligibility-04');
  assert.equal(withoutSpecifiedSource.source_requirement, undefined);
});

test('offline runner uses the resident path, disables model generation, and reports category rates', async () => {
  const rows = await runRegression();
  assert.equal(rows.length, 72);
  assert.ok(rows.every(row => row.checks.some(check => check.id === 'model_disabled' && check.passed)));
  assert.ok(rows.some(row => row.category === 'emergencies' && row.checks.some(check => check.id === 'crisis_situation')));
  const report = buildRegressionReport(rows);
  assert.equal(report.summary.cases, 72);
  assert.equal(report.summary.categories.eviction.cases, 9);
  assert.match(regressionMarkdown(report), /Pass rate/);
  assert.doesNotMatch(JSON.stringify(report), /I got an eviction summons/);
});

test('configurable thresholds fail regressions and reject malformed options', async () => {
  const rows = await runRegression();
  const changed = structuredClone(rows);
  changed[0].passed = false;
  changed[0].checks[0].passed = false;
  assert.equal(buildRegressionReport(changed).status, 'failed');
  changed[0].passed = true;
  assert.equal(buildRegressionReport(changed).status, 'failed');
  assert.equal(buildRegressionReport(changed, { minimumOverall: 0.9,
    minimumCategories: { eviction: 0.8 } }).status, 'passed');
  assert.equal(buildRegressionReport(changed, { minimumOverall: 0.9,
    minimumCategories: { eviction: 1 } }).status, 'failed');
  assert.throws(() => parseRegressionArguments(['--min-overall', '1.1']), /Threshold/);
  assert.throws(() => parseRegressionArguments(['--min-category', 'invented=1']), /category/);
  assert.throws(() => parseRegressionArguments(['--min-category', 'eviction=1', '--min-category', 'eviction=0']), /category/);
});

test('semantic judge requires opt-in and records only bounded verdicts', async () => {
  await assert.rejects(semanticMain([]), /allow-provider-call/);
  assert.equal(parseSemanticArguments(['--limit', '2']).authorized, undefined);
  assert.deepEqual(new Set(selectSemanticCases(regressionDataset, 8).map(row => row.category)),
    new Set(REGRESSION_CATEGORIES));
  const config = parseLlmConfig({ LLM_PROVIDER: 'ollama',
    LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'synthetic-judge' });
  let calls = 0;
  const report = await evaluateSemantic({ config, limit: 1,
    provider: { complete: async () => {
      calls++;
      return JSON.stringify({ supported: true, relevant: true, uncertaintyAppropriate: false });
    } }, });
  assert.equal(calls, 1);
  assert.equal(report.summary.judged, 1);
  assert.equal(report.summary.passed, 0);
  assert.equal(report.cases[0].judgment.uncertaintyAppropriate, false);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-judge|I got an eviction summons/);
});
