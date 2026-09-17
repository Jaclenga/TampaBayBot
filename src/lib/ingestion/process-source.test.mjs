import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { EventEmitter, getEventListeners } from 'node:events';
import { performance } from 'node:perf_hooks';
import { processSource } from './process-source.mjs';
import { normalize, chunkUnits, sha256 } from './normalize.mjs';
import { DEFAULT_NORMALIZATION_LIMITS } from './normalization-limits.mjs';

const source = { source_id: 'synthetic', source_type: 'html', title: 'Synthetic source', canonical_url: 'https://example.gov/source' };
const bytes = Buffer.from('<main><h2 id="apply">Application instructions</h2><p>Applications are closed until further notice.</p></main>');
const date = '2026-09-16T12:00:00Z';

test('isolated processing preserves literal units, hashes, annotations and chunk locators', async () => {
  const normalized = await normalize(bytes, source);
  const expected = { normalized, chunks: chunkUnits(normalized, source, date, sha256(bytes)) };
  assert.deepEqual(await processSource(bytes, source, date, sha256(bytes)), expected);
});

test('processing failures expose only a stable code, without parser diagnostics', async () => {
  await assert.rejects(processSource(bytes, { ...source, source_type: 'synthetic-private-path' }, date, sha256(bytes)), error => {
    assert.equal(error.code, 'source_processing_failed');
    assert.equal(error.message, 'source_processing_failed');
    return true;
  });
});

test('processing deadline terminates a busy worker before returning failure', async () => {
  let worker;
  // A bounded, synthetic CPU task stands in for a parser that cannot yield to
  // the parent's deadline. Termination must finish before the caller continues.
  const busy = new URL('data:text/javascript,const end=Date.now()+1000;while(Date.now()<end){}');
  await assert.rejects(processSource(bytes, source, date, sha256(bytes), {
    timeoutMs: 25,
    workerFactory: (_url, options) => { worker = new Worker(busy, options); return worker; },
  }), { code: 'source_processing_timeout' });
  assert.equal(worker.threadId, -1, 'The worker must have stopped, not just lost a promise race.');
});

test('aborted processing terminates its worker and cannot return a partial result', async () => {
  const controller = new AbortController();
  let worker;
  await assert.rejects(processSource(bytes, source, date, sha256(bytes), {
    signal: controller.signal,
    workerFactory: (url, options) => {
      worker = new Worker(url, options);
      queueMicrotask(() => controller.abort());
      return worker;
    },
  }), { code: 'source_processing_aborted' });
  assert.equal(worker.threadId, -1);
});

test('oversized and already-aborted inputs are refused before starting a worker', async () => {
  const workerFactory = () => { throw new Error('A worker must not start.'); };
  await assert.rejects(processSource(new Uint8Array(DEFAULT_NORMALIZATION_LIMITS.maxInputBytes + 1), source, date, '', { workerFactory }),
    { code: 'normalization_limit_exceeded' });
  await assert.rejects(processSource(bytes, source, date, '', { signal: AbortSignal.abort(), workerFactory }),
    { code: 'source_processing_aborted' });
  await assert.rejects(processSource(bytes, source, date, '', { timeoutMs: 15001, workerFactory }), /Invalid source processing deadline/);
});

test('successful processing waits for termination and removes its abort listener', async () => {
  const controller = new AbortController();
  const worker = new EventEmitter();
  const termination = Promise.withResolvers();
  const terminating = Promise.withResolvers();
  worker.terminate = () => { terminating.resolve(); return termination.promise; };
  let returned = false;
  const result = { normalized: {}, chunks: [] };
  const processing = processSource(bytes, source, date, '', {
    signal: controller.signal,
    workerFactory: () => {
      queueMicrotask(() => worker.emit('message', { ok: true, result }));
      return worker;
    },
  }).then(value => { returned = true; return value; });
  await terminating.promise;
  assert.equal(returned, false);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  // Cleanup events and cancellation cannot replace an already selected result.
  worker.emit('exit', 1);
  controller.abort();
  termination.resolve();
  assert.equal(await processing, result);
});

test('termination failures remain sanitized after a successful worker response', async () => {
  for (const asynchronous of [false, true]) {
    const worker = new EventEmitter();
    worker.terminate = () => {
      const error = new Error('synthetic-private-path');
      if (asynchronous) return Promise.reject(error);
      throw error;
    };
    await assert.rejects(processSource(bytes, source, date, '', {
      workerFactory: () => {
        queueMicrotask(() => worker.emit('message', { ok: true, result: {} }));
        return worker;
      },
    }), { code: 'source_processing_failed', message: 'source_processing_failed' });
  }
});

test('the deadline includes worker construction even if a result beats the timer', async () => {
  const worker = new EventEmitter();
  let terminated = false;
  worker.terminate = async () => { terminated = true; };
  await assert.rejects(processSource(bytes, source, date, '', {
    timeoutMs: 1,
    workerFactory: () => {
      const end = performance.now() + 5;
      while (performance.now() < end) { /* Bounded constructor delay. */ }
      queueMicrotask(() => worker.emit('message', { ok: true, result: {} }));
      return worker;
    },
  }), { code: 'source_processing_timeout' });
  assert.equal(terminated, true);
});
