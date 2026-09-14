import { isParsedLlmConfig } from './config.mjs';
import { reserveOutbound, operationalSignal } from '../operations/control.mjs';

export class LlmFailure extends Error {
  constructor(reason) { super(reason); this.name = 'LlmFailure'; this.reason = reason; }
}

const tokenCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const unknownUsage = () => ({ inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null });

function tokenUsage(value, protocol) {
  const reported = protocol === 'ollama' ? value : value?.usage;
  if (!reported || typeof reported !== 'object' || Array.isArray(reported)) return unknownUsage();
  const inputTokens = tokenCount(protocol === 'ollama' ? reported.prompt_eval_count : reported.prompt_tokens);
  const outputTokens = tokenCount(protocol === 'ollama' ? reported.eval_count : reported.completion_tokens);
  const cachedInputTokens = tokenCount(protocol === 'ollama' ? reported.prompt_eval_cached_count : reported.prompt_tokens_details?.cached_tokens);
  const sum = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
  const totalTokens = protocol === 'ollama' ? tokenCount(sum) : tokenCount(reported.total_tokens);
  // Conflicting counters cannot safely support a cost estimate. Missing counters
  // remain unknown; compatible providers do not all report the same usage fields.
  if ((sum !== null && !Number.isSafeInteger(sum))
    || (cachedInputTokens !== null && inputTokens !== null && cachedInputTokens > inputTokens)
    || (cachedInputTokens !== null && totalTokens !== null && cachedInputTokens + (outputTokens ?? 0) > totalTokens)
    || (totalTokens !== null && inputTokens !== null && totalTokens < inputTokens)
    || (totalTokens !== null && outputTokens !== null && totalTokens < outputTokens)
    || (totalTokens !== null && sum !== null && totalTokens !== sum)) return unknownUsage();
  return { inputTokens, outputTokens, cachedInputTokens, totalTokens };
}

function observeUsage(onUsage, value, protocol) {
  if (typeof onUsage !== 'function') return;
  try {
    // Observers receive only allowlisted counts, never provider metadata or text.
    // A rejected asynchronous observer must not turn a valid answer into failure.
    Promise.resolve(onUsage(Object.freeze(tokenUsage(value, protocol)))).catch(() => {});
  } catch { /* Metrics must not affect answer handling. */ }
}

async function boundedJson(response, maximumBytes, signal) {
  if (!response || !response.ok || response.redirected || response.status < 200 || response.status >= 300) {
    await response?.body?.cancel?.().catch(() => {});
    throw new LlmFailure('provider_failure');
  }
  const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') {
    await response.body?.cancel?.().catch(() => {});
    throw new LlmFailure('invalid_output');
  }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximumBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new LlmFailure('response_too_large');
  }
  if (!response.body?.getReader) throw new LlmFailure('invalid_output');
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  let complete = false;
  const cancelOnAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelOnAbort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new LlmFailure('timeout');
      const { value, done } = await reader.read();
      if (done) { complete = true; break; }
      total += value.byteLength;
      if (total > maximumBytes) throw new LlmFailure('response_too_large');
      parts.push(value);
    }
    if (signal.aborted) throw new LlmFailure('timeout');
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new LlmFailure('invalid_output'); }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Provider-neutral interface: complete({messages,model,signal,schema}) -> JSON text.
 * Built-ins follow official /api/chat and /chat/completions HTTP contracts. */
export function createHttpProvider(config, fetchImpl = globalThis.fetch, { onUsage } = {}) {
  return {
    async complete({ messages, model, signal, schema }) {
      if (!isParsedLlmConfig(config) || !config.valid || !config.enabled) throw new LlmFailure('provider_failure');
      if (typeof fetchImpl !== 'function') throw new LlmFailure('provider_failure');
      const headers = { 'content-type': 'application/json', accept: 'application/json' };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      const body = config.provider === 'ollama'
        ? { model, messages, stream: false, format: schema, options: { temperature: 0, num_predict: 1024 } }
        : { model, messages, stream: false, response_format: { type: 'json_object' } };
      await reserveOutbound('model');
      signal = operationalSignal(signal);
      const response = await fetchImpl(config.endpoint, {
        method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'manual',
        credentials: 'omit', cache: 'no-store',
      });
      const value = await boundedJson(response, config.maxResponseBytes, signal);
      observeUsage(onUsage, value, config.provider);
      if (value?.error) throw new LlmFailure('provider_failure');
      let message;
      if (config.provider === 'ollama') {
        if (value?.done !== true || value?.tool_calls?.length || value?.function_call) throw new LlmFailure('invalid_output');
        message = value.message;
      } else {
        const choice = value?.choices?.[0];
        if (!choice || choice.finish_reason !== 'stop' || choice.message?.refusal) throw new LlmFailure('invalid_output');
        message = choice.message;
      }
      // Each protocol has its own completion markers; both require a text-only message.
      if (message?.tool_calls?.length || message?.function_call || typeof message?.content !== 'string') throw new LlmFailure('invalid_output');
      return message.content;
    },
  };
}
