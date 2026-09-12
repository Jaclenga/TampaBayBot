const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RESPONSE_BYTES = 32768;
const CONFIGS = new WeakSet();

function config(value) {
  const result = Object.freeze(value);
  CONFIGS.add(result);
  return result;
}

function disabled(valid = true, invalidReason) {
  return config({ provider: 'none', valid, enabled: false, timeoutMs: DEFAULT_TIMEOUT_MS,
    maxResponseBytes: DEFAULT_RESPONSE_BYTES, locality: null, ...(invalidReason ? { invalidReason } : {}) });
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function addressKind(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return 'loopback';
  if (host.includes(':')) {
    if (/^f[cd]/.test(host)) return 'private';
    // IPv4-mapped, unspecified, link-local, multicast and reserved IPv6 are not endpoints.
    return /^[23][0-9a-f]{3}:/.test(host) && !host.startsWith('2001:db8:') ? 'public' : 'blocked';
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c, d] = host.split('.').map(Number);
    if ([a, b, c, d].some(octet => octet > 255)) return 'blocked';
    if (a === 127) return 'loopback';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)) return 'blocked';
    return 'public';
  }
  if (!host.includes('.') || /\.(localhost|local|internal|lan|invalid|test)$/.test(host)) return 'blocked';
  return host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? 'public' : 'blocked';
}

/** Pure server configuration. Never reads process.env, opens a connection, or throws. */
export function parseLlmConfig(env = {}) {
  try {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return disabled(false, 'invalid_environment');
    const provider = env.LLM_PROVIDER === undefined || env.LLM_PROVIDER === '' ? 'none' : env.LLM_PROVIDER;
    if (!['none', 'ollama', 'openai-compatible'].includes(provider)) return disabled(false, 'invalid_provider');
    if (provider === 'none') return disabled();
    const model = env.LLM_MODEL;
    if (typeof model !== 'string' || !model.trim() || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) return disabled(false, 'invalid_model');
    if (typeof env.LLM_BASE_URL !== 'string' || !env.LLM_BASE_URL.trim() || env.LLM_BASE_URL.length > 2048) return disabled(false, 'invalid_endpoint');
    if (/[\u0000-\u0020\u007f\\]/.test(env.LLM_BASE_URL)) return disabled(false, 'invalid_endpoint');
    const url = new URL(env.LLM_BASE_URL);
    if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) return disabled(false, 'invalid_endpoint');
    const kind = addressKind(url.hostname);
    const privateFlag = env.LLM_ALLOW_PRIVATE_HTTP;
    if (privateFlag !== undefined && !['', 'true', 'false'].includes(privateFlag)) return disabled(false, 'invalid_private_http_setting');
    const allowPrivateHttp = privateFlag === 'true';
    if (kind === 'blocked' || (kind === 'private' && url.protocol === 'http:' && !allowPrivateHttp) ||
      (kind === 'public' && url.protocol !== 'https:')) return disabled(false, 'disallowed_endpoint');
    // A base URL is operator configuration, never a value accepted from a resident question.
    const pathname = url.pathname.replace(/\/+$/, '');
    if (/\/(?:api\/chat|chat\/completions)$/.test(pathname)) return disabled(false, 'expected_base_url');
    url.pathname = pathname + (provider === 'ollama' ? '/api/chat' : '/chat/completions');
    const apiKey = env.LLM_API_KEY;
    if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 4096 || /[\u0000-\u0020\u007f]/.test(apiKey))) return disabled(false, 'invalid_api_key');
    const timeoutMs = boundedInteger(env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 120000);
    const maxResponseBytes = boundedInteger(env.LLM_MAX_RESPONSE_BYTES, DEFAULT_RESPONSE_BYTES, 1024, 262144);
    if (timeoutMs === null || maxResponseBytes === null) return disabled(false, 'invalid_limits');
    return config({ provider, valid: true, enabled: true, endpoint: url.href, model: model.trim(),
      ...(apiKey ? { apiKey } : {}), timeoutMs, maxResponseBytes,
      locality: kind === 'loopback' ? 'loopback' : 'network' });
  } catch { return disabled(false, 'invalid_config'); }
}

export function isParsedLlmConfig(value) {
  return Boolean(value && typeof value === 'object' && CONFIGS.has(value));
}

/** Endpoint locality does not establish where the provider actually runs inference. */
export function publicLlmInfo(value) {
  if (!isParsedLlmConfig(value) || !value.valid) return { enabled: false, provider: 'invalid', locality: null };
  return { enabled: value.enabled, provider: value.provider, locality: value.locality };
}
