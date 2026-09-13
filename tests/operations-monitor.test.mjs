import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOperations } from '../scripts/monitor-operations.mjs';

const config = { base: 'https://synthetic.invalid', siteToken: 'synthetic-site-token', monitorToken: 'synthetic-monitor-token' };
test('monitor authenticates exact HTTPS routes without forwarding credentials on redirects', async () => {
  const calls = [];
  const result = await checkOperations({ ...config, fetcher: async (url, options) => {
    calls.push({ url, options });
    return url.pathname === '/api/ready' ? Response.json({ ready: true, corpus: { fresh_chunks: 3, stale_chunks: 0, unavailable_sources: 0 } })
      : Response.json({ requests: 10, errors: 0, limited: 0, max_duration_ms: 500, window_minutes: 15 });
  } });
  assert.deepEqual(result.alerts, []); assert.equal(result.ready, true);
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/ready', '/api/operations']);
  for (const { url, options } of calls) {
    assert.equal(url.origin, 'https://synthetic.invalid'); assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-monitor-token');
  }
  const blocked = await checkOperations({ ...config, fetcher: async () => new Response(null, { status: 302, headers: { Location: 'https://different.invalid' } }) });
  assert.deepEqual(blocked.alerts, ['monitor_request_failed']);
});

test('monitor alerts on stale evidence, error rates, slow responses and sustained limits without resident data', async () => {
  const result = await checkOperations({ ...config, fetcher: async url => url.pathname === '/api/ready'
    ? Response.json({ ready: false, corpus: { fresh_chunks: 1, stale_chunks: 2, unavailable_sources: 1 }, private: 'resident private detail' }, { status: 503 })
    : Response.json({ requests: 20, errors: 3, limited: 10, max_duration_ms: 28000, window_minutes: 15 }) });
  assert.deepEqual(result.alerts, ['readiness_degraded', 'elevated_error_rate', 'sustained_request_limits', 'slow_request']);
  assert.doesNotMatch(JSON.stringify(result), /resident private|synthetic-monitor|synthetic-site|synthetic\.invalid/);
});
