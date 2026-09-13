import { parseLlmConfig, publicLlmInfo, isParsedLlmConfig } from './config.mjs';
import { createHttpProvider, LlmFailure } from './providers.mjs';
import { selectionRequest, validateSelection, renderSelection } from './selection.mjs';

export { parseLlmConfig, publicLlmInfo, createHttpProvider };

const SAFE_REASONS = new Set(['provider_failure', 'invalid_output', 'response_too_large', 'timeout', 'cancelled', 'invalid_evidence', 'input_too_large']);

/** Optional constrained evidence selection. The deterministic answer remains the authority.
 * Configuration is server-owned; no resident field can enable or select a provider. */
export async function synthesizeAnswer(baseline, { config = parseLlmConfig(), fetchImpl, provider, signal } = {}) {
  const info = publicLlmInfo(config);
  const fallback = (status, reason) => ({ ...baseline, generation: {
    mode: 'extractive', provider: info.provider, status, ...(reason ? { reason } : {}),
  } });
  if (!isParsedLlmConfig(config) || !config.valid) return fallback('fallback', 'invalid_config');
  if (!config.enabled) return fallback('disabled');
  if (baseline?.status !== 'answered') return fallback('skipped', 'non_answered_status');
  if (signal?.aborted) return fallback('fallback', 'cancelled');
  let request;
  try { request = selectionRequest(baseline); }
  catch (error) { return fallback('fallback', error instanceof LlmFailure && SAFE_REASONS.has(error.reason) ? error.reason : 'invalid_evidence'); }
  const controller = new AbortController();
  let timer;
  let cancel;
  const cancellation = new Promise((_, reject) => {
    cancel = () => { reject(new LlmFailure('cancelled')); controller.abort(); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new LlmFailure('timeout')); }, config.timeoutMs);
  });
  try {
    const adapter = provider ?? createHttpProvider(config, fetchImpl);
    if (!adapter || typeof adapter.complete !== 'function') throw new LlmFailure('provider_failure');
    // Custom trusted adapters receive only a fresh request object, never the baseline object.
    const text = await Promise.race([Promise.resolve().then(() => adapter.complete({
      messages: request.messages, schema: request.schema, model: config.model, signal: controller.signal,
    })), timeout, cancellation]);
    const selected = validateSelection(text, request.evidence, config.maxResponseBytes, request.requiredIds);
    return { ...baseline, answer: renderSelection(selected), generation: {
      mode: 'llm', provider: config.provider, status: 'used',
    } };
  } catch (error) {
    return fallback('fallback', error instanceof LlmFailure && SAFE_REASONS.has(error.reason) ? error.reason : 'provider_failure');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
