import test from 'node:test';
import assert from 'node:assert/strict';
import { withResponseSecurity } from '../src/lib/response-security.ts';
import { withOperations } from '../src/lib/operations/control.mjs';
import { readInput } from '../src/lib/http.ts';

const site = 'https://tampabaybot.example';
test('server-issued CSP replaces hostile request policy, varies per response and preserves the body', async () => {
  const nonces = new Set();
  for (let i = 0; i < 2; i++) {
    const original = new Request(`${site}/api/ask`, {
      method: 'POST', body: '{"question":"Housing help"}',
      headers: { 'Content-Type': 'application/json', 'Content-Security-Policy': "script-src 'nonce-attacker'", 'Content-Security-Policy-Report-Only': 'default-src *', 'x-nonce': 'attacker' },
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

function unreadBody(cancelBehavior = () => {}) {
  const calls = { reads: 0, cancellations: 0 };
  const body = new ReadableStream({
    pull() { calls.reads++; return new Promise(() => {}); },
    cancel() { calls.cancellations++; return cancelBehavior(); },
  }, { highWaterMark: 0 });
  return { body, calls };
}

function assertRefusal(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Security-Policy'), /object-src 'none'/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Location'), null);
}

test('page uploads never enter framework parsing, including stalled cancellation during shared maintenance', { timeout: 2000 }, async () => {
  for (const path of ['/', '/sources', '/missing-page']) {
    for (const cancel of [() => new Promise(() => {}), () => Promise.reject(new Error('synthetic cancellation failure'))]) {
      const { body, calls } = unreadBody(cancel);
      const tasks = [];
      let dispatched = false;
      const request = new Request(`${site}${path}`, { method: 'POST', body, duplex: 'half',
        headers: { 'Content-Type': 'multipart/form-data; boundary=synthetic' } });
      const response = await withResponseSecurity(request, secured => withOperations(secured,
        { TAMPABAYBOT_OPERATIONS_MODE: 'shared', TAMPABAYBOT_MAINTENANCE: '1' },
        { waitUntil: task => tasks.push(task) }, async bounded => {
          dispatched = true;
          await bounded.formData();
          return new Response('wrong');
        }));
      assertRefusal(response, 405);
      assert.equal(response.headers.get('Allow'), 'GET, HEAD');
      assert.equal(dispatched, false);
      assert.deepEqual(calls, { reads: 0, cancellations: 1 });
      assert.equal(tasks.length, 0);
    }
  }
});

test('unused action headers are rejected before dispatch for pages and every input API', async () => {
  for (const path of ['/', '/sources', '/api/ask', '/api/location', '/api/property', '/api/development']) {
    for (const name of ['nExT-aCtIoN', 'X-RSC-ACTION']) {
      for (const value of ['', 'synthetic-action']) {
        let dispatched = false;
        const { body, calls } = unreadBody();
        const response = await withResponseSecurity(new Request(`${site}${path}`, {
          method: 'POST', headers: { [name]: value, 'Content-Type': 'application/json' }, body, duplex: 'half',
        }), async () => { dispatched = true; return new Response('wrong'); });
        assertRefusal(response, 404);
        assert.equal(dispatched, false);
        assert.deepEqual(calls, { reads: 0, cancellations: 1 });
      }
    }
  }
});

test('form invocations and other unsupported bodies cannot bypass the input APIs JSON readers', async () => {
  for (const path of ['/api/ask', '/api/location', '/api/property', '/api/development']) {
    for (const contentType of ['multipart/form-data; boundary=synthetic', 'application/x-www-form-urlencoded', 'text/plain', null]) {
      const { body, calls } = unreadBody();
      let dispatched = false;
      const response = await withResponseSecurity(new Request(`${site}${path}`, { method: 'POST', body, duplex: 'half',
        headers: contentType ? { 'Content-Type': contentType } : {},
      }), async () => { dispatched = true; return new Response('wrong'); });
      assertRefusal(response, 400);
      assert.deepEqual(await response.json(), { error: 'Send a JSON request.' });
      assert.equal(dispatched, false);
      assert.deepEqual(calls, { reads: 0, cancellations: 1 });
    }
  }
});

test('POST admission uses exact input routes instead of encoded or framework aliases', async () => {
  for (const path of ['/api/health', '/api/sources', '/api/ready', '/api/evaluation', '/api/operations', '/api/unknown',
    '/api/ask/', '/api/ask.rsc', '/api/ask/extra', '/API/ask', '/%61pi/ask', '/api%2fask', '/%2561pi/ask',
    '/api%252fask', '/api%5cask', '/api%3fignored/ask', '//api/ask', '/api//ask', '/api/ask%2f..%2f..%2fsources']) {
    let dispatched = false;
    const { body, calls } = unreadBody();
    const response = await withResponseSecurity(new Request(`${site}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half',
    }), async () => { dispatched = true; return new Response('wrong'); });
    assertRefusal(response, 405);
    assert.equal(dispatched, false, path);
    assert.deepEqual(calls, { reads: 0, cancellations: 1 }, path);
  }
});

test('unsupported methods cannot send bodies to pages or input handlers', async () => {
  for (const path of ['/', '/sources', '/api/ask']) {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const { body, calls } = unreadBody();
      let dispatched = false;
      const response = await withResponseSecurity(new Request(`${site}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body, duplex: 'half',
      }), async () => { dispatched = true; return new Response('wrong'); });
      assertRefusal(response, 405);
      assert.equal(response.headers.get('Allow'), path === '/api/ask' ? 'POST' : 'GET, HEAD');
      assert.equal(dispatched, false);
      assert.deepEqual(calls, { reads: 0, cancellations: 1 });
    }
  }
});

test('normal JSON input APIs retain their operation admission and bounded body reader', async () => {
  for (const path of ['/api/ask', '/api/location', '/api/property', '/api/development']) {
    const input = { question: 'Synthetic housing question' };
    const tasks = [];
    let dispatched = false;
    const response = await withResponseSecurity(new Request(`${site}${path}?test=1`, {
      method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'Application/JSON; charset=utf-8' },
    }), secured => withOperations(secured, { TAMPABAYBOT_OPERATIONS_MODE: 'local' },
      { waitUntil: task => tasks.push(task) }, async bounded => {
        dispatched = true;
        assert.deepEqual(await readInput(bounded), input);
        return Response.json({ ok: true });
      }));
    await Promise.all(tasks);
    assert.equal(response.status, 200);
    assert.equal(dispatched, true);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true });
  }
});

test('GET, HEAD and RSC navigation continue to dispatch without allowing action headers', async () => {
  for (const path of ['/', '/sources', '/sources.rsc?_rsc=synthetic', '/api/health', '/api/ready', '/api/sources', '/%73ources']) {
    for (const method of ['GET', 'HEAD']) {
      let dispatched = false;
      const response = await withResponseSecurity(new Request(`${site}${path}`, { method,
        headers: { RSC: '1', 'Next-Router-State-Tree': '[]', 'Next-Router-Prefetch': '1' },
      }), async secured => {
        dispatched = true;
        assert.equal(secured.method, method);
        assert.equal(secured.headers.get('RSC'), '1');
        return new Response(null, { headers: { 'Content-Type': 'text/html' } });
      });
      assert.equal(response.status, 200);
      assert.equal(dispatched, true);
    }
  }
  for (const method of ['GET', 'HEAD']) {
    const response = await withResponseSecurity(new Request(`${site}/sources.rsc`, {
      method, headers: { RSC: '1', 'Next-Action': 'synthetic' },
    }), async () => assert.fail('Action header reached dispatch'));
    assertRefusal(response, 404);
  }
});
