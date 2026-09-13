import { pathToFileURL } from 'node:url';

export async function checkOperations({ base, siteToken, monitorToken, fetcher = fetch }) {
  const root = new URL(base);
  if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash || root.pathname !== '/')
    throw new Error('Monitor URL must be an HTTPS site origin without credentials or query parameters.');
  if (!monitorToken) throw new Error('The private operations monitor credential is missing.');
  const result = { checked_at: new Date().toISOString(), reachable: false, ready: false, alerts: [] };
  async function read(path, token = false) {
    const response = await fetcher(new URL(path, root), { redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { ...(siteToken ? { 'OAI-Sites-Authorization': `Bearer ${siteToken}` } : {}),
        ...(token ? { Authorization: `Bearer ${monitorToken}` } : {}) } });
    if (![200, 503].includes(response.status)) { await response.body?.cancel(); throw new Error('Monitor access or HTTP response failed.'); }
    if (!response.body) throw new Error('Empty monitor response.');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let body = '', bytes = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length;
      if (bytes > 65536) throw new Error('Monitor response exceeded its limit.'); body += decoder.decode(value, { stream: true }); }
      return { status: response.status, data: JSON.parse(body + decoder.decode()) };
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  try {
    const health = await read('/api/ready', true);
    result.reachable = true;
    result.ready = health.status === 200 && health.data.ready === true;
    result.evidence = { fresh_chunks: health.data.corpus?.fresh_chunks, stale_chunks: health.data.corpus?.stale_chunks,
      unavailable_sources: health.data.corpus?.unavailable_sources };
    if (!result.ready) result.alerts.push('readiness_degraded');
    const metrics = await read('/api/operations', true);
    if (metrics.status !== 200 || !Number.isFinite(metrics.data.requests) || !Number.isFinite(metrics.data.errors))
      throw new Error('Operations metrics unavailable.');
    result.metrics = { requests: metrics.data.requests, errors: metrics.data.errors, limited: metrics.data.limited,
      max_duration_ms: metrics.data.max_duration_ms, window_minutes: metrics.data.window_minutes };
    if (metrics.data.errors >= 3 && metrics.data.errors / Math.max(1, metrics.data.requests) >= 0.1) result.alerts.push('elevated_error_rate');
    if (metrics.data.limited >= 10) result.alerts.push('sustained_request_limits');
    if (metrics.data.max_duration_ms >= 25000) result.alerts.push('slow_request');
  } catch { result.alerts.push('monitor_request_failed'); }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkOperations({ base: process.env.TAMPABAYBOT_MONITOR_URL,
      siteToken: process.env.TAMPABAYBOT_SITE_TOKEN, monitorToken: process.env.TAMPABAYBOT_MONITOR_TOKEN });
    console.log(JSON.stringify(result, null, 2));
    if (result.alerts.length) process.exitCode = 1;
  } catch { console.error('Operations monitor is not configured correctly.'); process.exitCode = 1; }
}
