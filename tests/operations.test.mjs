import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { acquireRequest, withOperations, reserveOutbound, operationsStatus, operationalMetrics,
  defaultLimits, aiUsage, markAiOutcome, markAiProviderQuota } from '../src/lib/operations/control.mjs';
import { corpusReadiness, readinessResponse } from '../src/lib/operations/readiness.mjs';
import { parseLlmConfig, synthesizeAnswer, createWorkersAiProvider } from '../src/lib/llm/index.mjs';

// Execute the real SQL against SQLite, including rollback, rather than mocking
// admission results. Independent binding wrappers share the same database.
function binding(sqlite) {
  const prepare = sql => {
    const build = args => ({
      bind: (...values) => build(values),
      all: async () => ({ success: true, results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args),
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }),
      execute: () => ({ success: true, results: sqlite.prepare(sql).all(...args) }),
    });
    return build([]);
  };
  return { prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
}
function setup(t, overrides = {}) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  const env = { DB: binding(sqlite), TAMPABAYBOT_LIMIT_SECRET: 'synthetic-test-secret-at-least-32-characters',
    TAMPABAYBOT_MONITOR_TOKEN: 'synthetic-monitor-secret-at-least-32-characters', ...overrides };
  return { sqlite, env };
}
function request(path = '/api/ask', ip = '192.0.2.1') {
  return new Request(`https://synthetic.invalid${path}`, { headers: { 'CF-Connecting-IP': ip } });
}
async function run(env, dispatch, req = request()) {
  const tasks = [];
  const response = await withOperations(req, env, { waitUntil: promise => tasks.push(promise) }, dispatch);
  await Promise.all(tasks);
  return response;
}

test('shared admission remains bounded across independent Worker bindings and clients', async t => {
  const { sqlite, env } = setup(t);
  const independent = { ...env, DB: binding(sqlite) };
  const limits = { ...defaultLimits, concurrency: 3, clientConcurrency: 2 };
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => acquireRequest(request('/api/property', `192.0.2.${i}`), i % 2 ? env : independent, { limits })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.status === 429));
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM ops_leases').get().n, 3);
  assert.equal(sqlite.prepare("SELECT value FROM ops_counters WHERE key LIKE 'request:day:%'").get().value, 3);
});

test('per-client limits, global daily limits, retry headers and lease release survive new instances', async t => {
  const { sqlite, env } = setup(t, { TAMPABAYBOT_LIMIT_CLIENT_PER_MINUTE: '2', TAMPABAYBOT_LIMIT_REQUESTS_PER_DAY: '3' });
  const dispatch = async () => Response.json({ ok: true });
  assert.equal((await run(env, dispatch)).status, 200);
  assert.equal((await run(env, dispatch)).status, 200);
  const limited = await run({ ...env, DB: binding(sqlite) }, dispatch);
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.equal((await run(env, dispatch, request('/api/ask', '192.0.2.2'))).status, 200);
  assert.equal((await run(env, dispatch, request('/api/ask', '192.0.2.3'))).status, 429);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM ops_leases').get().n, 0);
});

test('request admission reports the UTC day when the daily cap is exhausted', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_REQUESTS_PER_DAY: '1' });
  const clock = Date.now;
  t.after(() => { Date.now = clock; });
  const now = Date.parse('2026-10-09T13:03:01Z');
  Date.now = () => now;
  const dispatch = async () => Response.json({ ok: true });
  assert.equal((await run(env, dispatch)).status, 200);
  const denied = await run(env, dispatch);
  assert.equal(denied.status, 429);
  assert.equal((await denied.json()).code, 'request_limit');
  assert.equal(Number(denied.headers.get('Retry-After')), (Date.parse('2026-10-10T00:00:00Z') - now) / 1000);
});

test('outbound and model budgets stop the real dispatch even when adapters catch the limit error', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_OUTBOUND_PER_DAY: '2', TAMPABAYBOT_LIMIT_MODEL_PER_DAY: '1' });
  let called = 0;
  assert.equal((await run(env, async () => { await reserveOutbound('model'); called++; return Response.json({ ok: true }); })).status, 200);
  const refused = await run(env, async () => {
    try { await reserveOutbound('model'); called++; } catch { /* Existing adapter fallback. */ }
    return Response.json({ status: 'answered' });
  });
  assert.equal(refused.status, 429); assert.equal((await refused.json()).code, 'ai_global_limit'); assert.equal(called, 1);
  assert.equal((await run(env, async () => { await reserveOutbound(); return Response.json({ ok: true }); })).status, 200);
  assert.equal((await run(env, async () => { await reserveOutbound(); return Response.json({ ok: true }); })).status, 503);
});

test('a model request refused by the shared outbound cap is counted as rejected AI', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_OUTBOUND_PER_DAY: '1' });
  assert.equal((await run(env, async () => {
    await reserveOutbound('gis'); return Response.json({ ok: true });
  })).status, 200);
  const refused = await run(env, async () => {
    try { await reserveOutbound('model'); } catch { /* The operations gate sets the response. */ }
    return Response.json({ wrong: true });
  });
  assert.equal(refused.status, 503);
  assert.equal((await refused.json()).code, 'outbound_budget');
  const metrics = (await (await operationalMetrics(new Request('https://synthetic.invalid/api/operations', {
    headers: { Authorization: `Bearer ${env.TAMPABAYBOT_MONITOR_TOKEN}` },
  }), env)).json()).ai;
  assert.equal(metrics.rejected, 1);
  assert.equal(metrics.succeeded, 0);
});

test('outbound model retry timing follows the exhausted minute or UTC day counter', async t => {
  const clock = Date.now;
  t.after(() => { Date.now = clock; });
  const now = Date.parse('2026-10-09T13:03:01Z');
  Date.now = () => now;
  for (const [overrides, expectedRetry] of [
    [{ TAMPABAYBOT_LIMIT_OUTBOUND_PER_MINUTE: '1' }, 59],
    [{ TAMPABAYBOT_LIMIT_OUTBOUND_PER_DAY: '1' }, (Date.parse('2026-10-10T00:00:00Z') - now) / 1000],
  ]) {
    const { env } = setup(t, overrides);
    const dispatch = async () => {
      const release = await reserveOutbound('model', { provider: 'openai-compatible' });
      await release?.();
      return Response.json({ ok: true });
    };
    assert.equal((await run(env, dispatch)).status, 200);
    const denied = await run(env, dispatch);
    assert.equal(denied.status, 503);
    assert.equal((await denied.json()).code, 'outbound_budget');
    assert.equal(Number(denied.headers.get('Retry-After')), expectedRetry);
  }
});

test('shared configuration and database failures fail closed without leaking exceptions', async () => {
  for (const env of [{ TAMPABAYBOT_OPERATIONS_MODE: 'shared' }, { TAMPABAYBOT_OPERATIONS_MODE: 'typo' },
    { DB: { prepare: () => { throw new Error('private database secret'); }, batch: () => {} } }]) {
    let reached = false;
    const response = await run(env, async () => { reached = true; return new Response('wrong'); });
    assert.equal(response.status, 503); assert.equal(reached, false);
    assert.doesNotMatch(await response.text(), /private database secret/);
  }
});

test('encoded API paths cannot bypass production limits and maintenance leaves health reachable', async t => {
  const { env } = setup(t, { TAMPABAYBOT_MAINTENANCE: '1' });
  for (const path of ['/api/ask', '/%61pi/ask', '/api%2fask', '/%2561pi/ask', '//api/ask']) {
    assert.equal((await run(env, async () => new Response('wrong'), request(path))).status, 503, path);
  }
  assert.equal((await run(env, async () => new Response('alive'), request('/api/health'))).status, 200);
  assert.equal((await operationsStatus(env)).ready, false);
});

test('expired leases/counters recover and stored telemetry contains no resident inputs or IP addresses', async t => {
  const { sqlite, env } = setup(t);
  const past = Date.now() - 120000;
  await acquireRequest(request(), env, { now: past });
  const response = await run(env, async () => { throw new Error('My private address is 123 Main St'); });
  assert.equal(response.status, 503);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM ops_leases').get().n, 0);
  const values = JSON.stringify(['ops_counters', 'ops_metrics'].map(name => sqlite.prepare(`SELECT * FROM ${name}`).all()));
  assert.doesNotMatch(values, /192\.0\.2|Main St|synthetic-test-secret|api\/ask/);
  const denied = await operationalMetrics(request('/api/operations'), env);
  assert.equal(denied.status, 404);
  const metrics = await operationalMetrics(new Request('https://synthetic.invalid/api/operations', { headers: { Authorization: `Bearer ${env.TAMPABAYBOT_MONITOR_TOKEN}` } }), env);
  const report = await metrics.json(); assert.equal(report.requests, 1); assert.equal(report.errors, 1); assert.equal(report.retention_days, 7);
});

test('readiness distinguishes stale, unavailable, missing, future and empty evidence from a fresh corpus', () => {
  const now = new Date('2026-09-13T12:00:00Z');
  const source = { source_id: 'synthetic', status: 'available', retrieval_date: '2026-09-13', refresh_days: 7 };
  const chunk = { source_id: 'synthetic', text: 'Synthetic evidence.' };
  const fresh = corpusReadiness([source], [chunk], now);
  assert.equal(fresh.ready, true);
  assert.equal(corpusReadiness([source, { source_id: 'live', ingestion_method: 'live-query-only' }], [chunk], now).ready, true);
  for (const [changedSource, changedChunk, reason] of [
    [{ ...source, retrieval_date: '2020-01-01' }, chunk, 'stale_evidence'],
    [{ ...source, retrieval_date: '2030-01-01' }, chunk, 'stale_evidence'],
    [{ ...source, status: 'unavailable' }, chunk, 'unavailable_sources'],
    [source, { ...chunk, source_id: 'missing' }, 'invalid_evidence'],
  ]) { const result = corpusReadiness([changedSource], [changedChunk], now); assert.equal(result.ready, false); assert.ok(result.reasons.includes(reason)); }
  assert.equal(corpusReadiness([source], [], now).status, 'no_evidence');
  assert.equal(readinessResponse(fresh, { ready: false, mode: 'local' }, 'test', 'test').ready, false);
  assert.equal(readinessResponse(fresh, { ready: true, mode: 'shared' }, 'test', 'test').status, 'ready');
});

test('per-client concurrency cannot reset while leases cross the minute boundary', async t => {
  const { env } = setup(t);
  const start = Math.floor(Date.now() / 60000) * 60000 + 59000;
  const limits = { ...defaultLimits, clientConcurrency: 1 };
  await acquireRequest(request(), env, { now: start, limits });
  await assert.rejects(acquireRequest(request(), env, { now: start + 1000, limits }), { status: 429 });
});

test('aborted requests cannot hide budget cancellation behind a successful adapter fallback', async t => {
  const { env } = setup(t);
  const controller = new AbortController(); controller.abort();
  const response = await run(env, async () => { try { await reserveOutbound(); } catch { /* Adapter failure handling. */ } return new Response('answered'); },
    new Request(request(), { signal: controller.signal }));
  assert.equal(response.status, 504);
});

test('unresponsive shared storage returns a bounded unavailable response', async () => {
  const env = { TAMPABAYBOT_OPERATIONS_MODE: 'shared', DB: { prepare: () => ({}), batch: () => new Promise(() => {}) } };
  const pending = [];
  const started = performance.now();
  const response = await withOperations(request(), env, { waitUntil: work => pending.push(work) }, async () => new Response('wrong'));
  assert.equal(response.status, 503); assert.ok(performance.now() - started < 3500);
  await Promise.all(pending);
});

test('public readiness never bypasses request budgets with unmetered database calls', async () => {
  let calls = 0;
  const env = { TAMPABAYBOT_OPERATIONS_MODE: 'shared', TAMPABAYBOT_LIMIT_SECRET: 'fixture-'.repeat(8),
    DB: { prepare: () => { calls++; throw new Error('should not query'); }, batch: () => { calls++; } } };
  for (let index = 0; index < 20; index++) {
    const status = await operationsStatus(env);
    assert.equal(status.ready, false); assert.equal(status.reason, 'authenticated_probe_required');
  }
  assert.equal(calls, 0);
});

test('late timer scheduling cannot turn an overdue dispatch into success', async t => {
  const clock = Date.now;
  t.after(() => { Date.now = clock; });
  const response = await run({ TAMPABAYBOT_OPERATIONS_MODE: 'local' }, async () => {
    Date.now = () => clock() + 31000;
    return Response.json({ status: 'answered' });
  });
  assert.equal(response.status, 504);
});

test('visitor AI attempts count atomically to 15 and expose only day-scoped remaining usage', async t => {
  const { sqlite, env } = setup(t, { TAMPABAYBOT_LIMIT_CLIENT_PER_MINUTE: '20' });
  let calls = 0;
  const dispatch = async () => {
    const release = await reserveOutbound('model'); calls++;
    await release?.(); markAiOutcome('succeeded');
    return Response.json({ ai: await aiUsage() });
  };
  for (let index = 0; index < 15; index++) {
    const response = await run(env, dispatch);
    assert.equal(response.status, 200, `attempt ${index + 1}`);
    const value = (await response.json()).ai;
    assert.equal(value.used, index + 1);
    assert.equal(value.remaining, 14 - index);
    assert.equal(value.limit, 15);
  }
  const denied = await run({ ...env, DB: binding(sqlite) }, dispatch);
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Cache-Control'), 'no-store');
  const body = await denied.json();
  assert.equal(body.code, 'ai_visitor_limit');
  assert.equal(body.aiUsage.remaining, 0);
  assert.equal(body.aiUsage.reason, 'ai_visitor_limit');
  assert.equal(calls, 15);
  const usageResponse = await run(env, async () => Response.json({ ai: await aiUsage() }));
  assert.equal((await usageResponse.json()).ai.remaining, 0);
  const admin = await operationalMetrics(new Request('https://synthetic.invalid/api/operations', {
    headers: { Authorization: `Bearer ${env.TAMPABAYBOT_MONITOR_TOKEN}` },
  }), env);
  const metrics = (await admin.json()).ai;
  assert.equal(metrics.succeeded, 15);
  assert.equal(metrics.failed, 0);
  assert.equal(metrics.rejected, 1);
});

test('global AI cap applies across visitors and separate D1 bindings', async t => {
  const { sqlite, env } = setup(t, { TAMPABAYBOT_LIMIT_MODEL_PER_DAY: '2' });
  let calls = 0;
  const dispatch = async () => {
    const release = await reserveOutbound('model'); calls++;
    await release?.(); markAiOutcome('succeeded');
    return Response.json({ ok: true });
  };
  assert.equal((await run(env, dispatch, request('/api/ask', '192.0.2.1'))).status, 200);
  assert.equal((await run({ ...env, DB: binding(sqlite) }, dispatch, request('/api/ask', '192.0.2.2'))).status, 200);
  const denied = await run(env, dispatch, request('/api/ask', '192.0.2.3'));
  assert.equal(denied.status, 429);
  assert.equal((await denied.json()).code, 'ai_global_limit');
  assert.equal(calls, 2);
  assert.equal(sqlite.prepare("SELECT value FROM ops_counters WHERE key LIKE 'model:day:%'").get().value, 2);
});

test('concurrent same-visitor requests cannot oversubscribe the daily AI cap', async t => {
  const { sqlite, env } = setup(t, {
    TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY: '3',
    TAMPABAYBOT_LIMIT_CLIENT_PER_MINUTE: '30',
    TAMPABAYBOT_LIMIT_CLIENT_CONCURRENCY: '20',
    TAMPABAYBOT_LIMIT_CONCURRENCY: '30',
    TAMPABAYBOT_LIMIT_MODEL_CONCURRENCY: '20',
  });
  let called = 0;
  const dispatch = async () => {
    const release = await reserveOutbound('model'); called++;
    await release?.(); return Response.json({ ok: true });
  };
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    run(index % 2 ? env : { ...env, DB: binding(sqlite) }, dispatch)));
  assert.equal(results.filter(result => result.status === 200).length, 3);
  assert.equal(results.filter(result => result.status === 429).length, 17);
  assert.equal(called, 3);
});

test('simultaneous inference cannot pass the configured active lease cap', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_MODEL_CONCURRENCY: '1' });
  let enter, leave;
  const entered = new Promise(resolve => { enter = resolve; });
  const hold = new Promise(resolve => { leave = resolve; });
  const waits = [];
  const first = withOperations(request('/api/ask', '192.0.2.1'), env,
    { waitUntil: work => waits.push(work) }, async () => {
      const release = await reserveOutbound('model'); enter();
      await hold; await release?.(); markAiOutcome('succeeded');
      return Response.json({ ok: true });
    });
  await entered;
  const denied = await run(env, async () => {
    await reserveOutbound('model'); return Response.json({ wrong: true });
  }, request('/api/ask', '192.0.2.2'));
  assert.equal(denied.status, 429);
  const body = await denied.json();
  assert.equal(body.code, 'ai_concurrency_limit');
  assert.equal(body.aiUsage.available, false);
  leave(); assert.equal((await first).status, 200);
  await Promise.all(waits);
  assert.equal((await run(env, async () => {
    const release = await reserveOutbound('model'); await release?.(); return Response.json({ ok: true });
  }, request('/api/ask', '192.0.2.3'))).status, 200);
});

test('daily visitor and global AI counters reset at midnight UTC', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY: '1', TAMPABAYBOT_LIMIT_MODEL_PER_DAY: '1' });
  const actualClock = Date.now;
  t.after(() => { Date.now = actualClock; });
  const dayOne = Date.parse('2026-10-09T23:59:50Z');
  Date.now = () => dayOne;
  const dispatch = async () => {
    const release = await reserveOutbound('model'); await release?.();
    return Response.json({ ai: await aiUsage() });
  };
  const first = await run(env, dispatch);
  assert.equal((await first.json()).ai.resetAt, '2026-10-10T00:00:00.000Z');
  assert.equal((await run(env, dispatch)).status, 429);
  Date.now = () => Date.parse('2026-10-10T00:00:01Z');
  const next = await run(env, dispatch);
  assert.equal(next.status, 200);
  assert.equal((await next.json()).ai.used, 1);
});

test('a request spanning midnight uses the new day visitor identifier', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY: '1' });
  const actualClock = Date.now;
  t.after(() => { Date.now = actualClock; });
  Date.now = () => Date.parse('2026-10-09T23:59:50Z');
  const crossing = await run(env, async () => {
    Date.now = () => Date.parse('2026-10-10T00:00:01Z');
    const release = await reserveOutbound('model'); await release?.();
    return Response.json({ ai: await aiUsage() });
  });
  assert.equal(crossing.status, 200);
  assert.equal((await crossing.json()).ai.used, 1);
  const denied = await run(env, async () => {
    await reserveOutbound('model'); return Response.json({ wrong: true });
  });
  assert.equal(denied.status, 429);
  assert.equal((await denied.json()).code, 'ai_visitor_limit');
});

test('provider quota circuit rejects repeat inference without consuming new attempts', async t => {
  const { sqlite, env } = setup(t);
  const first = await run(env, async () => {
    const release = await reserveOutbound('model', { provider: 'workers-ai' });
    await markAiProviderQuota(); markAiOutcome('failed', 'provider_quota');
    await release?.(); return Response.json({ fallback: true });
  });
  assert.equal(first.status, 200);
  const second = await run(env, async () => {
    try { await reserveOutbound('model', { provider: 'workers-ai' }); }
    catch (error) { return Response.json({ reason: error.code, ai: await aiUsage() }); }
    return Response.json({ wrong: true });
  });
  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.reason, 'ai_provider_quota');
  assert.equal(body.ai.reason, 'provider_quota');
  assert.equal(sqlite.prepare("SELECT value FROM ops_counters WHERE key LIKE 'model:day:%'").get().value, 1);
  const metrics = (await (await operationalMetrics(new Request('https://synthetic.invalid/api/operations', {
    headers: { Authorization: `Bearer ${env.TAMPABAYBOT_MONITOR_TOKEN}` },
  }), env)).json()).ai;
  assert.equal(metrics.failed, 1);
  assert.equal(metrics.provider_quota, 2);
  assert.equal(metrics.rejected, 1);
});

test('a nested Workers AI 3036 response triggers cited fallback and shared quota circuit', async t => {
  const { sqlite, env } = setup(t);
  let calls = 0;
  const binding = { async run() { calls++; throw { status: 429, errors: [{ code: 3036 }] }; } };
  const config = parseLlmConfig({ LLM_PROVIDER: 'workers-ai', AI: binding });
  const baseline = {
    status: 'answered', query: 'Where can I find help?', answer: 'Deterministic answer. [E1]',
    evidence: [{ id: 'E1', title: 'Synthetic public notice', quote: 'Contact the public agency for assistance.' }],
  };
  const dispatch = async () => {
    const result = await synthesizeAnswer(baseline, {
      config, provider: createWorkersAiProvider(binding, config),
    });
    return Response.json({ generation: result.generation, answer: result.answer,
      ai: await aiUsage({ provider: 'workers-ai' }) });
  };
  for (let index = 0; index < 2; index++) {
    const response = await run(env, dispatch);
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.generation.reason, 'provider_quota');
    assert.equal(value.answer, baseline.answer);
    assert.equal(value.ai.available, false);
    assert.equal(value.ai.reason, 'provider_quota');
  }
  assert.equal(calls, 1);
  assert.equal(sqlite.prepare("SELECT value FROM ops_counters WHERE key LIKE 'model:day:%'").get().value, 1);
});

test('inference-disabled and unsupported-evidence questions do not spend AI allowance', async t => {
  const { env } = setup(t);
  let calls = 0;
  const binding = { async run() { calls++; throw new Error('must not run'); } };
  const config = parseLlmConfig({ LLM_PROVIDER: 'workers-ai', AI: binding });
  const response = await run(env, async () => {
    const result = await synthesizeAnswer({ status: 'insufficient_evidence', query: 'Synthetic?',
      answer: 'No source found.', evidence: [] }, { config, provider: createWorkersAiProvider(binding, config) });
    return Response.json({ generation: result.generation, ai: await aiUsage({ configured: false }) });
  });
  const value = await response.json();
  assert.equal(value.generation.status, 'skipped');
  assert.equal(value.ai.used, 0);
  assert.equal(value.ai.remaining, 15);
  assert.equal(value.ai.reason, 'ai_configuration');
  assert.equal(calls, 0);
});

test('Workers AI cannot run in implicit or explicit unmetered local mode', async () => {
  let calls = 0;
  const binding = { async run() { calls++; return { response: 'wrong' }; } };
  const config = parseLlmConfig({ LLM_PROVIDER: 'workers-ai', AI: binding });
  const baseline = { status: 'answered', query: 'Synthetic housing help?',
    answer: 'Deterministic cited answer. [E1]',
    evidence: [{ id: 'E1', title: 'Synthetic public notice', quote: 'Contact the public agency for assistance.' }] };
  for (const env of [{}, { TAMPABAYBOT_OPERATIONS_MODE: 'local' }]) {
    const result = await run(env, async () => {
      const answer = await synthesizeAnswer(baseline, {
        config, provider: createWorkersAiProvider(binding, config),
      });
      return Response.json({ generation: answer.generation, answer: answer.answer,
        ai: await aiUsage({ provider: 'workers-ai' }) });
    });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.generation.reason, 'ai_configuration');
    assert.equal(body.answer, baseline.answer);
    assert.equal(body.ai.reason, 'ai_configuration');
    assert.equal(body.ai.available, false);
  }
  assert.equal(calls, 0);
});

test('HTTP model providers cannot run in implicit or explicit unmetered API mode', async () => {
  const baseline = { status: 'answered', query: 'Where can I find help?',
    answer: 'Deterministic cited answer. [E1]',
    evidence: [{ id: 'E1', title: 'Synthetic public notice', quote: 'Contact the public agency for assistance.' }] };
  let calls = 0;
  for (const provider of ['ollama', 'openai-compatible']) {
    const config = parseLlmConfig({ LLM_PROVIDER: provider, LLM_MODEL: 'synthetic-model',
      LLM_BASE_URL: provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.example.com/v1' });
    for (const env of [{}, { TAMPABAYBOT_OPERATIONS_MODE: 'local' }]) {
      const response = await run(env, async () => {
        const answer = await synthesizeAnswer(baseline, { config,
          fetchImpl: async () => { calls++; throw new Error('must not run'); } });
        return Response.json({ generation: answer.generation, answer: answer.answer,
          ai: await aiUsage({ provider }) });
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.generation.reason, 'ai_configuration');
      assert.equal(body.answer, baseline.answer);
      assert.equal(body.ai.reason, 'ai_configuration');
      assert.equal(body.ai.available, false);
    }
  }
  assert.equal(calls, 0);
});

test('explicit local model opt-in works only with a loopback app URL and loopback endpoint', async () => {
  const env = { TAMPABAYBOT_OPERATIONS_MODE: 'local', TAMPABAYBOT_ALLOW_UNMETERED_LOCAL_AI: '1' };
  const quote = 'Contact the public agency for assistance.';
  const baseline = { status: 'answered', query: 'Where can I find help?',
    answer: 'Deterministic cited answer. [E1]', evidence: [{ id: 'E1', title: 'Synthetic public notice', quote }] };
  const localRequest = new Request('http://127.0.0.1:3000/api/ask');
  const publicRequest = new Request('https://public.example.com/api/ask', {
    headers: { Origin: 'http://127.0.0.1:3000' },
  });
  const localConfig = parseLlmConfig({ LLM_PROVIDER: 'ollama', LLM_MODEL: 'synthetic-model',
    LLM_BASE_URL: 'http://127.0.0.1:11434' });
  const remoteConfig = parseLlmConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'synthetic-model',
    LLM_BASE_URL: 'https://api.example.com/v1' });
  let calls = 0;
  const dispatch = config => async () => {
    const answer = await synthesizeAnswer(baseline, { config, fetchImpl: async () => {
      calls++;
      return Response.json({ done: true, message: {
        content: JSON.stringify({ selections: [{ id: 'E1', quote }] }) } });
    } });
    return Response.json({ generation: answer.generation,
      ai: await aiUsage({ provider: config.provider, locality: config.locality }) });
  };
  const allowed = await run(env, dispatch(localConfig), localRequest);
  assert.equal(allowed.status, 200);
  const allowedBody = await allowed.json();
  assert.equal(allowedBody.generation.status, 'used');
  assert.equal(allowedBody.ai.available, true);
  assert.equal(allowedBody.ai.reason, 'local_unmetered');
  assert.equal(allowedBody.ai.resetAt, null);
  assert.equal(calls, 1);
  for (const [config, req] of [[localConfig, publicRequest], [remoteConfig, localRequest]]) {
    const denied = await run(env, dispatch(config), req);
    assert.equal(denied.status, 200);
    const body = await denied.json();
    assert.equal(body.generation.reason, 'ai_configuration');
    assert.equal(body.ai.available, false);
    assert.equal(body.ai.reason, 'ai_configuration');
  }
  assert.equal(calls, 1);
});

test('shared visitor AI cap also bounds built-in HTTP provider calls', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY: '1' });
  const config = parseLlmConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'synthetic-model',
    LLM_BASE_URL: 'https://api.example.com/v1' });
  const quote = 'Contact the public agency for assistance.';
  const baseline = { status: 'answered', query: 'Where can I find help?',
    answer: 'Deterministic cited answer. [E1]', evidence: [{ id: 'E1', title: 'Synthetic public notice', quote }] };
  let calls = 0;
  const dispatch = async () => {
    const answer = await synthesizeAnswer(baseline, { config, fetchImpl: async () => {
      calls++;
      return Response.json({ choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify({ selections: [{ id: 'E1', quote }] }) } }] });
    } });
    return Response.json({ generation: answer.generation });
  };
  assert.equal((await run(env, dispatch)).status, 200);
  const denied = await run(env, dispatch);
  assert.equal(denied.status, 429);
  assert.equal((await denied.json()).code, 'ai_visitor_limit');
  assert.equal(calls, 1);
});

test('AI usage records contain no IP, prompt, conversation or secret material', async t => {
  const { sqlite, env } = setup(t);
  const address = '192.0.2.77';
  const prompt = 'My private housing crisis is at 123 Secret Street';
  const privateRequest = new Request('https://synthetic.invalid/api/ask', {
    method: 'POST', headers: { 'CF-Connecting-IP': address, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: prompt }),
  });
  const response = await run(env, async () => {
    const release = await reserveOutbound('model', { provider: 'workers-ai' });
    await markAiProviderQuota(); markAiOutcome('failed', 'provider_quota');
    await release?.(); return Response.json({ fallback: true });
  }, privateRequest);
  assert.equal(response.status, 200);
  const stored = JSON.stringify(['ops_counters', 'ops_ai_leases', 'ops_ai_circuit', 'ops_ai_metrics']
    .map(table => sqlite.prepare(`SELECT * FROM ${table}`).all()));
  for (const sensitive of [address, prompt, '123 Secret Street', env.TAMPABAYBOT_LIMIT_SECRET])
    assert.equal(stored.includes(sensitive), false);
});
