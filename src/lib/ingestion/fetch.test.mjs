import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSource, readBoundedBody, retryDelay } from './fetch.mjs';

test('downloads enforce actual streamed bytes without trusting absent or false lengths', async () => {
  for (const declared of [null, '1']) {
    let reads = 0; let cancelled = false;
    const response = new Response(new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } }), { headers: declared ? { 'content-length': declared } : {} });
    response.arrayBuffer = () => { throw new Error('Whole-body allocation is forbidden'); };
    let requests = 0;
    await assert.rejects(fetchSource('https://example.gov/source', { fetchImpl: async () => { requests++; return response; }, maxBytes: 6 }), { code: 'source_size_limit' });
    assert.equal(requests, 1); assert.equal(cancelled, true); assert.ok(reads <= 3);
  }
});

test('oversized declared responses are cancelled before reading their body', async () => {
  let cancelled = false;
  await assert.rejects(fetchSource('https://example.gov/source', { maxBytes: 3, fetchImpl: async () => ({ ok: true, status: 200,
    headers: new Headers({ 'content-length': '4' }), body: { cancel() { cancelled = true; }, getReader() { throw new Error('Body was read'); } } }) }), { code: 'source_size_limit' });
  assert.equal(cancelled, true);
});

test('transient HTTP retries honor Retry-After and remain bounded', async () => {
  const delays = []; let requests = 0;
  const result = await fetchSource('https://example.gov/source', { wait: async value => delays.push(value), fetchImpl: async () => ++requests === 1
    ? new Response('retry later', { status: 429, headers: { 'retry-after': '2' } }) : new Response('reviewed source content') });
  assert.equal(result.bytes.toString(), 'reviewed source content'); assert.equal(result.attempts, 2); assert.deepEqual(delays, [2000]);
  assert.equal(retryDelay('Wed, 21 Oct 2015 07:28:02 GMT', 0, { now: Date.parse('2015-10-21T07:28:00Z') }), 2000);
  assert.throws(() => retryDelay('9000', 0), { code: 'retry_after_exceeds_budget' });
});

test('a publisher delay outside our budget never becomes an early retry', async () => {
  let requests = 0;
  await assert.rejects(fetchSource('https://example.gov/source', { fetchImpl: async () => { requests++; return new Response('', { status: 503, headers: { 'retry-after': '9000' } }); } }), { code: 'retry_after_exceeds_budget' });
  assert.equal(requests, 1);
});

test('terminal HTTP errors are not retried and HTTPS redirects cannot downgrade', async () => {
  let requests = 0;
  await assert.rejects(fetchSource('https://example.gov/source', { fetchImpl: async () => { requests++; return new Response('not found', { status: 404 }); } }), { code: 'source_http_status' });
  assert.equal(requests, 1);
  await assert.rejects(fetchSource('https://example.gov/source', { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://example.gov/unsafe' } }) }), { code: 'source_requires_https' });
});

test('uncooperative fetches and stalled streams cannot exceed their attempt deadline', async () => {
  let requests = 0;
  await assert.rejects(fetchSource('https://example.gov/source', { attempts: 2, timeoutMs: 15, totalTimeoutMs: 100, baseDelayMs: 0, maxDelayMs: 0,
    fetchImpl: () => { requests++; return new Promise(() => {}); } }), { code: 'download_timeout' });
  assert.equal(requests, 2);
  await assert.rejects(fetchSource('https://example.gov/source', { attempts: 1, timeoutMs: 15, totalTimeoutMs: 100,
    fetchImpl: async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } })) }), { code: 'download_timeout' });
});

test('repeated transient failures stop at the configured attempt count', async () => {
  let requests = 0; const delays = [];
  await assert.rejects(fetchSource('https://example.gov/source', { attempts: 3, wait: async ms => delays.push(ms), fetchImpl: async () => { requests++; throw new TypeError('private transport detail'); } }), { code: 'source_network_error' });
  assert.equal(requests, 3); assert.deepEqual(delays, [500, 1000]);
});

test('late completion cannot win a race against a delayed timer or reset the attempt deadline', async () => {
  let elapsed = 0; let reads = 0;
  await assert.rejects(readBoundedBody({ headers: new Headers(), body: { getReader: () => ({
    read: async () => ++reads === 1 ? { value: new Uint8Array([1]), done: false } : (elapsed = 20, { done: true }),
    cancel() {}, releaseLock() {},
  }) } }, { maxBytes: 10, signal: new AbortController().signal, deadline: 10, clock: () => elapsed }), { code: 'download_timeout' });
  elapsed = 0;
  await assert.rejects(fetchSource('https://example.gov/source', { attempts: 1, timeoutMs: 10, totalTimeoutMs: 100, clock: () => elapsed,
    fetchImpl: async () => { elapsed = 20; return new Response('late headers'); } }), { code: 'download_timeout' });
});
