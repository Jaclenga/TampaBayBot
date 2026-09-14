import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpProvider, parseLlmConfig, synthesizeAnswer } from '../src/lib/llm/index.mjs';

const UNKNOWN = { inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null };
const OUTPUT = '{"selections":[]}';
const configFor = protocol => parseLlmConfig({
  LLM_PROVIDER: protocol,
  LLM_BASE_URL: protocol === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.example.com/v1',
  LLM_MODEL: 'private-test-model', LLM_API_KEY: 'private-test-key',
});
const request = () => ({ messages: [], model: 'private-test-model', schema: {}, signal: new AbortController().signal });
const envelope = (protocol, extra = {}) => protocol === 'ollama'
  ? { done: true, message: { content: OUTPUT }, ...extra }
  : { choices: [{ finish_reason: 'stop', message: { content: OUTPUT } }], ...extra };
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function observe(protocol, payload, onUsage) {
  const seen = [];
  const provider = createHttpProvider(configFor(protocol), async () => response(payload), {
    onUsage: onUsage ?? (usage => seen.push(usage)),
  });
  const result = await provider.complete(request());
  return { result, seen };
}

test('native Ollama usage reports input and output tokens with a derived total and unknown cache count', async () => {
  const { result, seen } = await observe('ollama', envelope('ollama', { prompt_eval_count: 120, eval_count: 35 }));
  assert.equal(result, OUTPUT);
  assert.deepEqual(seen, [{ inputTokens: 120, outputTokens: 35, cachedInputTokens: null, totalTokens: 155 }]);
  assert.ok(Object.isFrozen(seen[0]));
});

test('OpenAI-compatible usage reports cached input as a subset of prompt tokens', async () => {
  const { result, seen } = await observe('openai-compatible', envelope('openai-compatible', { usage: {
    prompt_tokens: 120, completion_tokens: 35, total_tokens: 155,
    prompt_tokens_details: { cached_tokens: 80 },
  } }));
  assert.equal(result, OUTPUT);
  assert.deepEqual(seen, [{ inputTokens: 120, outputTokens: 35, cachedInputTokens: 80, totalTokens: 155 }]);
});

test('native Ollama reports its optional cached prompt count when available', async () => {
  const { seen } = await observe('ollama', envelope('ollama', { prompt_eval_count: 120, eval_count: 35, prompt_eval_cached_count: 80 }));
  assert.deepEqual(seen, [{ inputTokens: 120, outputTokens: 35, cachedInputTokens: 80, totalTokens: 155 }]);
  assert.deepEqual((await observe('ollama', envelope('ollama', { prompt_eval_count: 10, eval_count: 2, prompt_eval_cached_count: 11 }))).seen, [UNKNOWN]);
});

test('absent usage stays unknown and explicit zero token counts remain known', async () => {
  for (const protocol of ['ollama', 'openai-compatible']) {
    assert.deepEqual((await observe(protocol, envelope(protocol))).seen, [UNKNOWN]);
  }
  const { seen } = await observe('openai-compatible', envelope('openai-compatible', { usage: {
    prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 },
  } }));
  assert.deepEqual(seen, [{ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 }]);
});

test('partial usage preserves known counters without inventing missing counts', async () => {
  assert.deepEqual((await observe('ollama', envelope('ollama', { eval_count: 7 }))).seen,
    [{ inputTokens: null, outputTokens: 7, cachedInputTokens: null, totalTokens: null }]);
  assert.deepEqual((await observe('openai-compatible', envelope('openai-compatible', { usage: { prompt_tokens: 9, completion_tokens: 2 } }))).seen,
    [{ inputTokens: 9, outputTokens: 2, cachedInputTokens: null, totalTokens: null }]);
});

test('malformed usage counters are unknown without invalidating otherwise valid output', async () => {
  for (const invalid of ['7', -1, 0.5, Number.MAX_SAFE_INTEGER + 1, true, {}, [], null]) {
    const { result, seen } = await observe('openai-compatible', envelope('openai-compatible', { usage: {
      prompt_tokens: invalid, completion_tokens: invalid, total_tokens: invalid,
      prompt_tokens_details: { cached_tokens: invalid },
    } }));
    assert.equal(result, OUTPUT);
    assert.deepEqual(seen, [UNKNOWN]);
    assert.deepEqual((await observe('ollama', envelope('ollama', { prompt_eval_count: invalid, eval_count: invalid }))).seen, [UNKNOWN]);
  }
  for (const usage of ['secret-provider-text', false, [], null]) {
    assert.deepEqual((await observe('openai-compatible', envelope('openai-compatible', { usage }))).seen, [UNKNOWN]);
  }
});

test('contradictory counters and unsafe derived totals cannot be used as measurements', async () => {
  for (const usage of [
    { prompt_tokens: 10, completion_tokens: 5, total_tokens: 14 },
    { prompt_tokens: 10, completion_tokens: 5, total_tokens: 16 },
    { prompt_tokens: 10, total_tokens: 9 },
    { completion_tokens: 10, total_tokens: 9 },
    { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 11 } },
    { completion_tokens: 5, total_tokens: 10, prompt_tokens_details: { cached_tokens: 6 } },
    { prompt_tokens: Number.MAX_SAFE_INTEGER, completion_tokens: 1 },
  ]) {
    assert.deepEqual((await observe('openai-compatible', envelope('openai-compatible', { usage }))).seen, [UNKNOWN]);
  }
  assert.deepEqual((await observe('ollama', envelope('ollama', { prompt_eval_count: Number.MAX_SAFE_INTEGER, eval_count: 1 }))).seen, [UNKNOWN]);
});

test('refused, incomplete, and provider-error JSON responses retain usage before rejection', async () => {
  const usage = { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 };
  for (const extra of [
    { choices: [{ finish_reason: 'length', message: { content: OUTPUT } }] },
    { choices: [{ finish_reason: 'stop', message: { content: OUTPUT, refusal: 'private-refusal' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: OUTPUT, tool_calls: [{}] } }] },
    { error: { message: 'private-provider-error' } },
  ]) {
    const seen = [];
    const provider = createHttpProvider(configFor('openai-compatible'), async () => response(envelope('openai-compatible', { usage, ...extra })), { onUsage: item => seen.push(item) });
    await assert.rejects(provider.complete(request()), /invalid_output|provider_failure/);
    assert.deepEqual(seen, [{ inputTokens: 20, outputTokens: 4, cachedInputTokens: null, totalTokens: 24 }]);
  }
  const seen = [];
  const provider = createHttpProvider(configFor('ollama'), async () => response(envelope('ollama', { done: false, prompt_eval_count: 20, eval_count: 4 })), { onUsage: item => seen.push(item) });
  await assert.rejects(provider.complete(request()), /invalid_output/);
  assert.deepEqual(seen, [{ inputTokens: 20, outputTokens: 4, cachedInputTokens: null, totalTokens: 24 }]);
});

test('selection validation fallback retains measured usage without exposing it in resident answers', async () => {
  const config = configFor('ollama');
  const seen = [];
  const provider = createHttpProvider(config, async () => response(envelope('ollama', { prompt_eval_count: 30, eval_count: 2 })), { onUsage: item => seen.push(item) });
  const baseline = {
    category: 'housing', status: 'answered', query: 'Where can I apply?', answer: 'Original answer. [E1]',
    evidence: [{ id: 'E1', quote: 'Applications are closed.', title: 'Synthetic notice', url: 'https://example.com' }],
  };
  const result = await synthesizeAnswer(baseline, { config, provider });
  assert.equal(result.generation.reason, 'invalid_output');
  assert.equal(result.answer, baseline.answer);
  assert.deepEqual(seen, [{ inputTokens: 30, outputTokens: 2, cachedInputTokens: null, totalTokens: 32 }]);
  assert.equal(Object.hasOwn(result, 'usage'), false);
  assert.equal(Object.hasOwn(result.generation, 'usage'), false);
});

test('usage observations expose only allowlisted numeric fields, excluding provider text and metadata', async () => {
  const { seen } = await observe('openai-compatible', envelope('openai-compatible', {
    model: 'private-response-model', id: 'private-request-id', secret: 'private-response-secret',
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, secret: 'private-usage-secret',
      prompt_tokens_details: { cached_tokens: 5, secret: 'private-details-secret' } },
  }));
  assert.deepEqual(Object.keys(seen[0]).sort(), ['cachedInputTokens', 'inputTokens', 'outputTokens', 'totalTokens']);
  assert.doesNotMatch(JSON.stringify(seen), /private-|example|selections|content/);
});

test('synchronous and asynchronous observation failures cannot break provider output', async () => {
  for (const onUsage of [() => { throw new Error('private-observer-error'); }, async () => { throw new Error('private-observer-error'); }]) {
    const { result } = await observe('ollama', envelope('ollama', { prompt_eval_count: 1, eval_count: 1 }), onUsage);
    assert.equal(result, OUTPUT);
  }
});

test('unparsed, unbounded, and unsuccessful responses never provide trusted token observations', async () => {
  for (const makeResponse of [
    () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    () => new Response(JSON.stringify({ prompt_eval_count: 10, eval_count: 2 }), { status: 500, headers: { 'content-type': 'application/json' } }),
    () => new Response(JSON.stringify({ prompt_eval_count: 10, eval_count: 2 }), { headers: { 'content-type': 'text/plain' } }),
    () => new Response(JSON.stringify({ prompt_eval_count: 10, eval_count: 2 }), { headers: { 'content-type': 'application/json', 'content-length': '999999999' } }),
  ]) {
    const seen = [];
    const provider = createHttpProvider(configFor('ollama'), async () => makeResponse(), { onUsage: item => seen.push(item) });
    await assert.rejects(provider.complete(request()));
    assert.deepEqual(seen, []);
  }
});
