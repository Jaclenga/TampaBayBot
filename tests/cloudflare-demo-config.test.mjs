import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReviewedBuild, makeCloudflareDemoConfig } from '../scripts/cloudflare-demo-config.mjs';

const base = {
  name: 'original', main: 'index.js', assets: { directory: '../client' },
  vars: { LLM_PROVIDER: 'none' }, workers_dev: true, preview_urls: false,
};
const settings = {
  databaseId: '12345678-1234-4123-8123-123456789abc',
  databaseName: 'tampabaybot-demo-ops', name: 'tampabaybot-demo-api',
};

test('demo config binds AI and D1, caps public usage, and keeps backend private', () => {
  const config = makeCloudflareDemoConfig(base, settings);
  assert.equal(config.ai.binding, 'AI');
  assert.equal(config.d1_databases[0].binding, 'DB');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.LLM_PROVIDER, 'workers-ai');
  assert.equal(config.vars.TAMPABAYBOT_OPERATIONS_MODE, 'shared');
  assert.equal(config.vars.TAMPABAYBOT_LIMIT_MODEL_PER_DAY, '100');
  assert.equal(config.vars.TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY, '15');
  assert.equal(config.vars.TAMPABAYBOT_LIMIT_MODEL_CONCURRENCY, '2');
  assert.equal(config.vars.LLM_MAX_PROMPT_BYTES, '12000');
  assert.equal(base.vars.LLM_PROVIDER, 'none');
  assert.equal(base.ai, undefined);
});

test('demo config refuses invalid bindings and unverified provider configuration', () => {
  assert.throws(() => makeCloudflareDemoConfig({ ...base, vars: { LLM_PROVIDER: 'ollama' } }, settings));
  assert.throws(() => makeCloudflareDemoConfig(base, { ...settings, databaseId: 'invalid' }));
  assert.throws(() => makeCloudflareDemoConfig(base, { ...settings, name: 'bad/name' }));
});

test('demo preparation requires the applied review receipt to match the verified Worker corpus', () => {
  const generation = 'a'.repeat(64);
  const candidate = { candidate_sha256: 'b'.repeat(64), corpus: { generation, chunks: [{}, {}], sources: [{}] } };
  const receipt = { schema_version: 1, status: 'applied', reviewer: 'Source reviewer',
    candidate_sha256: candidate.candidate_sha256, generation, build: { status: 'passed' } };
  const verification = { corpus: { generation, chunks: 2, sources: 1 } };
  assert.doesNotThrow(() => assertReviewedBuild(verification, receipt, candidate));
  assert.throws(() => assertReviewedBuild(verification, { ...receipt, reviewer: '' }, candidate));
  assert.throws(() => assertReviewedBuild(verification, { ...receipt, status: 'awaiting_review' }, candidate));
  assert.throws(() => assertReviewedBuild(verification, { ...receipt, candidate_sha256: 'c'.repeat(64) }, candidate));
  assert.throws(() => assertReviewedBuild({ corpus: { generation: 'c'.repeat(64), chunks: 2, sources: 1 } }, receipt, candidate));
  assert.throws(() => assertReviewedBuild({ corpus: { generation, chunks: 1, sources: 1 } }, receipt, candidate));
  assert.throws(() => assertReviewedBuild({ corpus: { generation, chunks: 2, sources: 2 } }, receipt, candidate));
});
