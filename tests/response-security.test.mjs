import test from 'node:test';
import assert from 'node:assert/strict';
import { withResponseSecurity } from '../src/lib/response-security.ts';

const site = 'https://parcelprivateer.example';
test('server-issued CSP replaces hostile request policy, varies per response and preserves the body', async () => {
  const nonces = new Set();
  for (let i = 0; i < 2; i++) {
    const original = new Request(`${site}/api/ask`, {
      method: 'POST', body: '{"question":"Housing help"}',
      headers: { 'Content-Security-Policy': "script-src 'nonce-attacker'", 'Content-Security-Policy-Report-Only': 'default-src *', 'x-nonce': 'attacker' },
    });
    const response = await withResponseSecurity(original, async request => {
      const policy = request.headers.get('Content-Security-Policy');
      const nonce = policy.match(/'nonce-([^']+)'/)[1];
      assert.equal(Buffer.from(nonce, 'base64').length, 24);
      nonces.add(nonce);
      assert.ok(!policy.includes('attacker'));
      assert.equal(request.headers.get('x-nonce'), null);
      assert.equal(request.headers.get('Content-Security-Policy-Report-Only'), null);
      assert.equal(await request.text(), '{"question":"Housing help"}');
      return Response.json({ ok: true });
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('Content-Security-Policy'), /script-src-attr 'none'/);
    assert.ok(!response.headers.get('Content-Security-Policy').split(';').find(x => x.trim().startsWith('script-src ')).includes('unsafe-inline'));
    assert.deepEqual(await response.json(), { ok: true });
  }
  assert.equal(nonces.size, 2);
});

test('document and error responses enforce frame, transport, privacy and cache policies', async () => {
  for (const status of [200, 404, 500]) {
    const response = await withResponseSecurity(new Request(site), async () => new Response('page', {
      status, headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
    }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
    assert.equal(response.headers.get('X-Frame-Options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    const policy = response.headers.get('Content-Security-Policy');
    for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'", 'frame-src https://www.openstreetmap.org']) assert.ok(policy.includes(directive));
    assert.equal(await response.text(), 'page');
  }
  const local = await withResponseSecurity(new Request('http://localhost/'), async () => new Response('ok'), true);
  assert.equal(local.headers.get('Strict-Transport-Security'), null);
  const failed = await withResponseSecurity(new Request(`${site}/api/ask`), async () => { throw new Error('synthetic private credential'); });
  assert.equal(failed.status, 500);
  assert.equal(await failed.text(), 'Unable to complete the request.');
});

test('unused framework image endpoints are refused before dispatch, including decoded aliases', async () => {
  for (const path of ['/_vinext/image', '/_next/image', '/_vinext/image/', '/_vinext/image.rsc', '/%5fvinext%2fimage', '/_vinext%2fx%2f..%2fimage', '/_vinext%252fimage', '//_vinext//image']) {
    let dispatched = false;
    const response = await withResponseSecurity(new Request(`${site}${path}?url=https://untrusted.example/image`), async () => { dispatched = true; return new Response('bad'); });
    assert.equal(response.status, 404, path);
    assert.equal(dispatched, false, path);
    assert.equal(response.headers.get('Location'), null);
  }
  const normal = await withResponseSecurity(new Request(`${site}/sources`), async () => new Response('sources'));
  assert.equal(normal.status, 200);
});
