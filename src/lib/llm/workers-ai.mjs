import { isParsedLlmConfig } from './config.mjs';
import { LlmFailure } from './providers.mjs';
import { markAiProviderQuota, reserveOutbound } from '../operations/control.mjs';

// Cloudflare documents these stable internal codes separately from HTTP 429.
// In particular, 3040 is temporary capacity, while 3036 is the daily quota.
export function workersAiFailureReason(error) {
  const message = typeof error === 'string' ? error : String(error?.message ?? '');
  const codes = [error?.code, error?.error?.code, error?.cause?.code,
    ...(Array.isArray(error?.errors) ? error.errors.slice(0, 4).map(item => item?.code) : []),
    ...(Array.isArray(error?.error?.errors) ? error.error.errors.slice(0, 4).map(item => item?.code) : []),
    ...[...message.matchAll(/\b(3036|3040|3007|5007|3042|5035)\b/g)].map(match => match[1]),
  ].map(String);
  if (codes.includes('3036')) return 'provider_quota';
  if (codes.includes('3040') || Number(error?.status) === 429) return 'provider_capacity';
  if (codes.includes('3007') || error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (codes.includes('5007') || codes.includes('3042')) return 'invalid_model';
  if (codes.includes('5035')) return 'model_unavailable';
  return 'provider_failure';
}

/** Cloudflare's AI binding returns a completed { response: string } object.
 * The caller independently validates that response against its exact evidence. */
export function createWorkersAiProvider(binding, config) {
  return {
    async complete({ messages, model, signal }) {
      if (!isParsedLlmConfig(config) || !config.valid || !config.enabled ||
        config.provider !== 'workers-ai' || typeof binding?.run !== 'function' ||
        model !== config.model) throw new LlmFailure('provider_failure');
      if (signal?.aborted) throw new LlmFailure('cancelled');
      if (new TextEncoder().encode(JSON.stringify(messages)).length > config.maxPromptBytes)
        throw new LlmFailure('input_too_large');
      let release;
      try { release = await reserveOutbound('model', { provider: 'workers-ai' }); }
      catch (error) {
        if (error?.code === 'ai_provider_quota') throw new LlmFailure('provider_quota');
        if (error?.code === 'ai_configuration') throw new LlmFailure('ai_configuration');
        throw error;
      }
      try {
        if (signal?.aborted) throw new LlmFailure('cancelled');
        const result = await binding.run(model, {
          messages, stream: false, max_tokens: config.maxOutputTokens, temperature: 0,
        });
        if (signal?.aborted) throw new LlmFailure('cancelled');
        if (result?.error) throw result.error;
        if (!result || typeof result !== 'object' || typeof result.response !== 'string' ||
          (result.tool_calls !== undefined && (!Array.isArray(result.tool_calls) || result.tool_calls.length)))
          throw new LlmFailure('invalid_output');
        if (new TextEncoder().encode(result.response).length > config.maxResponseBytes)
          throw new LlmFailure('response_too_large');
        return result.response;
      } catch (error) {
        if (error instanceof LlmFailure) throw error;
        const reason = workersAiFailureReason(error);
        if (reason === 'provider_quota') await markAiProviderQuota();
        throw new LlmFailure(reason);
      } finally { await release?.(); }
    },
  };
}
