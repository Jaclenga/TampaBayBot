import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { answerResidentQuestion } from '../src/lib/core/resident.mjs';
import { createQueryPlan } from '../src/lib/core/query-plan.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';
import { scoreNavigationAnswer } from './suite/scoring.mjs';
import { reliabilityDataset } from './suite/reliability.mjs';

export const regressionDataset = JSON.parse(readFileSync(
  new URL('./datasets/routing-citation-benchmark.json', import.meta.url), 'utf8',
));
export const housingDirectory = JSON.parse(readFileSync(
  new URL('../pages-demo/src/housing-resources.json', import.meta.url), 'utf8',
));

export const REGRESSION_CATEGORIES = Object.freeze([
  'eviction', 'housing_assistance', 'eligibility', 'zoning',
  'property_information', 'emergencies', 'ambiguous', 'unsupported',
]);
const ROUTES = new Set(['housing', 'zoning', 'permitting', 'development', 'navigation']);
const STATUSES = new Set([
  'answered', 'insufficient_evidence', 'conflicting_evidence',
  'potentially_outdated', 'needs_location', 'needs_jurisdiction',
  'official_judgment', 'out_of_scope', 'unavailable_source',
  'missing_geographic_coverage',
]);
const JURISDICTIONS = new Set([
  'tampa-bay', 'tampa', 'st-petersburg', 'clearwater',
  'hillsborough-county', 'pinellas-county', 'pasco-county',
]);
const SITUATIONS = new Set([
  'eviction', 'rent', 'imminent_homelessness', 'homelessness',
  'unsafe_housing', 'utilities', 'domestic_violence', 'disaster',
  'affordable_housing',
]);
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const ids = values => Array.isArray(values) && values.every(value =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,100}$/.test(value)) &&
  new Set(values).size === values.length;
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (id, kind, passed, expected, observed) => ({
  id, kind, passed,
  ...(expected === undefined ? {} : { expected }),
  ...(observed === undefined ? {} : { observed }),
});

/** Validate the authored oracle before executing any question. It contains
 * behavioral requirements and synthetic evidence IDs, never reference prose. */
export function validateRegressionDataset(dataset, {
  fixture = reliabilityDataset.fixture, directory = housingDirectory,
} = {}) {
  if (!record(dataset) || dataset.schema_version !== 1 ||
      dataset.fixture_id !== fixture.id ||
      typeof dataset.description !== 'string' || !dataset.description.trim() ||
      !Array.isArray(dataset.cases) || dataset.cases.length < 50 ||
      dataset.cases.length > 100) throw new Error('Regression dataset must contain 50–100 cases.');
  const sourceIds = new Set(fixture.sources.map(source => source.source_id));
  const resourceIds = new Set(directory.resources.map(resource => resource.id));
  const caseIds = new Set();
  const questions = new Set();
  const categories = new Set();
  for (const row of dataset.cases) {
    const expected = row?.expected;
    if (!record(row) || !/^[a-z0-9][a-z0-9-]{0,100}$/.test(row.id ?? '') ||
        caseIds.has(row.id) || !REGRESSION_CATEGORIES.includes(row.category) ||
        typeof row.question !== 'string' || !row.question.trim() || row.question.length > 1000 ||
        questions.has(row.question.trim().toLowerCase()) ||
        !JURISDICTIONS.has(row.jurisdiction_id) || !record(expected) ||
        !ROUTES.has(expected.route) ||
        (expected.status !== undefined && !STATUSES.has(expected.status)) ||
        (expected.needs_address !== undefined && typeof expected.needs_address !== 'boolean') ||
        (expected.needs_jurisdiction !== undefined && typeof expected.needs_jurisdiction !== 'boolean') ||
        (expected.refuse !== undefined && typeof expected.refuse !== 'boolean') ||
        (expected.citation_required_if_claims !== undefined && typeof expected.citation_required_if_claims !== 'boolean') ||
        (expected.official_source_required !== undefined && typeof expected.official_source_required !== 'boolean') ||
        (expected.crisis_situation !== undefined && !SITUATIONS.has(expected.crisis_situation)) ||
        !ids(expected.source_ids_any ?? []) ||
        (expected.source_ids_any ?? []).some(id => !sourceIds.has(id)) ||
        !ids(expected.resource_ids_any ?? []) ||
        (expected.resource_ids_any ?? []).some(id => !resourceIds.has(id)) ||
        ((expected.resource_ids_any ?? []).length > 0 && !expected.crisis_situation) ||
        !Array.isArray(expected.forbidden_claims ?? []) ||
        (expected.forbidden_claims ?? []).some(claim => !record(claim) ||
          !/^[a-z0-9][a-z0-9-]{0,100}$/.test(claim.id ?? '') ||
          typeof claim.pattern !== 'string' || !claim.pattern ||
          (claim.flags !== undefined && !/^[imu]*$/.test(claim.flags))))
      throw new Error(`Invalid regression case: ${row?.id ?? 'unknown'}.`);
    for (const claim of expected.forbidden_claims ?? []) {
      try { new RegExp(claim.pattern, claim.flags ?? 'i'); }
      catch { throw new Error(`Invalid forbidden claim in ${row.id}.`); }
    }
    if (new Set((expected.forbidden_claims ?? []).map(claim => claim.id)).size !==
        (expected.forbidden_claims ?? []).length)
      throw new Error(`Duplicate forbidden claim in ${row.id}.`);
    caseIds.add(row.id);
    questions.add(row.question.trim().toLowerCase());
    categories.add(row.category);
  }
  if (REGRESSION_CATEGORIES.some(category => !categories.has(category)))
    throw new Error('Regression dataset must cover every required category.');
  return dataset;
}

export function scoreRegressionCase(row, response, plan, { sources, chunks, now, directory }) {
  const expected = row.expected;
  const evidence = Array.isArray(response?.evidence) ? response.evidence : [];
  const citedSources = new Set(evidence.map(item => item?.source_id));
  const sourceIndex = new Map(sources.map(source => [source.source_id, source]));
  const checks = [
    check('route_subject', 'behavior', plan.route.subjectCategory === expected.route,
      expected.route, plan.route.subjectCategory),
    check('answer_route', 'behavior', response?.category === plan.route.category,
      plan.route.category, response?.category ?? null),
    check('model_disabled', 'integrity', response?.generation?.status === 'disabled' &&
      response?.generation?.provider === 'none', 'disabled', response?.generation?.status ?? null),
    check('guarded_path', 'integrity', response?.guardrails?.status === 'passed'),
  ];
  if (expected.status !== undefined)
    checks.push(check('expected_status', 'behavior', response?.status === expected.status,
      expected.status, response?.status ?? null));
  if (expected.needs_address !== undefined)
    checks.push(check('needs_address', 'behavior', response?.needsAddress === expected.needs_address,
      expected.needs_address, response?.needsAddress ?? null));
  if (expected.needs_jurisdiction !== undefined)
    checks.push(check('needs_jurisdiction', 'behavior', response?.needsJurisdiction === expected.needs_jurisdiction,
      expected.needs_jurisdiction, response?.needsJurisdiction ?? null));
  if (expected.refuse === true)
    checks.push(check('refusal', 'behavior', response?.status !== 'answered' &&
      typeof response?.answer === 'string' && response.answer.trim().length > 0,
      'conservative_non_answer', response?.status ?? null));
  if (expected.citation_required_if_claims === true)
    checks.push(check('cited_answer', 'citation', response?.status === 'answered'
      ? evidence.length > 0 && evidence.some(item => response.answer.includes(`[${item.id}]`))
      : null, 'citation_when_answered', evidence.length));
  if (expected.official_source_required === true)
    checks.push(check('official_evidence', 'citation', evidence.length
      ? evidence.every(item => sourceIndex.get(item.source_id)?.authoritative_status === 'first-party')
      : null, 'first-party', evidence.length));
  if (expected.source_ids_any?.length)
    checks.push(check('source_requirement', 'citation',
      expected.source_ids_any.some(id => citedSources.has(id)),
      expected.source_ids_any, [...citedSources]));
  const narrative = `${response?.answer ?? ''}\n${response?.meaning ?? ''}`;
  for (const claim of expected.forbidden_claims ?? [])
    checks.push(check(`forbidden_${claim.id}`, 'behavior', !new RegExp(claim.pattern, claim.flags ?? 'i').test(narrative),
      'absent', 'redacted'));
  const guide = response?.crisisPlan;
  if (expected.crisis_situation)
    checks.push(check('crisis_situation', 'behavior', guide?.situation === expected.crisis_situation,
      expected.crisis_situation, guide?.situation ?? null));
  if (expected.resource_ids_any?.length)
    checks.push(check('crisis_resource', 'behavior',
      guide?.resources?.some(item => expected.resource_ids_any.includes(item.id)) === true,
      expected.resource_ids_any, guide?.resources?.map(item => item.id) ?? []));
  if (guide)
    checks.push(check('crisis_sources_registered', 'citation',
      guide.resources.every(item => directory.resources.some(resource =>
        resource.id === item.id && resource.sourceUrl === item.sourceUrl)) &&
      guide.sources.every(item => directory.resources.some(resource => resource.sourceUrl === item.url)),
      'directory_source_urls'));
  checks.push(...scoreNavigationAnswer({ answer: response, sources, chunks, now })
    .filter(item => item.passed !== null && item.id !== 'expected_status'));
  return checks;
}

let pending = Promise.resolve();
async function execute({ dataset, fixture, directory, answer }) {
  validateRegressionDataset(dataset, { fixture, directory });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Outbound fetch is disabled in offline evaluation.'); };
  const rows = [];
  try {
    for (const row of dataset.cases) {
      const plan = createQueryPlan(row.question, {
        jurisdictionId: row.jurisdiction_id, sources: fixture.sources,
      });
      let checks;
      try {
        const response = await answer(row.question, {
          sources: structuredClone(fixture.sources), chunks: structuredClone(fixture.chunks),
          now: reliabilityDataset.referenceDate, jurisdictionId: row.jurisdiction_id,
          crisisResources: structuredClone(directory.resources),
          config: parseLlmConfig({ LLM_PROVIDER: 'none' }),
        });
        checks = scoreRegressionCase(row, response, plan, {
          sources: fixture.sources, chunks: fixture.chunks,
          now: reliabilityDataset.referenceDate, directory,
        });
      } catch {
        checks = [check('execution', 'robustness', false, 'completed', 'failed')];
      }
      rows.push({ id: row.id, category: row.category,
        passed: checks.every(item => item.passed !== false), checks });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  return rows;
}

/** Serialized because the offline network guard temporarily replaces fetch. */
export function runRegression(options = {}) {
  const args = {
    dataset: options.dataset ?? regressionDataset,
    fixture: options.fixture ?? reliabilityDataset.fixture,
    directory: options.directory ?? housingDirectory,
    answer: options.answer ?? answerResidentQuestion,
  };
  const job = pending.then(() => execute(args));
  pending = job.then(() => undefined, () => undefined);
  return job;
}

export function buildRegressionReport(rows, {
  dataset = regressionDataset, minimumOverall = 1, minimumCategories = {},
} = {}) {
  if (!Array.isArray(rows) || rows.length !== dataset.cases.length ||
      !Number.isFinite(minimumOverall) || minimumOverall < 0 || minimumOverall > 1)
    throw new Error('Invalid regression results or threshold.');
  const references = new Map(dataset.cases.map(row => [row.id, row]));
  if (new Set(rows.map(row => row?.id)).size !== rows.length || rows.some(row =>
    !record(row) || !references.has(row.id) || references.get(row.id).category !== row.category ||
    !Array.isArray(row.checks) || row.checks.length === 0 ||
    new Set(row.checks.map(item => item?.id)).size !== row.checks.length ||
    row.checks.some(item => !record(item) || typeof item.id !== 'string' ||
      typeof item.kind !== 'string' || !(item.passed === null || typeof item.passed === 'boolean'))))
    throw new Error('Invalid regression case results.');
  // Derive pass/fail from checks so a stale or fabricated row.passed flag
  // cannot affect category rates or the CI gate.
  rows = rows.map(row => ({ ...row, passed: row.checks.every(item => item.passed !== false) }));
  const known = new Set(REGRESSION_CATEGORIES);
  for (const [category, threshold] of Object.entries(minimumCategories))
    if (!known.has(category) || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)
      throw new Error('Invalid category threshold.');
  const categories = Object.fromEntries(REGRESSION_CATEGORIES.map(category => {
    const selected = rows.filter(row => row.category === category);
    const passed = selected.filter(row => row.passed).length;
    const rate = selected.length ? passed / selected.length : null;
    const threshold = minimumCategories[category] ?? minimumOverall;
    return [category, { cases: selected.length, passed, failed: selected.length - passed,
      rate, threshold, gatePassed: rate !== null && rate >= threshold }];
  }));
  const passed = rows.filter(row => row.passed).length;
  const rate = passed / rows.length;
  const overallGatePassed = rate >= minimumOverall;
  const datasetHash = sha(JSON.stringify(dataset));
  return {
    schema_version: 1, mode: 'offline',
    status: overallGatePassed && Object.values(categories).every(item => item.gatePassed) ? 'passed' : 'failed',
    generated_at: new Date().toISOString(),
    provenance: { dataset_sha256: datasetHash,
      fixture_id: reliabilityDataset.fixture.id,
      reference_date: reliabilityDataset.referenceDate,
      model: 'disabled', outbound_fetch: 'disabled' },
    summary: { cases: rows.length, passed, failed: rows.length - passed,
      rate, threshold: minimumOverall, gatePassed: overallGatePassed, categories },
    cases: rows,
  };
}

export function regressionMarkdown(report) {
  const percent = value => value == null ? 'n/a' : `${(100 * value).toFixed(1)}%`;
  const lines = [
    `# TampaBayBot offline regression: ${report.status}`, '',
    `${report.summary.passed}/${report.summary.cases} cases passed (${percent(report.summary.rate)}; required ${percent(report.summary.threshold)}).`, '',
    '| Category | Passed | Total | Pass rate | Required | Gate |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const [category, value] of Object.entries(report.summary.categories))
    lines.push(`| ${category} | ${value.passed} | ${value.cases} | ${percent(value.rate)} | ${percent(value.threshold)} | ${value.gatePassed ? 'pass' : 'fail'} |`);
  lines.push('', '## Failed checks', '');
  let failures = 0;
  for (const row of report.cases) {
    const failed = row.checks.filter(item => item.passed === false);
    if (!failed.length) continue;
    failures++;
    lines.push(`- ${row.category}/${row.id}: ${failed.map(item => item.id).join(', ')}`);
  }
  if (!failures) lines.push('None.');
  lines.push('', '## Interpretation', '',
    'These checks use fixed synthetic source passages and a checked-in housing directory. They exercise routing, conservative response states, citation provenance, source selection, and crisis referrals without a model or live network.',
    'A pass does not verify current agency rules, a live destination, semantic entailment of every claim, or resident usefulness. Review those separately.', '');
  return lines.join('\n');
}
