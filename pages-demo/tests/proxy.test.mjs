import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/[[path]].js';

const url = 'https://demo.pages.dev';
const backend = (fetch) => ({ BACKEND: { fetch } });

test('Pages forwards only approved routes and methods to the bound Worker', async () => {
  const seen = [];
  const env = backend(async request => {
    seen.push(request);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  });
  for (const path of ['/api/ask', '/api/location', '/api/property', '/api/development']) {
    const request = new Request(`${url}${path}`, {
      method: 'POST',
      headers: { Origin: url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Where can I find housing help?' }),
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200, path);
  }
  for (const path of ['/api/health', '/api/ready', '/api/operations', '/api/usage']) {
    const response = await onRequest({ request: new Request(`${url}${path}`), env });
    assert.equal(response.status, 200, path);
  }
  assert.equal(seen.length, 8);
  assert.equal((await onRequest({ request: new Request(`${url}/api/hidden`), env })).status, 404);
  assert.equal((await onRequest({ request: new Request(`${url}/api/ask`), env })).status, 405);
  assert.equal(seen.length, 8);
});

test('Pages blocks a foreign Origin without invoking the backend', async () => {
  let calls = 0;
  const request = new Request(`${url}/api/ask`, {
    method: 'POST', headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const response = await onRequest({ request, env: backend(() => { calls++; return new Response(); }) });
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('Pages passes request body and monitor authorization while preserving backend status', async () => {
  const request = new Request(`${url}/api/operations`, { headers: { Authorization: 'Bearer test-monitor-token' } });
  const response = await onRequest({ request, env: backend(async forwarded => {
    assert.equal(forwarded, request);
    assert.equal(forwarded.headers.get('Authorization'), 'Bearer test-monitor-token');
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }) });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('Pages gives safe errors when binding is absent or fails', async () => {
  const request = new Request(`${url}/api/health`);
  assert.equal((await onRequest({ request, env: {} })).status, 503);
  const response = await onRequest({ request, env: backend(() => { throw new Error('private backend detail'); }) });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private backend detail/);
});
