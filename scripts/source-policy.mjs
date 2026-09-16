/** Distribution policy shared by packaging and independent verification. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SUITE_VERSION } from '../evaluation/suite/report.mjs';

const NOTICE = 'This source-only distribution contains no downloaded evidence or historical response packets. Fetch and review sources locally before expecting cited answers. Evaluation has not run for this copy.';
const EMPTY_CHECKS = { passed: 0, failed: 0, applicable: 0, notApplicable: 0, rate: null };

function exactFields(value, fields, name) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Expected a source-only object in ${name}`);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), `Unexpected source-only fields in ${name}`);
}

function assertEmptyReport(name, report) {
  assert.equal(report.status, 'not_run', `Historical evaluation results in ${name}`);
  if (name.startsWith('data/')) {
    exactFields(report, ['status', 'sources', 'note'], name);
    assert.deepEqual(report.sources, [], `Historical source report in ${name}`);
    assert.equal(report.note, NOTICE, `Unexpected source-only notice in ${name}`);
    return;
  }
  if (name === 'evaluation/results/latest.json') {
    exactFields(report, ['schema_version', 'status', 'evaluated_as_of', 'benchmark_count', 'baseline_count', 'synthetic_scenario_count', 'metrics', 'known_limitations', 'failures'], name);
    assert.equal(report.schema_version, 1);
    assert.equal(report.evaluated_as_of, null);
    for (const field of ['benchmark_count', 'baseline_count', 'synthetic_scenario_count']) assert.equal(report[field], 0, `Historical count in ${name}.${field}`);
    assert.deepEqual(report.failures, [], `Historical failures in ${name}`);
    assert.deepEqual(report.known_limitations, [NOTICE]);
    assert.ok(report.metrics && typeof report.metrics === 'object' && !Array.isArray(report.metrics), 'Expected a source-only metrics object');
    for (const [key, metric] of Object.entries(report.metrics)) {
      assert.match(key, /^[a-z][a-z0-9_]{0,100}$/, 'Expected a metric identifier');
      assert.ok(metric && typeof metric === 'object' && !Array.isArray(metric), `Invalid empty metric ${key}`);
      assert.deepEqual(metric, Object.hasOwn(metric, 'passed') ? { passed: 0, total: 0, rate: null } : { score: null, status: 'not_run', note: NOTICE }, `Historical metric in ${name}.${key}`);
    }
    return;
  }
  exactFields(report, ['schemaVersion', 'suiteVersion', 'mode', 'status', 'startedAt', 'completedAt', 'provenance', 'summary', 'metrics', 'automatedQuality', 'humanEvaluation', 'limitations', 'cases'], name);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.suiteVersion, SUITE_VERSION);
  assert.equal(report.mode, 'not_run');
  assert.equal(report.startedAt, null);
  assert.equal(report.completedAt, '');
  assert.deepEqual(report.provenance, {});
  assert.deepEqual(report.metrics, {});
  assert.equal(report.automatedQuality, null);
  assert.deepEqual(report.humanEvaluation, { status: 'not_run' });
  assert.deepEqual(report.limitations, [NOTICE]);
  assert.deepEqual(report.cases, [], `Historical cases in ${name}`);
  const suites = Object.fromEntries(['navigation', 'guardrails', 'providers', 'metamorphic', 'jurisdiction', 'quality'].map(suite => [suite, { cases: 0, passed: 0, failed: 0, checks: EMPTY_CHECKS }]));
  assert.deepEqual(report.summary, { cases: 0, passed: 0, failed: 0, checks: EMPTY_CHECKS, suites }, `Historical suite summary in ${name}`);
}

export const EMPTY_ARRAY_FILES = [
  'data/chunks.json', 'evaluation/results/responses.json',
  'evaluation/agent-audit/responses.json', 'evaluation/human-audit/responses.json',
];
export const EMPTY_REPORT_FILES = [
  'data/ingestion-report.json', 'data/verification-report.json',
  'evaluation/results/latest.json', 'evaluation/suite/results/latest.json',
];

// These local tool outputs are ignored during workspace verification, but can
// never be listed as release payload. Private inputs are deliberately absent.
export const GENERATED_ROOT_DIRECTORIES = ['.git', 'node_modules', 'work', 'dist', '.next', '.vinext', '.wrangler', 'playwright-report', 'test-results'];
export function isGeneratedReleasePath(name) {
  return GENERATED_ROOT_DIRECTORIES.includes(name.split('/')[0]) || /(?:^|\/)(?:next-env\.d\.ts|[^/]+\.tsbuildinfo)$/.test(name);
}

export function isReleaseTextPath(name) {
  return /\.(?:mjs|js|cjs|ts|tsx|mts|css|md|json|ya?ml|txt|toml|tmpl|html|svg|sql)$/.test(name)
    || /(?:^|\/)(?:LICENSE|NOTICE|\.gitignore|\.gitattributes|\.gitleaksignore|\.env\.example)$/.test(name);
}

export function assertAllowedReleasePath(name) {
  assert.ok(!isGeneratedReleasePath(name), `Generated output cannot enter distribution: ${name}`);
  assert.ok(!/(?:^|\/)(?:\.git|\.openai|node_modules|work|raw|normalized)(?:\/|$)/i.test(name), `Forbidden distribution path: ${name}`);
  assert.ok(!/(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|.*\.(?:pem|key|csv|pdf|zip|tar|gz))$/i.test(name) || name === '.env.example', `Private or external artifact in distribution: ${name}`);
  assert.ok(!/^docs\/screenshots\//i.test(name), `Historical screenshots are not release assets: ${name}`);
  // Only the deliberately portable verification summaries are public JSON
  // documents. Rehashing a deployment receipt must not approve owner metadata.
  if (/^docs\/.+\.json$/i.test(name)) assert.ok([
    'docs/ALPHA_VERIFICATION.json', 'docs/TAMPA_BAY_VERIFICATION.json',
  ].includes(name), `Unreviewed documentation artifact: ${name}`);
  if (name.startsWith('data/')) assert.ok(['data/sources.json', 'data/chunks.json', 'data/corpus.json', 'data/ingestion-report.json', 'data/verification-report.json', 'data/gis-config.json', 'data/development-config.json'].includes(name), `Unreviewed data artifact: ${name}`);
  if (name.startsWith('evaluation/') && name.endsWith('.json')) assert.ok([
    ...EMPTY_ARRAY_FILES, ...EMPTY_REPORT_FILES, 'evaluation/datasets/benchmark.json', 'evaluation/datasets/quality-benchmark.json', 'evaluation/datasets/program-recall-benchmark.json', 'evaluation/datasets/ground_truth_questions.json',
  ].includes(name), `Historical evaluation artifact: ${name}`);
}

export async function assertSourceOnlyContents(root, paths) {
  const names = new Set(paths);
  for (const name of names) assertAllowedReleasePath(name);
  const read = async name => {
    assert.ok(names.has(name), `Required source-only file missing: ${name}`);
    return JSON.parse(await readFile(join(root, name), 'utf8'));
  };
  for (const name of EMPTY_ARRAY_FILES) assert.deepEqual(await read(name), [], `Downloaded evidence or response packets in ${name}`);
  for (const name of EMPTY_REPORT_FILES) assertEmptyReport(name, await read(name));
  const sources = await read('data/sources.json');
  assert.ok(Array.isArray(sources), 'Source registry must be an array');
  for (const source of sources) {
    assert.equal(source.status, 'unavailable', `Fetched source: ${source.source_id}`);
    assert.equal(source.retrieval_date, null, `Source retrieval date is populated: ${source.source_id}`);
    assert.equal(source.source_updated_date, null);
    for (const key of ['raw_path', 'normalized_path', 'content_hash', 'normalized_content_hash', 'response_url', 'etag', 'last_modified', 'last_attempt', 'content_changed_at', 'content_type', 'record_count', 'searchable_point_count', 'excluded_point_count']) assert.equal(source[key], undefined, `Retained snapshot provenance: ${source.source_id}.${key}`);
    assert.equal(source.last_error, 'Not fetched in this source-only distribution.', `Retained source failure details: ${source.source_id}`);
  }
  const corpus = await read('data/corpus.json');
  exactFields(corpus, ['schema_version', 'generation', 'sources', 'chunks'], 'data/corpus.json');
  assert.equal(corpus.schema_version, 1);
  assert.deepEqual(corpus.sources, sources, 'Atomic corpus and registry disagree');
  assert.deepEqual(corpus.chunks, [], 'Atomic corpus contains downloaded evidence');
  assert.equal(corpus.generation, createHash('sha256').update(JSON.stringify({ sources, chunks: [] })).digest('hex'), 'Corpus generation digest mismatch');
}
