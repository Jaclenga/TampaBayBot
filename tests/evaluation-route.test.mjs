import test from 'node:test';
import assert from 'node:assert/strict';
import suite from '../evaluation/suite/results/latest.json' with { type: 'json' };
import { GET } from '../src/app/api/evaluation/route.ts';
import { withRuntimeEnv } from '../src/lib/runtime-env.mjs';

const origin = 'https://tampabaybot.example';
const monitorToken = `test-only-${'x'.repeat(40)}`;
const env = { TAMPABAYBOT_MONITOR_TOKEN: monitorToken };
const request = (artifact, token) => new Request(`${origin}/api/evaluation${artifact ? `?artifact=${artifact}` : ''}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test('aggregate evaluation reports remain public without exposing detailed files', async () => {
  for (const artifact of [null, 'summary', 'suite']) {
    const response = await withRuntimeEnv(env, () => GET(request(artifact)));
    assert.equal(response.status, artifact === 'suite' && suite.mode !== 'offline' ? 404 : 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  }
});

test('detailed evaluation files require the existing monitor token', async () => {
  for (const artifact of ['responses', 'agent', 'human']) {
    for (const token of [undefined, 'wrong-token']) {
      const response = await withRuntimeEnv(env, () => GET(request(artifact, token)));
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('Content-Disposition'), null);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    const response = await withRuntimeEnv(env, () => GET(request(artifact, monitorToken)));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="tampabaybot-${artifact}.json"`);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('missing monitor configuration fails closed and unknown artifacts stay unavailable', async () => {
  const denied = await withRuntimeEnv({}, () => GET(request('human', monitorToken)));
  assert.equal(denied.status, 404);
  const unknown = await withRuntimeEnv(env, () => GET(request('secret', monitorToken)));
  assert.equal(unknown.status, 404);
});
