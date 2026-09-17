import { parentPort, workerData } from 'node:worker_threads';
import { normalize, chunkUnits } from './normalize.mjs';

try {
  const { bytes, source, retrievedAt, rawHash } = workerData;
  const normalized = await normalize(Buffer.from(bytes), source);
  const chunks = chunkUnits(normalized, source, retrievedAt, rawHash);
  parentPort.postMessage({ ok: true, result: { normalized, chunks } });
} catch (error) {
  // Third-party parser diagnostics may contain source text or local paths.
  parentPort.postMessage({ ok: false, code: error?.code === 'normalization_limit_exceeded'
    ? error.code : 'source_processing_failed' });
}
