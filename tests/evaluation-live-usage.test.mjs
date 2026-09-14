import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runLiveSuite } from '../evaluation/suite/live.mjs';
import { makeReport, reportMarkdown, reportJUnit } from '../evaluation/suite/report.mjs';
import { evaluateProgramRecall, recallMarkdown } from '../evaluation/recall.mjs';
import { parseArguments } from '../scripts/eval-suite.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';

// Original synthetic evidence exercises the ordinary guarded h01 application path.
// Every provider response is injected; no retained corpus, credential or model is used.
const now = '2026-09-12T12:00:00.000Z';
const privateFixture = 'synthetic-provider-private-field';
const text = 'Here, you will find resources related to affordable housing and help paying overdue rent and utility bills. Contact the housing office to confirm eligibility and current assistance programs.';
const source = {
  source_id: 'hillsborough-help', title: 'Synthetic housing assistance',
  agency: 'Synthetic housing office', canonical_url: 'https://example.invalid/assistance',
  authoritative_status: 'first-party synthetic fixture', source_type: 'html',
  categories: ['housing'], jurisdiction_ids: ['tampa', 'hillsborough'],
  keywords: ['housing', 'assistance'], language: 'en',
  retrieval_date: now, refresh_days: 30, status: 'available',
};
const chunk = {
  id: 'hillsborough-help-1', source_id: source.source_id, text,
  section: 'Housing assistance', url: source.canonical_url, retrieved_at: now,
  content_hash: createHash('sha256').update(text).digest('hex'),
};
const pricing = { inputUsdPerMillion: 2, outputUsdPerMillion: 6, cachedInputUsdPerMillion: 0.5 };
const expectedTokens = { inputTokens: 100, outputTokens: 25, cachedInputTokens: 20, totalTokens: 125 };
const nativeUsage = { prompt_eval_count: 100, eval_count: 25, prompt_eval_cached_count: 20 };
const compatibleUsage = {
  usage: {
    prompt_tokens: 100, completion_tokens: 25, total_tokens: 125,
    prompt_tokens_details: { cached_tokens: 20 },
    private_field: privateFixture,
  },
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const assertDollars = (actual, expected) => {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) < 1e-12, `Expected approximately ${expected} USD; received ${actual}.`);
};
const config = (provider = 'ollama') => parseLlmConfig({
  LLM_PROVIDER: provider, LLM_BASE_URL: 'http://127.0.0.1:11434',
  LLM_MODEL: 'synthetic-token-usage-model',
});
const options = {
  authorized: true, config: config(), sources: [source], chunks: [chunk], now,
  limit: 1, repeats: 1, budgetMs: 1000, pricing,
};

function reply(init, { provider = 'ollama', usage = nativeUsage, valid = true } = {}) {
  const request = JSON.parse(init.body);
  const evidence = JSON.parse(request.messages.find(message => message.role === 'user').content).evidence;
  const content = valid
    ? JSON.stringify({ selections: evidence.slice(0, 1).map(({ id, quote }) => ({ id, quote })) })
    : privateFixture;
  return json(provider === 'ollama'
    ? { done: true, message: { content }, ...usage }
    : { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }], ...usage });
}

function assertZeroUsage(usage) {
  assert.equal(usage.providerCalls, 0);
  assert.equal(usage.tokens.status, 'no_calls');
  for (const field of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'totalTokens']) {
    assert.equal(usage.tokens[field], 0);
    assert.equal(usage.tokens.known[field], 0);
  }
  assert.equal(usage.cost.status, 'no_calls');
  assert.equal(usage.cost.estimatedUsd, 0);
  assert.equal(usage.cost.knownEstimatedUsd, 0);
  assert.equal(usage.cost.unpricedCalls, 0);
}

test('native Ollama usage survives the guarded live path and reaches all report formats', async () => {
  const rows = await runLiveSuite({ ...options, fetchImpl: async (_, init) => reply(init) });
  assert.equal(rows[0].details.generation.status, 'used');
  assert.equal(rows[0].details.providerCalls, 1);
  assert.deepEqual(rows[0].details.modelCalls, [expectedTokens]);
  assert.equal(rows[0].details.modelUsage.tokens.status, 'complete');
  assertDollars(rows[0].details.modelUsage.cost.estimatedUsd, 0.00032);
  const report = makeReport(rows, { mode: 'live', pricing });
  assert.equal(report.summary.modelUsage.tokens.totalTokens, 125);
  assertDollars(report.summary.modelUsage.cost.estimatedUsd, 0.00032);
  assert.deepEqual(report.summary.suites.live.modelUsage, report.summary.modelUsage);
  assert.equal(report.pricing.inputUsdPerMillion, 2);
  assert.equal(report.pricing.outputUsdPerMillion, 6);
  assert.equal(report.pricing.cachedInputUsdPerMillion, 0.5);
  assert.match(reportMarkdown(report), /125/);
  assert.match(reportMarkdown(report), /0\.00032/);
  assert.match(reportJUnit(report), /name="model\.total_tokens" value="125"/);
  const costProperty = reportJUnit(report).match(/name="model\.estimated_cost_usd" value="([^"]+)"/);
  assert.ok(costProperty);
  assertDollars(Number(costProperty[1]), 0.00032);
});

test('compatible Chat Completions usage maps to the same counters without arbitrary fields', async () => {
  const rows = await runLiveSuite({
    ...options, config: config('openai-compatible'),
    fetchImpl: async (_, init) => reply(init, { provider: 'openai-compatible', usage: compatibleUsage }),
  });
  assert.equal(rows[0].details.generation.status, 'used');
  assert.deepEqual(rows[0].details.modelCalls, [expectedTokens]);
  assertDollars(rows[0].details.modelUsage.cost.estimatedUsd, 0.00032);
  assert.ok(!JSON.stringify(makeReport(rows, { mode: 'live', pricing })).includes(privateFixture));
});

test('accepted output without usage has unknown tokens and cost, never an inferred zero', async () => {
  const rows = await runLiveSuite({ ...options, fetchImpl: async (_, init) => reply(init, { usage: {} }) });
  assert.equal(rows[0].details.generation.status, 'used');
  const usage = rows[0].details.modelUsage;
  assert.equal(usage.providerCalls, 1);
  assert.equal(usage.tokens.status, 'unavailable');
  assert.equal(usage.tokens.totalTokens, null);
  assert.equal(usage.tokens.unreportedCalls, 1);
  assert.equal(usage.cost.status, 'unavailable');
  assert.equal(usage.cost.estimatedUsd, null);
  assert.equal(usage.cost.unpricedCalls, 1);
  const report = makeReport(rows, { mode: 'live', pricing });
  assert.match(reportMarkdown(report), /unknown|unavailable/i);
  assert.match(reportJUnit(report), /name="model\.estimated_cost_usd" value="unknown"/);
});

test('rejected model output still counts the usage and cost incurred by its provider request', async () => {
  const rows = await runLiveSuite({ ...options, fetchImpl: async (_, init) => reply(init, { valid: false }) });
  assert.deepEqual(rows[0].details.generation, { status: 'fallback', reason: 'invalid_output' });
  assert.equal(rows[0].checks.find(check => check.id === 'model_output_accepted').passed, false);
  assert.equal(rows[0].details.modelUsage.tokens.totalTokens, 125);
  assertDollars(rows[0].details.modelUsage.cost.estimatedUsd, 0.00032);
  const report = makeReport(rows, { mode: 'live', pricing });
  assert.equal(report.status, 'failed');
  assertDollars(report.summary.modelUsage.cost.estimatedUsd, 0.00032);
  assert.ok(!JSON.stringify(report).includes(privateFixture));
});

test('HTTP and transport failures count attempts while leaving unreported spending unknown', async () => {
  for (const fetchImpl of [
    async () => json({ error: privateFixture }, 503),
    async () => { throw new Error(privateFixture); },
  ]) {
    const rows = await runLiveSuite({ ...options, fetchImpl });
    assert.equal(rows[0].details.generation.status, 'fallback');
    assert.equal(rows[0].details.providerCalls, 1);
    assert.equal(rows[0].details.modelCalls.length, 1);
    assert.equal(rows[0].details.modelUsage.tokens.totalTokens, null);
    assert.equal(rows[0].details.modelUsage.cost.estimatedUsd, null);
    assert.equal(rows[0].details.modelUsage.cost.unpricedCalls, 1);
    assert.ok(!JSON.stringify(rows).includes(privateFixture));
  }
});

test('mixed reported and failed requests retain known subtotals without presenting them as complete', async () => {
  let calls = 0;
  const rows = await runLiveSuite({
    ...options, repeats: 3,
    fetchImpl: async (_, init) => {
      calls++;
      if (calls === 3) return json({ error: privateFixture }, 503);
      return reply(init, { usage: calls === 1 ? nativeUsage : {
        prompt_eval_count: 200, eval_count: 50, prompt_eval_cached_count: 0,
      } });
    },
  });
  // Reports derive measured totals from call records, not supplied aggregate claims.
  rows[0].details.modelUsage = { providerCalls: 0, cost: { estimatedUsd: 0 } };
  const report = makeReport(rows, { mode: 'live', pricing });
  const usage = report.summary.modelUsage;
  assert.equal(usage.providerCalls, 3);
  assert.equal(usage.tokens.status, 'partial');
  assert.equal(usage.tokens.inputTokens, null);
  assert.equal(usage.tokens.totalTokens, null);
  assert.equal(usage.tokens.known.inputTokens, 300);
  assert.equal(usage.tokens.known.totalTokens, 375);
  assert.equal(usage.tokens.reportedCalls, 2);
  assert.equal(usage.tokens.unreportedCalls, 1);
  assert.equal(usage.cost.status, 'partial');
  assert.equal(usage.cost.estimatedUsd, null);
  assertDollars(usage.cost.knownEstimatedUsd, 0.00102);
  assert.equal(usage.cost.pricedCalls, 2);
  assert.equal(usage.cost.unpricedCalls, 1);
  assertDollars(report.cases[0].details.modelUsage.cost.estimatedUsd, 0.00032);
});

test('pricing is explicit for local inference and a missing cached rate uses the input rate', async () => {
  for (const [rates, expected] of [
    [null, null],
    [{ inputUsdPerMillion: 0, outputUsdPerMillion: 0 }, 0],
    [{ inputUsdPerMillion: 2, outputUsdPerMillion: 6 }, 0.00035],
  ]) {
    const rows = await runLiveSuite({ ...options, pricing: rates, fetchImpl: async (_, init) => reply(init) });
    assert.equal(rows[0].details.modelUsage.tokens.totalTokens, 125);
    assert.equal(rows[0].details.modelUsage.cost.estimatedUsd, expected);
    assert.equal(rows[0].details.modelUsage.cost.status, rates ? 'estimated' : 'unavailable');
  }
});

test('conservative bypasses and cancelled unexecuted cases report zero requests and zero cost', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Unexpected synthetic fetch.'); };
  const skipped = await runLiveSuite({ ...options, sources: [], chunks: [], fetchImpl });
  assert.equal(skipped[0].details.generation.status, 'skipped');
  const aborted = await runLiveSuite({ ...options, limit: 2, signal: AbortSignal.abort(), fetchImpl });
  assert.equal(calls, 0);
  for (const row of [...skipped, ...aborted]) {
    assert.equal(row.details.providerCalls, 0);
    assert.deepEqual(row.details.modelCalls, []);
    assertZeroUsage(row.details.modelUsage);
  }
  assertZeroUsage(makeReport(aborted, { mode: 'live', pricing }).summary.modelUsage);
});

test('offline synthetic provider counters cannot be mistaken for real inference costs', () => {
  const report = makeReport([{
    id: 'synthetic-call', suite: 'providers', title: 'Synthetic provider scenario',
    fixture: 'synthetic', durationMs: 0,
    checks: [{ id: 'fixture', kind: 'integrity', passed: true }],
    details: { providerCalls: 1, modelCalls: [expectedTokens] },
  }]);
  assertZeroUsage(report.summary.modelUsage);
  assertZeroUsage(report.summary.suites.providers.modelUsage);
  assertZeroUsage(report.cases[0].details.modelUsage);
});

test('legacy live reports without call measurement keep usage unknown', () => {
  const report = makeReport([{
    id: 'legacy', suite: 'live', title: 'Legacy synthetic report', fixture: 'synthetic',
    durationMs: 0, checks: [{ id: 'fixture', kind: 'integrity', passed: true }],
  }], { mode: 'live', pricing });
  assert.equal(report.summary.modelUsage, null);
  assert.equal(report.cases[0].details.modelUsage, null);
});

test('CLI parses explicit rates and rejects incomplete, invalid or non-live pricing', () => {
  const flags = parseArguments([
    '--mode', 'live', '--input-usd-per-million', '2', '--output-usd-per-million', '6',
    '--cached-input-usd-per-million', '0.5',
  ]);
  assert.deepEqual(flags.pricing, pricing);
  assert.equal(parseArguments(['--mode', 'live']).pricing, null);
  const pair = ['--input-usd-per-million', '2', '--output-usd-per-million', '6'];
  for (const args of [
    pair,
    ['--mode', 'compare', ...pair],
    ['--mode', 'live', '--input-usd-per-million', '2'],
    ['--mode', 'live', '--output-usd-per-million', '6'],
    ['--mode', 'live', '--cached-input-usd-per-million', '0.5'],
    ['--mode', 'live', '--input-usd-per-million', '-1', '--output-usd-per-million', '6'],
    ['--mode', 'live', '--input-usd-per-million', 'NaN', '--output-usd-per-million', '6'],
    ['--mode', 'live', '--input-usd-per-million', 'Infinity', '--output-usd-per-million', '6'],
    ['--mode', 'live', ...pair, '--cached-input-usd-per-million', '-1'],
    ['--mode', 'live', ...pair, '--input-usd-per-million', '2'],
  ]) assert.throws(() => parseArguments(args));
});

test('program recall reports its disabled-model zero usage without changing evaluability', async () => {
  const benchmark = {
    schema_version: 1, reference_date: now,
    scope: 'One original synthetic housing resource.', label_policy: 'Relevant to a generic housing inquiry.',
    programs: [{
      program_id: 'synthetic-housing', title: 'Synthetic housing assistance',
      evidence: [{ source_id: source.source_id, chunk_id: chunk.id, text_sha256: chunk.content_hash }],
    }],
    cases: [{
      id: 'synthetic-housing-query', question: 'Where can I find help paying for housing?',
      jurisdiction_id: 'tampa', language: 'en', expected_program_ids: ['synthetic-housing'],
      rationale: 'Synthetic resource addresses the housing inquiry.', tags: ['housing'],
    }],
  };
  const report = await evaluateProgramRecall({ benchmark, sources: [source], chunks: [chunk] });
  assertZeroUsage(report.summary.modelUsage);
  assert.match(recallMarkdown(report), /token/i);
  const empty = await evaluateProgramRecall({ benchmark, sources: [], chunks: [] });
  assertZeroUsage(empty.summary.modelUsage);
  assert.equal(empty.status, 'not_evaluable');
});
