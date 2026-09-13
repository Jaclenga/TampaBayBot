import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { acquireRequest, withOperations, reserveOutbound, operationsStatus, operationalMetrics, defaultLimits } from '../src/lib/operations/control.mjs';
import { corpusReadiness, readinessResponse } from '../src/lib/operations/readiness.mjs';

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

test('outbound and model budgets stop the real dispatch even when adapters catch the limit error', async t => {
  const { env } = setup(t, { TAMPABAYBOT_LIMIT_OUTBOUND_PER_DAY: '2', TAMPABAYBOT_LIMIT_MODEL_PER_DAY: '1' });
  let called = 0;
  assert.equal((await run(env, async () => { await reserveOutbound('model'); called++; return Response.json({ ok: true }); })).status, 200);
  const refused = await run(env, async () => {
    try { await reserveOutbound('model'); called++; } catch { /* Existing adapter fallback. */ }
    return Response.json({ status: 'answered' });
  });
  assert.equal(refused.status, 503); assert.equal(called, 1);
  assert.equal((await run(env, async () => { await reserveOutbound(); return Response.json({ ok: true }); })).status, 200);
  assert.equal((await run(env, async () => { await reserveOutbound(); return Response.json({ ok: true }); })).status, 503);
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
