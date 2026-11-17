import { Worker } from 'node:worker_threads';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { DEFAULT_NORMALIZATION_LIMITS } from './normalization-limits.mjs';

export class SourceProcessingError extends Error {
  constructor(code) { super(code); this.name = 'SourceProcessingError'; this.code = code; }
}

export const SOURCE_PROCESSING_TIMEOUT_MS = 15000;
const workerUrl = new URL('./source-worker.mjs', import.meta.url);
export function createPdfProcessWorker(_url, options) {
  const child=fork(fileURLToPath(new URL('./source-process.mjs',import.meta.url)),[],{
    execArgv:['--max-old-space-size=192','--max-semi-space-size=8','--stack-size=4096'],
    env:process.platform==='win32'&&process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{},
    stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',windowsHide:true,
  });
  child.send(options.workerData,error=>{if(error)child.emit('error',error);});
  return {
    once:(event,listener)=>child.once(event,listener),
    async terminate(){
      if(child.exitCode!==null||child.signalCode!==null)return child.exitCode;
      return new Promise((resolve,reject)=>{
        child.once('exit',resolve);
        child.once('error',reject);
        if(!child.kill('SIGKILL'))reject(new Error('Source process termination failed.'));
      });
    },
  };
}
const createWorker = (url, options) => process.platform==='win32'&&options.workerData.source.source_type==='pdf'
  ? createPdfProcessWorker(url,options) : new Worker(url,options);

/** Node-only acquisition boundary. A stalled parser must not block its parent
 * event loop or keep running after its deadline. Output budgets are enforced
 * inside the worker before cloning results back to the parent. */
export async function processSource(bytes, source, retrievedAt, rawHash, {
  timeoutMs = SOURCE_PROCESSING_TIMEOUT_MS, signal, workerFactory = createWorker,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > SOURCE_PROCESSING_TIMEOUT_MS)
    throw new Error('Invalid source processing deadline');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > DEFAULT_NORMALIZATION_LIMITS.maxInputBytes)
    throw new SourceProcessingError('normalization_limit_exceeded');
  if (signal?.aborted) throw new SourceProcessingError('source_processing_aborted');
  const started = performance.now();
  let worker, timer, stop;
  try {
    try {
      worker = workerFactory(workerUrl, {
        workerData: { bytes, source, retrievedAt, rawHash },
        execArgv: [], env: {}, stdout: true, stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
      worker.stdout?.resume();
      worker.stderr?.resume();
      return await new Promise((resolve, reject) => {
        const fail = code => reject(new SourceProcessingError(code));
        stop = () => fail('source_processing_aborted');
        worker.once('message', message => {
          if (performance.now() - started >= timeoutMs) return fail('source_processing_timeout');
          if (message?.ok === true) resolve(message.result);
          else fail(message?.code === 'normalization_limit_exceeded' ? message.code : 'source_processing_failed');
        });
        worker.once('error', () => fail('source_processing_failed'));
        worker.once('exit', () => fail('source_processing_failed'));
        signal?.addEventListener('abort', stop, { once: true });
        timer = setTimeout(() => fail('source_processing_timeout'),
          Math.max(1, timeoutMs - (performance.now() - started)));
        if (signal?.aborted) stop();
      });
    } finally {
      clearTimeout(timer);
      if (stop) signal?.removeEventListener('abort', stop);
      // Finish termination before callers can start another source, including
      // after a successful result. Failed parsers must not accumulate.
      await worker?.terminate();
    }
  } catch (error) {
    throw error instanceof SourceProcessingError ? error : new SourceProcessingError('source_processing_failed');
  }
}
