import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoCorpus } from './fixtures/demo-corpus.mjs';
import { answerWithGuardrails } from '../src/lib/guardrails/navigator.mjs';
import { answerQuestion } from '../src/lib/core/answer.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';

const now = '2026-09-12T12:00:00Z';
const corpus = makeDemoCorpus(now);
test('redistributable demo answers preserve exact citations and local scope', async () => {
  const answer = await answerWithGuardrails('Where can I find rental assistance?', { ...corpus, now, jurisdictionId: 'tampa' });
  assert.ok(answer.evidence.length);
  assert.ok(answer.evidence.every(e => e.source_id === 'demo-housing'));
  for (const evidence of answer.evidence) assert.ok(corpus.chunks.find(c => c.id === evidence.chunk_id).text.includes(evidence.quote));
  assert.ok(answer.answer.includes('fictional') || answer.answer.includes('Fictional'));
  assert.equal(answer.generation.status, 'disabled');
});
test('fixture queries distinguish clarification, foreign evidence and source outage', () => {
  assert.equal(answerQuestion('I need help paying rent', { ...corpus, now }).status, 'needs_jurisdiction');
  const answer = answerQuestion('I need help paying rent', { ...corpus, now, jurisdictionId: 'pasco-county' });
  assert.equal(answer.evidence.length, 0);
  const unavailable = answerQuestion('I need help paying rent', { sources: corpus.sources, chunks: [], now, jurisdictionId: 'tampa' });
  assert.equal(unavailable.status, 'unavailable_source');
});
test('synthetic provider cannot replace cited evidence with invented output', async () => {
  const config = parseLlmConfig({ LLM_PROVIDER: 'ollama', LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'synthetic' });
  const answer = await answerWithGuardrails('What does the fictional rental assistance cover?', { ...corpus, now, jurisdictionId: 'tampa', config, provider: { complete: async () => ({ selections: [{ id: 'invented', quote: 'Everyone is approved.' }] }) } });
  assert.notEqual(answer.generation.status, 'used');
  assert.doesNotMatch(answer.answer, /Everyone is approved/);
});
test('fixture requests run privacy guards before any provider call', async () => {
  let called = false;
  await assert.rejects(answerWithGuardrails('Help with housing, SSN 123-45-6789', { ...corpus, now, provider: { complete: async () => { called = true; } } }), error => error.code === 'sensitive_input');
  assert.equal(called, false);
});
