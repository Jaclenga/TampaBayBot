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
  outboundPerDay: 10000, modelPerDay: 100, deadlineMs: 30000, leaseMs: 45000 });

export class OperationsError extends Error {
  constructor(code = 'operations_unavailable', status = 503, retryAfter = 30) {
    super(code); this.code = code; this.status = status; this.retryAfter = retryAfter;
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
async function clientKey(request, secret, now) {
  if (typeof secret !== 'string' || secret.length < 32) throw new OperationsError('operations_configuration');
  // Cloudflare replaces CF-Connecting-IP at the trusted ingress. Never consume
  // arbitrary X-Forwarded-For. Clients without that header share a small bucket.
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${bucket(now, minute)}:${address}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function acquireRequest(request, env, { now = Date.now(), limits = operationsConfig(env).limits } = {}) {
  const db = await database(env);
  const client = await clientKey(request, env.TAMPABAYBOT_LIMIT_SECRET, now);
  const previousClient = await clientKey(request, env.TAMPABAYBOT_LIMIT_SECRET, now - minute);
  const id = crypto.randomUUID();
  const min = bucket(now, minute), date = bucket(now, day);
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
  ]));
  if (!results[2].results?.length) throw new OperationsError('request_limit', 429, Math.ceil((min + minute - now) / 1000));
  return { db, id, limits, expires: now + limits.deadlineMs, outbound: 0, blocked: null };
}

export async function reserveOutbound(kind = 'gis') {
  const state = context.getStore();
  if (!state) return; // Offline acquisition and unit fixtures have their own bounds.
  if (state.signal?.aborted || Date.now() >= state.expires) {
    state.blocked = new OperationsError('request_deadline', 504); throw state.blocked;
  }
  if (++state.outbound > state.limits.outboundPerRequest) {
    state.blocked = new OperationsError('outbound_budget', 503); throw state.blocked;
  }
  if (!state.db) return;
  const now = Date.now(), min = bucket(now, minute), date = bucket(now, day);
  const keys = [`outbound:minute:${min}`, `outbound:day:${date}`, ...(kind === 'model' ? [`model:day:${date}`] : [])];
  const caps = [state.limits.outboundPerMinute, state.limits.outboundPerDay, state.limits.modelPerDay];
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
    db.prepare(`INSERT INTO ops_metrics (bucket,requests,errors,limited,duration_ms,max_duration_ms) VALUES (?,1,?,?,?,?)
      ON CONFLICT(bucket) DO UPDATE SET requests=requests+1, errors=errors+excluded.errors,
      limited=limited+excluded.limited,duration_ms=duration_ms+excluded.duration_ms,
      max_duration_ms=MAX(max_duration_ms,excluded.max_duration_ms)`)
      .bind(bucket(now, 5 * minute), status >= 500 ? 1 : 0, status === 429 ? 1 : 0, elapsed, elapsed),
  ]));
}
function failure(error) {
  const value = error instanceof OperationsError ? error : new OperationsError();
  return Response.json({ error: 'The service is temporarily busy. Please try again shortly.', code: value.code },
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
      : { limits: settings.limits, expires: started + settings.limits.deadlineMs, outbound: 0 };
    const controller = new AbortController();
    state.expires = started + settings.limits.deadlineMs;
    state.signal = AbortSignal.any([request.signal, controller.signal]);
    const work = context.run(state, async () => dispatch(new Request(request, { signal: state.signal })));
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new OperationsError('request_deadline', 504)); }, Math.max(1, state.expires - Date.now())); });
    // Release only when dispatch really finishes. A timed-out handler retains
    // its bounded lease until it settles or expires; later fetches are denied.
    const cleanup = work.then(() => undefined, () => undefined).then(async () => {
      if (state.db) await boundedSql(state.db.prepare('DELETE FROM ops_leases WHERE id=?').bind(state.id).run());
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
      primary.prepare('DELETE FROM ops_counters WHERE expires_at<=?').bind(now),
      primary.prepare('DELETE FROM ops_metrics WHERE bucket<?').bind(now - 7 * day),
      primary.prepare('SELECT COALESCE(SUM(requests),0) AS requests,COALESCE(SUM(errors),0) AS errors,COALESCE(SUM(limited),0) AS limited,COALESCE(MAX(max_duration_ms),0) AS max_duration_ms FROM ops_metrics WHERE bucket>=?').bind(now - 15 * minute),
      primary.prepare('SELECT COUNT(*) AS active FROM ops_leases WHERE expires_at>?').bind(now),
    ]));
    const [metrics, active] = result.slice(3);
    return Response.json({ window_minutes: 15, retention_days: 7, ...metrics.results[0], ...active.results[0], limits: operationsConfig(env).limits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return failure(new OperationsError()); }
}
