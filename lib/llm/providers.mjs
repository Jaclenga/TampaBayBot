import { isParsedLlmConfig } from './config.mjs';

export class LlmFailure extends Error {
  constructor(reason) { super(reason); this.name = 'LlmFailure'; this.reason = reason; }
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
export function createHttpProvider(config, fetchImpl = globalThis.fetch) {
  return {
    async complete({ messages, model, signal, schema }) {
      if (!isParsedLlmConfig(config) || !config.valid || !config.enabled) throw new LlmFailure('provider_failure');
      if (typeof fetchImpl !== 'function') throw new LlmFailure('provider_failure');
      const headers = { 'content-type': 'application/json', accept: 'application/json' };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      const body = config.provider === 'ollama'
        ? { model, messages, stream: false, format: schema, options: { temperature: 0, num_predict: 1024 } }
        : { model, messages, stream: false, response_format: { type: 'json_object' } };
      const response = await fetchImpl(config.endpoint, {
        method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'manual',
        credentials: 'omit', cache: 'no-store',
      });
      const value = await boundedJson(response, config.maxResponseBytes, signal);
      if (value?.error) throw new LlmFailure('provider_failure');
      if (config.provider === 'ollama') {
        if (value?.done !== true || value?.message?.tool_calls?.length || value?.message?.function_call ||
          value?.tool_calls?.length || value?.function_call || typeof value?.message?.content !== 'string') throw new LlmFailure('invalid_output');
        return value.message.content;
      }
      const choice = value?.choices?.[0];
      if (!choice || choice.finish_reason !== 'stop' || choice.message?.tool_calls?.length || choice.message?.function_call ||
        choice.message?.refusal || typeof choice.message?.content !== 'string') throw new LlmFailure('invalid_output');
      return choice.message.content;
    },
  };
}
