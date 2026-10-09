import { AsyncLocalStorage } from 'node:async_hooks';
import { operationsSchema } from './schema.mjs';

const context = new AsyncLocalStorage();
const initialized = new WeakMap();
const minute = 60000;
const day = 86400000;
async function boundedSql(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new OperationsError()), 2000); })]); }
  finally { clearTimeout(timer); }
}
export const defaultLimits = Object.freeze({ clientPerMinute: 12, requestsPerMinute: 120, requestsPerDay: 5000,
  concurrency: 8, clientConcurrency: 2, outboundPerRequest: 40, outboundPerMinute: 400,
  outboundPerDay: 10000, modelPerDay: 100, clientAiPerDay: 15, modelConcurrency: 2,
  deadlineMs: 30000, leaseMs: 45000 });

export class OperationsError extends Error {
  constructor(code = 'operations_unavailable', status = 503, retryAfter = 30, aiUsage = null) {
    super(code); this.code = code; this.status = status; this.retryAfter = retryAfter;
    this.aiUsage = aiUsage;
  }
}

export function operationsConfig(env = {}) {
  const mode = env.TAMPABAYBOT_OPERATIONS_MODE ?? (env.DB ? 'shared' : 'local');
  if (!['shared', 'local'].includes(mode)) throw new OperationsError('operations_configuration');
  const limits = { ...defaultLimits };
  for (const [name, defaultValue] of Object.entries(limits)) {
    if (['deadlineMs', 'leaseMs'].includes(name)) continue;
    const key = `TAMPABAYBOT_LIMIT_${name.replace(/[A-Z]/g, char => `_${char}`).toUpperCase()}`;
    if (env[key] === undefined) continue;
    const value = Number(env[key]);
    if (!Number.isInteger(value) || value < 1 || value > defaultValue * 10) throw new OperationsError('operations_configuration');
    limits[name] = value;
  }
  return { mode, limits, maintenance: env.TAMPABAYBOT_MAINTENANCE === '1' };
}

// D1 batch is one transaction. Conditional lease creation and counter increments
// share that transaction, so separate Worker instances cannot oversubscribe it.
export async function database(env) {
  const db = env.DB;
  if (!db?.prepare || !db?.batch) throw new OperationsError();
  if (!initialized.has(db)) {
    const pending = boundedSql(db.batch(operationsSchema.map(sql => db.prepare(sql)))).catch(() => {
      initialized.delete(db); throw new OperationsError();
    });
    initialized.set(db, pending);
  }
  await initialized.get(db);
  return db;
}

function bucket(now, size) { return Math.floor(now / size) * size; }
function counter(db, key, expiry, lease, token) {
  return db.prepare(`INSERT INTO ops_counters (key,value,expires_at)
    SELECT ?,1,? WHERE EXISTS (SELECT 1 FROM ops_leases WHERE id=?${token ? ' AND token=?' : ''})
    ON CONFLICT(key) DO UPDATE SET value=value+1, expires_at=excluded.expires_at`)
    .bind(key, expiry, lease, ...(token ? [token] : []));
}
async function clientKey(request, secret, now, window = minute) {
  if (typeof secret !== 'string' || secret.length < 32) throw new OperationsError('operations_configuration');
  // Cloudflare replaces CF-Connecting-IP at the trusted ingress. Never consume
  // arbitrary X-Forwarded-For. Clients without that header share a small bucket.
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${window}:${bucket(now, window)}:${address}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function acquireRequest(request, env, { now = Date.now(), limits = operationsConfig(env).limits } = {}) {
  const db = await database(env);
  const client = await clientKey(request, env.TAMPABAYBOT_LIMIT_SECRET, now);
  const previousClient = await clientKey(request, env.TAMPABAYBOT_LIMIT_SECRET, now - minute);
  const aiClient = await clientKey(request, env.TAMPABAYBOT_LIMIT_SECRET, now, day);
  const id = crypto.randomUUID();
  const min = bucket(now, minute), date = bucket(now, day);
  const nextAiClient = now + limits.deadlineMs >= date + day
    ? await clientKey(request, env.TAMPABAYBOT_LIMIT_SECRET, date + day, day) : null;
  const keys = [`request:minute:${min}`, `request:day:${date}`, `client:${client}`];
  const counts = [limits.requestsPerMinute, limits.requestsPerDay, limits.clientPerMinute];
  const admission = db.prepare(`INSERT INTO ops_leases (id,client_key,expires_at)
    SELECT ?,?,? WHERE (SELECT COUNT(*) FROM ops_leases WHERE expires_at>?)<?
    AND (SELECT COUNT(*) FROM ops_leases WHERE client_key IN (?,?) AND expires_at>?)<?
    ${keys.map(() => 'AND COALESCE((SELECT value FROM ops_counters WHERE key=?),0)<?').join(' ')} RETURNING id`)
    .bind(id, client, now + limits.leaseMs, now, limits.concurrency, client, previousClient, now, limits.clientConcurrency,
      ...keys.flatMap((key, index) => [key, counts[index]]));
  const results = await boundedSql(db.batch([
    db.prepare('DELETE FROM ops_leases WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM ops_counters WHERE expires_at<=?').bind(now),
    admission,
    ...keys.map((key, index) => counter(db, key, index === 1 ? date + day : min + minute, id)),
    db.prepare(`SELECT key,value FROM ops_counters WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys),
  ]));
  if (!results[2].results?.length) {
    const counts = new Map(results[6].results?.map(row => [row.key, row.value]));
    const retryAfter = (counts.get(keys[1]) ?? 0) >= limits.requestsPerDay
      ? secondsUntil(date + day, now)
      : (counts.get(keys[0]) ?? 0) >= limits.requestsPerMinute
        || (counts.get(keys[2]) ?? 0) >= limits.clientPerMinute
        ? secondsUntil(min + minute, now) : 5;
    throw new OperationsError('request_limit', 429, retryAfter);
  }
  return { db, id, aiClient, aiClientDay: date, nextAiClient, limits, expires: now + limits.deadlineMs,
    outbound: 0, blocked: null, aiAttempted: false, aiOutcome: null };
}

const nextUtcDay = now => bucket(now, day) + day;
const secondsUntil = (time, now) => Math.max(1, Math.ceil((time - now) / 1000));
const aiClientFor = (state, now) => bucket(now, day) === state.aiClientDay
  ? state.aiClient : state.nextAiClient ?? state.aiClient;

function usage(used, globalUsed, limits, now, providerQuota = false) {
  const remaining = Math.max(0, limits.clientAiPerDay - used);
  const reason = remaining === 0 ? 'ai_visitor_limit'
    : globalUsed >= limits.modelPerDay ? 'ai_global_limit'
      : providerQuota ? 'provider_quota' : null;
  return { remaining, limit: limits.clientAiPerDay, used,
    resetAt: new Date(nextUtcDay(now)).toISOString(), available: reason === null, reason };
}

function loopbackHttpRequest(request) {
  try {
    const url = new URL(request.url);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

// This endpoint reads only aggregate counts and the day's HMAC address bucket.
// The hash rotates at midnight UTC; no raw IP, question or conversation is stored.
/** @param {{ configured?: boolean, provider?: string, locality?: 'loopback' | 'network' | null, now?: number }} [options] */
export async function aiUsage({ configured = true, provider = 'workers-ai', locality = null, now = Date.now() } = {}) {
  const state = context.getStore();
  const limits = state?.limits ?? defaultLimits;
  if (!state?.db || !state.aiClient) {
    const localModel = configured && state?.allowUnmeteredModel && locality === 'loopback'
      && ['ollama', 'openai-compatible'].includes(provider);
    return {
      remaining: null, limit: limits.clientAiPerDay, used: null,
      resetAt: null, available: Boolean(localModel),
      reason: localModel ? 'local_unmetered' : 'ai_configuration',
    };
  }
  const date = bucket(now, day);
  const keys = [`ai:visitor:${date}:${aiClientFor(state, now)}`, `model:day:${date}`];
  const values = await boundedSql(state.db.batch([
    ...keys.map(key => state.db.prepare('SELECT COALESCE(value,0) AS value FROM ops_counters WHERE key=?').bind(key)),
    state.db.prepare("SELECT 1 AS blocked FROM ops_ai_circuit WHERE key='workers-ai:quota' AND expires_at>?").bind(now),
  ]));
  const result = usage(values[0].results?.[0]?.value ?? 0, values[1].results?.[0]?.value ?? 0,
    limits, now, provider === 'workers-ai' && Boolean(values[2].results?.length));
  return configured ? result : { ...result, available: false, reason: 'ai_configuration' };
}

async function aiMetric(db, outcome, reason = null, now = Date.now()) {
  const values = {
    succeeded: outcome === 'succeeded' ? 1 : 0,
    failed: outcome === 'failed' ? 1 : 0,
    rejected: outcome === 'rejected' ? 1 : 0,
    provider_quota: ['provider_quota', 'ai_provider_quota'].includes(reason) ? 1 : 0,
    timeouts: reason === 'timeout' ? 1 : 0,
  };
  await boundedSql(db.prepare(`INSERT INTO ops_ai_metrics (bucket,succeeded,failed,rejected,provider_quota,timeouts)
    VALUES (?,?,?,?,?,?) ON CONFLICT(bucket) DO UPDATE SET
    succeeded=succeeded+excluded.succeeded,failed=failed+excluded.failed,
    rejected=rejected+excluded.rejected,provider_quota=provider_quota+excluded.provider_quota,
    timeouts=timeouts+excluded.timeouts`).bind(bucket(now, 5 * minute), ...Object.values(values)).run());
}

export function markAiOutcome(outcome, reason = null) {
  const state = context.getStore();
  if (state?.aiAttempted) state.aiOutcome = { outcome: outcome === 'succeeded' ? 'succeeded' : 'failed', reason };
}

export async function markAiProviderQuota(now = Date.now()) {
  const state = context.getStore();
  if (!state?.db) return;
  try {
    await boundedSql(state.db.prepare(`INSERT INTO ops_ai_circuit (key,expires_at) VALUES ('workers-ai:quota',?)
      ON CONFLICT(key) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at)`)
      .bind(nextUtcDay(now)).run());
  } catch { console.error('ai_circuit_write_failed'); }
}

async function reserveModel(state, now, provider) {
  const min = bucket(now, minute), date = bucket(now, day);
  const keys = [`outbound:minute:${min}`, `outbound:day:${date}`,
    `model:day:${date}`, `ai:visitor:${date}:${aiClientFor(state, now)}`];
  const caps = [state.limits.outboundPerMinute, state.limits.outboundPerDay,
    state.limits.modelPerDay, state.limits.clientAiPerDay];
  const id = crypto.randomUUID();
  const admission = state.db.prepare(`INSERT INTO ops_ai_leases (id,expires_at)
    SELECT ?,? WHERE EXISTS (SELECT 1 FROM ops_leases WHERE id=? AND expires_at>?)
    AND (SELECT COUNT(*) FROM ops_ai_leases WHERE expires_at>?)<?
    AND (?!='workers-ai' OR NOT EXISTS (SELECT 1 FROM ops_ai_circuit WHERE key='workers-ai:quota' AND expires_at>?))
    ${keys.map(() => 'AND COALESCE((SELECT value FROM ops_counters WHERE key=?),0)<?').join(' ')} RETURNING id`)
    .bind(id, now + state.limits.leaseMs, state.id, now, now, state.limits.modelConcurrency,
      provider, now, ...keys.flatMap((key, index) => [key, caps[index]]));
  const counterForAiLease = (key, expiry) => state.db.prepare(`INSERT INTO ops_counters (key,value,expires_at)
    SELECT ?,1,? WHERE EXISTS (SELECT 1 FROM ops_ai_leases WHERE id=?)
    ON CONFLICT(key) DO UPDATE SET value=value+1,expires_at=excluded.expires_at`)
    .bind(key, expiry, id);
  const result = await boundedSql(state.db.batch([
    state.db.prepare('DELETE FROM ops_ai_leases WHERE expires_at<=?').bind(now),
    state.db.prepare('DELETE FROM ops_ai_circuit WHERE expires_at<=?').bind(now),
    admission,
    ...keys.map((key, index) => counterForAiLease(key, index === 0 ? min + minute : date + day)),
    state.db.prepare(`SELECT key,value FROM ops_counters WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys),
    state.db.prepare('SELECT COUNT(*) AS active FROM ops_ai_leases WHERE expires_at>?').bind(now),
    state.db.prepare("SELECT 1 AS blocked FROM ops_ai_circuit WHERE key='workers-ai:quota' AND expires_at>?").bind(now),
  ]));
  const counts = new Map(result[7].results?.map(row => [row.key, row.value]));
  const currentUsage = usage(counts.get(keys[3]) ?? 0, counts.get(keys[2]) ?? 0,
    state.limits, now, Boolean(result[9].results?.length));
  if (!result[2].results?.length) {
    let code = currentUsage.reason;
    if (code === 'provider_quota' && provider === 'workers-ai') {
      try { await aiMetric(state.db, 'rejected', 'ai_provider_quota', now); }
      catch { console.error('ai_metrics_failed'); }
      throw new OperationsError('ai_provider_quota', 503, 30, currentUsage);
    }
    if (!code) code = (result[8].results?.[0]?.active ?? 0) >= state.limits.modelConcurrency
      ? 'ai_concurrency_limit' : 'outbound_budget';
    const rejectedUsage = code === 'ai_concurrency_limit'
      ? { ...currentUsage, available: false, reason: code } : currentUsage;
    const retryAfter = code === 'ai_concurrency_limit' ? 5
      : ['ai_visitor_limit', 'ai_global_limit'].includes(code)
        || (counts.get(keys[1]) ?? 0) >= state.limits.outboundPerDay
        ? secondsUntil(date + day, now)
        : (counts.get(keys[0]) ?? 0) >= state.limits.outboundPerMinute
          ? secondsUntil(min + minute, now) : 5;
    try { await aiMetric(state.db, 'rejected', code, now); }
    catch { console.error('ai_metrics_failed'); }
    throw new OperationsError(code, code === 'outbound_budget' ? 503 : 429,
      retryAfter, rejectedUsage);
  }
  state.aiAttempted = true;
  state.aiOutcome = { outcome: 'failed', reason: null };
  return async () => {
    try { await boundedSql(state.db.prepare('DELETE FROM ops_ai_leases WHERE id=?').bind(id).run()); }
    catch { console.error('ai_lease_release_failed'); }
  };
}

export async function reserveOutbound(kind = 'gis', { provider = null, locality = null } = {}) {
  const state = context.getStore();
  if (!state) return; // Offline acquisition and unit fixtures have their own bounds.
  if (state.signal?.aborted || Date.now() >= state.expires) {
    state.blocked = new OperationsError('request_deadline', 504); throw state.blocked;
  }
  if (++state.outbound > state.limits.outboundPerRequest) {
    state.blocked = new OperationsError('outbound_budget', 503); throw state.blocked;
  }
  if (!state.db) {
    // API inference needs atomic shared limits for every provider. Calls made
    // outside an API operations context remain available to offline fixtures.
    // A local developer can explicitly opt into unmetered loopback inference.
    if (kind === 'model' && !(state.allowUnmeteredModel && locality === 'loopback'
      && ['ollama', 'openai-compatible'].includes(provider)))
      throw new OperationsError('ai_configuration');
    return;
  }
  if (kind === 'model') {
    try { return await reserveModel(state, Date.now(), provider); }
    catch (error) {
      if (error instanceof OperationsError && error.code === 'ai_provider_quota') throw error;
      state.blocked = error instanceof OperationsError ? error : new OperationsError();
      throw state.blocked;
    }
  }
  const now = Date.now(), min = bucket(now, minute), date = bucket(now, day);
  const keys = [`outbound:minute:${min}`, `outbound:day:${date}`];
  const caps = [state.limits.outboundPerMinute, state.limits.outboundPerDay];
  const token = crypto.randomUUID();
  const update = state.db.prepare(`UPDATE ops_leases SET outbound=outbound+1,token=?
    WHERE id=? AND expires_at>? AND outbound<?
    ${keys.map(() => 'AND COALESCE((SELECT value FROM ops_counters WHERE key=?),0)<?').join(' ')} RETURNING id`)
    .bind(token, state.id, now, state.limits.outboundPerRequest, ...keys.flatMap((key, index) => [key, caps[index]]));
  try {
    const result = await boundedSql(state.db.batch([update, ...keys.map((key, index) => counter(state.db, key,
      index === 0 ? min + minute : date + day, state.id, token))]));
    if (!result[0].results?.length) throw new OperationsError('outbound_budget', 503);
    if (state.signal?.aborted || Date.now() >= state.expires) throw new OperationsError('request_deadline', 504);
  } catch (error) {
    state.blocked = error instanceof OperationsError ? error : new OperationsError();
    throw state.blocked;
  }
}

export function operationalSignal(signal) {
  const requestSignal = context.getStore()?.signal;
  return requestSignal ? AbortSignal.any([signal, requestSignal]) : signal;
}

async function record(db, status, elapsed, now = Date.now()) {
  await boundedSql(db.batch([
    db.prepare('DELETE FROM ops_metrics WHERE bucket<?').bind(now - 7 * day),
    db.prepare('DELETE FROM ops_ai_metrics WHERE bucket<?').bind(now - 7 * day),
    db.prepare(`INSERT INTO ops_metrics (bucket,requests,errors,limited,duration_ms,max_duration_ms) VALUES (?,1,?,?,?,?)
      ON CONFLICT(bucket) DO UPDATE SET requests=requests+1, errors=errors+excluded.errors,
      limited=limited+excluded.limited,duration_ms=duration_ms+excluded.duration_ms,
      max_duration_ms=MAX(max_duration_ms,excluded.max_duration_ms)`)
      .bind(bucket(now, 5 * minute), status >= 500 ? 1 : 0, status === 429 ? 1 : 0, elapsed, elapsed),
  ]));
}
function failure(error) {
  const value = error instanceof OperationsError ? error : new OperationsError();
  const message = value.code === 'ai_visitor_limit'
    ? "You've reached today's AI chat limit. Housing assistance resources are still available."
    : value.code === 'ai_global_limit'
      ? "Today's AI chat budget has been reached. Housing assistance resources are still available."
      : value.code === 'ai_concurrency_limit'
        ? 'AI chat is busy. Please try again shortly. Housing assistance resources are still available.'
        : 'The service is temporarily busy. Please try again shortly.';
  return Response.json({ error: message, code: value.code,
    ...(value.aiUsage ? { aiUsage: value.aiUsage } : {}) },
    { status: value.status, headers: { 'Retry-After': String(value.retryAfter), 'Cache-Control': 'no-store' } });
}

export async function withOperations(request, env, ctx, dispatch) {
  let path = new URL(request.url).pathname;
  for (let pass = 0; pass < 3; pass++) {
    try { path = decodeURIComponent(path); } catch { return failure(new OperationsError('invalid_path', 400)); }
  }
  path = new URL(path.replaceAll('\\', '/').replace(/\/{2,}/g, '/'), 'https://route.invalid').pathname;
  if (!path.startsWith('/api/') || ['/api/health', '/api/ready'].includes(path)) return dispatch(request);
  let settings, state, response, timer;
  const started = Date.now();
  try {
    settings = operationsConfig(env);
    if (settings.maintenance) throw new OperationsError('maintenance');
    state = settings.mode === 'shared' ? await acquireRequest(request, env, { limits: settings.limits })
      : { limits: settings.limits, expires: started + settings.limits.deadlineMs,
        outbound: 0, aiAttempted: false, aiOutcome: null,
        allowUnmeteredModel: env.TAMPABAYBOT_ALLOW_UNMETERED_LOCAL_AI === '1' && loopbackHttpRequest(request) };
    const controller = new AbortController();
    state.expires = started + settings.limits.deadlineMs;
    state.signal = AbortSignal.any([request.signal, controller.signal]);
    const work = context.run(state, async () => dispatch(new Request(request, { signal: state.signal })));
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new OperationsError('request_deadline', 504)); }, Math.max(1, state.expires - Date.now())); });
    // Release only when dispatch really finishes. A timed-out handler retains
    // its bounded lease until it settles or expires; later fetches are denied.
    const cleanup = work.then(() => undefined, () => undefined).then(async () => {
      if (state.db) {
        await boundedSql(state.db.prepare('DELETE FROM ops_leases WHERE id=?').bind(state.id).run());
        if (state.aiAttempted) await aiMetric(state.db,
          state.aiOutcome?.outcome ?? 'failed', state.aiOutcome?.reason);
      }
    }).catch(() => { console.error('operations_release_failed'); });
    ctx.waitUntil(cleanup);
    response = await Promise.race([work, deadline]);
    if (state.signal.aborted || Date.now() >= state.expires) {
      controller.abort(); response = failure(new OperationsError('request_deadline', 504));
    }
    if (state.blocked) response = failure(state.blocked);
  } catch (error) { response = failure(error); }
  finally { clearTimeout(timer); }
  if (settings?.mode === 'shared') {
    const metric = (state?.db ? Promise.resolve(state.db) : database(env))
      .then(db => record(db, response.status, Math.max(0, Date.now() - started)))
      .catch(() => { console.error('operations_metrics_failed'); });
    ctx.waitUntil(metric);
  }
  return response;
}

export async function operationsStatus(env, { probe = false } = {}) {
  try {
    const settings = operationsConfig(env);
    if (settings.mode !== 'shared') return { mode: settings.mode, ready: false, reason: 'shared_controls_not_configured' };
    if (typeof env.TAMPABAYBOT_LIMIT_SECRET !== 'string' || env.TAMPABAYBOT_LIMIT_SECRET.length < 32) throw new OperationsError();
    if (settings.maintenance) return { mode: 'shared', ready: false, reason: 'maintenance' };
    // Public liveness/readiness calls must not bypass the shared request budget
    // by making unmetered D1 calls. Only the authenticated monitor probes D1.
    if (!probe) return { mode: 'shared', ready: false, reason: 'authenticated_probe_required' };
    const db = await database(env);
    await boundedSql(db.prepare('SELECT 1 AS connected').first());
    return { mode: 'shared', ready: !settings.maintenance, reason: settings.maintenance ? 'maintenance' : null };
  } catch { return { mode: 'shared', ready: false, reason: 'operations_unavailable' }; }
}

export function monitorAuthorized(request, env) {
  const provided = request.headers.get('Authorization') ?? '';
  const expected = typeof env.TAMPABAYBOT_MONITOR_TOKEN === 'string' && env.TAMPABAYBOT_MONITOR_TOKEN.length >= 32
    ? `Bearer ${env.TAMPABAYBOT_MONITOR_TOKEN}` : '';
  if (!expected || provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function operationalMetrics(request, env) {
  if (!monitorAuthorized(request, env)) return new Response('Not found.', { status: 404 });
  try {
    const db = await database(env);
    const now = Date.now();
    const primary = db.withSession ? db.withSession('first-primary') : db;
    const result = await boundedSql(primary.batch([
      primary.prepare('DELETE FROM ops_leases WHERE expires_at<=?').bind(now),
      primary.prepare('DELETE FROM ops_ai_leases WHERE expires_at<=?').bind(now),
      primary.prepare('DELETE FROM ops_ai_circuit WHERE expires_at<=?').bind(now),
      primary.prepare('DELETE FROM ops_counters WHERE expires_at<=?').bind(now),
      primary.prepare('DELETE FROM ops_metrics WHERE bucket<?').bind(now - 7 * day),
      primary.prepare('DELETE FROM ops_ai_metrics WHERE bucket<?').bind(now - 7 * day),
      primary.prepare('SELECT COALESCE(SUM(requests),0) AS requests,COALESCE(SUM(errors),0) AS errors,COALESCE(SUM(limited),0) AS limited,COALESCE(MAX(max_duration_ms),0) AS max_duration_ms FROM ops_metrics WHERE bucket>=?').bind(now - 15 * minute),
      primary.prepare('SELECT COUNT(*) AS active FROM ops_leases WHERE expires_at>?').bind(now),
      primary.prepare('SELECT COALESCE(SUM(succeeded),0) AS succeeded,COALESCE(SUM(failed),0) AS failed,COALESCE(SUM(rejected),0) AS rejected,COALESCE(SUM(provider_quota),0) AS provider_quota,COALESCE(SUM(timeouts),0) AS timeouts FROM ops_ai_metrics WHERE bucket>=?').bind(bucket(now, day)),
      primary.prepare('SELECT COUNT(*) AS active FROM ops_ai_leases WHERE expires_at>?').bind(now),
    ]));
    const [metrics, active, aiMetrics, aiActive] = result.slice(6);
    return Response.json({ window_minutes: 15, retention_days: 7, ...metrics.results[0], ...active.results[0],
      ai: { utc_day: new Date(bucket(now, day)).toISOString().slice(0, 10), ...aiMetrics.results[0], active: aiActive.results[0].active },
      limits: operationsConfig(env).limits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return failure(new OperationsError()); }
}
