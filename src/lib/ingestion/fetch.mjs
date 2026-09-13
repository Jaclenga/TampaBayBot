import { performance } from 'node:perf_hooks';

export class DownloadError extends Error {
  constructor(code, status) { super(code); this.name = 'DownloadError'; this.code = code; this.status = status; }
}
const retryable = new Set([408, 425, 429, 500, 502, 503, 504]);
const abortError = () => new DownloadError('download_timeout');

function aborted(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const stop = () => reject(abortError());
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
function cancel(body) { try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Cancellation must not prolong a rejected download. */ } }
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function retryDelay(value, attempt, { now = Date.now(), baseDelayMs = 500, maxDelayMs = 10000 } = {}) {
  let requested = 0;
  if (value !== null && value !== undefined) {
    if (/^\d+$/.test(value.trim())) requested = Number(value) * 1000;
    else { const date = Date.parse(value); if (Number.isFinite(date)) requested = Math.max(0, date - now); }
  }
  // Do not retry earlier than a publisher's requested delay just to fit our budget.
  if (requested > maxDelayMs) throw new DownloadError('retry_after_exceeds_budget');
  return Math.max(requested, Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
}

/** Read incrementally; neither a missing nor a false Content-Length bypasses the cap. */
export async function readBoundedBody(response, { maxBytes, signal, deadline = Infinity, clock = () => performance.now() }) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    cancel(response.body); throw new DownloadError('source_size_limit');
  }
  if (!response.body) throw new DownloadError('empty_source_body');
  const reader = response.body.getReader(); const parts = []; let bytes = 0; let reads = 0;
  try {
    while (true) {
      if (signal.aborted || clock() >= deadline) throw abortError();
      const item = await aborted(reader.read(), signal);
      if (signal.aborted || clock() >= deadline) throw abortError();
      if (item.done) break;
      if (++reads > 65536) throw new DownloadError('source_chunk_limit');
      bytes += item.value.byteLength;
      if (bytes > maxBytes) throw new DownloadError('source_size_limit');
      parts.push(Buffer.from(item.value));
    }
    if (!bytes) throw new DownloadError('empty_source_body');
    return Buffer.concat(parts, bytes);
  } catch (error) {
    cancel(reader); throw error;
  } finally { try { reader.releaseLock(); } catch { /* An interrupted reader can still have a pending read. */ } }
}

export async function fetchSource(input, {
  fetchImpl = fetch, maxBytes = 30 * 1024 * 1024, attempts = 3,
  timeoutMs = 45000, totalTimeoutMs = 120000, maxRedirects = 5,
  baseDelayMs = 500, maxDelayMs = 10000, wait = sleep,
  clock = () => performance.now(), wallClock = Date.now, signal,
  accept = '*/*',
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 30 * 1024 * 1024 ||
      !Number.isInteger(attempts) || attempts < 1 || attempts > 5 ||
      !(timeoutMs > 0 && timeoutMs <= 45000) || !(totalTimeoutMs > 0 && totalTimeoutMs <= 180000) ||
      !Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5 ||
      !(maxDelayMs >= 0 && maxDelayMs <= 30000) || !(baseDelayMs >= 0 && baseDelayMs <= maxDelayMs)) throw new Error('Invalid bounded download configuration');
  const original = new URL(input);
  if (original.protocol !== 'https:' || original.username || original.password) throw new DownloadError('source_requires_https');
  const overallDeadline = clock() + totalTimeoutMs;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = overallDeadline - clock();
    if (remaining <= 0 || signal?.aborted) throw abortError();
    const controller = new AbortController();
    const attemptDeadline = Math.min(overallDeadline, clock() + timeoutMs);
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    let retryAfter;
    try {
      let url = original; let response;
      for (let redirect = 0; ; redirect++) {
        response = await aborted(fetchImpl(url, { signal: combined, redirect: 'manual', headers: {
          'User-Agent': 'TampaBayBot/0.1 (public-source research; github.com/Jaclenga/TampaBayBot)', Accept: accept,
        } }), combined);
        if (combined.aborted || clock() >= attemptDeadline) { cancel(response.body); throw abortError(); }
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        cancel(response.body);
        if (redirect >= maxRedirects || !response.headers.get('location')) throw new DownloadError('source_redirect_limit');
        url = new URL(response.headers.get('location'), url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new DownloadError('source_requires_https');
      }
      if (!response.ok) {
        retryAfter = response.headers.get('retry-after'); cancel(response.body);
        throw new DownloadError(retryable.has(response.status) ? 'retryable_http_status' : 'source_http_status', response.status);
      }
      const bytes = await readBoundedBody(response, { maxBytes, signal: combined, deadline: attemptDeadline, clock });
      return { bytes, attempts: attempt + 1, http: { response_url: url.href,
        content_type: response.headers.get('content-type'), etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified') } };
    } catch (error) {
      lastError = error instanceof DownloadError ? error : new DownloadError('source_network_error');
      if (signal?.aborted || !['retryable_http_status', 'source_network_error', 'download_timeout'].includes(lastError.code) || attempt + 1 >= attempts) throw lastError;
    } finally { clearTimeout(timer); }
    const delay = retryDelay(retryAfter, attempt, { now: wallClock(), baseDelayMs, maxDelayMs });
    if (clock() + delay >= overallDeadline) throw new DownloadError('retry_budget_exhausted');
    await wait(delay);
  }
  throw lastError;
}
