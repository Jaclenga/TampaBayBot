import test from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke } from '../scripts/smoke.mjs';
import { operationsStatus } from '../src/lib/operations/control.mjs';
import { corpusReadiness, readinessResponse } from '../src/lib/operations/readiness.mjs';
import { makeDemoCorpus } from './fixtures/demo-corpus.mjs';

const now = new Date('2026-09-16T12:00:00Z');
const corpus = makeDemoCorpus(now);
const fresh = corpusReadiness(corpus.sources, corpus.chunks, now);
const base = 'https://smoke-fixture.invalid';
const candidate = { address: '315 E KENNEDY BLVD, TAMPA', latitude: 27.947, longitude: -82.457 };

function fixture(health, overrides = {}) {
  const calls = [];
  const responses = {
    '/api/health': health,
    '/api/ask': { status: 'answered', evidence: [{ source_id: 'fixture-housing' }] },
    '/api/sources': Array.from({ length: 12 }, (_, i) => ({ source_id: `fixture-${i}` })),
    '/api/evaluation': { benchmark_count: 77 },
    '/api/location': { candidates: [candidate] },
    '/api/property': { status: 'found', parcel: { records: [{ label: 'Fictional parcel' }] } },
    '/api/development': { status: 'found', totalMatches: 1 },
    ...overrides,
  };
  return { calls, fetcher: async (url, options) => {
    assert.equal(url.origin, base);
    calls.push({ path: url.pathname, options });
    assert.ok(Object.hasOwn(responses, url.pathname));
    const value = responses[url.pathname];
    return value instanceof Response ? value : Response.json(value);
  } };
}

test('live smoke completes local resident flows while retaining the degraded production-readiness report', async () => {
  const health = readinessResponse(fresh, await operationsStatus({}), 'fixture', 'fixture');
  assert.equal(health.status, 'degraded');
  const { calls, fetcher } = fixture(health);
  const result = await runSmoke({ base, fetcher });
  assert.deepEqual(result.health, health);
  assert.equal(result.property.status, 'found');
  assert.deepEqual(calls.map(call => call.path), ['/api/health', '/api/ask', '/api/sources', '/api/evaluation', '/api/location', '/api/property', '/api/development']);
  assert.deepEqual(JSON.parse(calls.find(call => call.path === '/api/property').options.body), candidate);
});

test('live smoke accepts an unprobed shared service without claiming authenticated readiness', async () => {
  const operations = await operationsStatus({ TAMPABAYBOT_OPERATIONS_MODE: 'shared',
    TAMPABAYBOT_LIMIT_SECRET: 'synthetic-limit-secret-at-least-32-characters' });
  const health = readinessResponse(fresh, operations, 'fixture', 'fixture');
  assert.equal(operations.reason, 'authenticated_probe_required');
  const { calls, fetcher } = fixture(health);
  const result = await runSmoke({ base, fetcher });
  assert.equal(result.health.ready, false);
  assert.match(result.scope, /not an authenticated production-readiness check/);
  for (const call of calls) assert.equal(new Headers(call.options.headers).has('Authorization'), false);
});

test('live smoke rejects empty or stale evidence before making resident requests', async () => {
  const operations = await operationsStatus({});
  for (const readiness of [corpusReadiness([], [], now), corpusReadiness(corpus.sources, corpus.chunks, new Date('2027-09-16T12:00:00Z'))]) {
    const { calls, fetcher } = fixture(readinessResponse(readiness, operations, 'fixture', 'fixture'));
    await assert.rejects(runSmoke({ base, fetcher }), /evidence corpus is not ready/);
    assert.deepEqual(calls.map(call => call.path), ['/api/health']);
  }
});

test('live smoke rejects real operations failures and unknown health responses', async () => {
  for (const operations of [
    { mode: 'shared', ready: false, reason: 'operations_unavailable' },
    { mode: 'shared', ready: false, reason: 'maintenance' },
    { mode: 'shared', ready: false, reason: 'shared_controls_not_configured' },
    undefined,
  ]) {
    const health = { corpus: fresh, operations };
    const { calls, fetcher } = fixture(health);
    await assert.rejects(runSmoke({ base, fetcher }), /operations failure/);
    assert.deepEqual(calls.map(call => call.path), ['/api/health']);
  }
  await assert.rejects(runSmoke({ base, fetcher: fixture({ status: 'ready' }).fetcher }), /evidence corpus is not ready/);
});

test('live smoke still fails on unavailable resident APIs and missing cited evidence', async () => {
  const health = readinessResponse(fresh, await operationsStatus({}), 'fixture', 'fixture');
  await assert.rejects(runSmoke({ base, fetcher: fixture(health, {
    '/api/ask': new Response(null, { status: 503 }),
  }).fetcher }), /\/api\/ask: HTTP 503/);
  await assert.rejects(runSmoke({ base, fetcher: fixture(health, {
    '/api/ask': { status: 'insufficient_evidence', evidence: [] },
  }).fetcher }), /Incomplete evidence or evaluation response/);
});
