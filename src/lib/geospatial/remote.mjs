/** Bounded Web-API-only readers shared by GIS and development adapters. */
export async function fetchBoundedText(url, { fetcher = fetch, timeoutMs = 12000, maxBytes = 1000000 } = {}) {
  const controller = new AbortController();
  // Timer callbacks can run late; reject overdue data at every read boundary too.
  const expiresAt = performance.now() + timeoutMs;
  const expired = () => controller.signal.aborted || performance.now() >= expiresAt;
  let reader;
  let timeout;
  const timedOut = () => new Error('Remote source exceeded the retrieval time limit.');
  const cancel = body => { void body?.cancel?.().catch(() => {}); };
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(timedOut());
      controller.abort();
      cancel(reader);
    }, timeoutMs);
  });
  const read = (async () => {
    // Workers implement manual/follow only. Reject 3xx through the status check;
    // never follow a source redirect to a different host or private network.
    const response = await fetcher(url, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/json, text/csv, text/plain' } });
    if (expired()) { cancel(response.body); throw timedOut(); }
    if (!response.ok) { cancel(response.body); throw new Error(`Remote source returned HTTP ${response.status}.`); }
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) { cancel(response.body); throw new Error('Remote source exceeds the response size limit.'); }
    if (!response.body) throw new Error('Remote source returned an empty body.');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0;
    let output = '';
    let complete = false;
    try {
      while (true) {
        if (expired()) throw timedOut();
        const { value, done } = await reader.read();
        if (expired()) throw timedOut();
        if (done) { complete = true; break; }
        size += value.byteLength;
        if (size > maxBytes) throw new Error('Remote source exceeds the response size limit.');
        output += decoder.decode(value, { stream: true });
      }
      output += decoder.decode();
      if (expired()) throw timedOut();
    } finally {
      if (!complete) cancel(reader);
      reader.releaseLock();
    }
    return { text: output, retrievedAt: new Date().toISOString() };
  })();
  try {
    return await Promise.race([read, deadline]);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export function createJsonReader({ fetcher = fetch, timeoutMs = 12000, maxBytes = 1000000, ttlMs = 300000, maxEntries = 64 } = {}) {
  const cache = new Map();
  return async function readJson(url) {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    cache.delete(url);
    const response = await fetchBoundedText(url, { fetcher, timeoutMs, maxBytes });
    const data = JSON.parse(response.text);
    if (!data || typeof data !== 'object' || data.error) throw new Error('GIS service returned an error or invalid response.');
    const result = { data, retrievedAt: response.retrievedAt };
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(url, { expiresAt: Date.now() + ttlMs, result });
    return result;
  };
}
