import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoCorpus } from './fixtures/demo-corpus.mjs';
import { answerWithGuardrails } from '../src/lib/guardrails/navigator.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';

test('resident answers fail closed when a cited chunk identity is ambiguous', async () => {
  const now = '2026-09-12T12:00:00Z';
  const corpus = makeDemoCorpus(now);
  corpus.chunks.push({ ...corpus.chunks[0] });
  let providerCalls = 0;
  const answer = await answerWithGuardrails('Where can I find rental assistance?', {
    ...corpus, now, jurisdictionId: 'tampa',
    config: parseLlmConfig({
      LLM_PROVIDER: 'ollama', LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'fixture',
    }),
    provider: { complete: async () => { providerCalls++; throw new Error('must not run'); } },
  });
  assert.equal(providerCalls, 0);
  assert.equal(answer.status, 'insufficient_evidence');
  assert.equal(answer.generation.reason, 'invalid_evidence');
  assert.deepEqual(answer.evidence, []);
  assert.equal(answer.requiredEvidenceIds, undefined);
  assert.doesNotMatch(answer.answer, /\[E\d+\]|Fictional rental assistance helps/);
  assert.equal(answer.coverage.citedSourceCount, 0);
  assert.deepEqual(answer.nextSteps.map(step => step.url), ['https://example.invalid/demo-housing']);
});
