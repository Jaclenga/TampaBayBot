import assert from 'node:assert/strict';

const WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

/** Bind a deployable build to the candidate that a human reviewed and applied. */
export function assertReviewedBuild(verification, receipt, candidate) {
  assert.equal(receipt?.schema_version, 1);
  assert.equal(receipt?.status, 'applied', 'Apply the reviewed candidate before preparing a public demo.');
  assert.ok(typeof receipt.reviewer === 'string' && receipt.reviewer.trim(), 'The source receipt must name its human reviewer.');
  assert.match(receipt.candidate_sha256 ?? '', /^[a-f\d]{64}$/i);
  assert.equal(receipt.candidate_sha256, candidate.candidate_sha256, 'The application receipt names another candidate.');
  assert.equal(receipt.build?.status, 'passed', 'The reviewed source build did not pass.');
  assert.equal(receipt.generation, candidate.corpus.generation, 'The application receipt names another corpus generation.');
  assert.equal(verification.corpus?.generation, receipt.generation, 'The standalone Worker contains a different corpus generation.');
  assert.equal(verification.corpus?.chunks, candidate.corpus.chunks.length, 'The standalone Worker contains a different chunk count.');
  assert.equal(verification.corpus?.sources, candidate.corpus.sources.length, 'The standalone Worker contains a different source count.');
}

/** Turn a verified, provider-disabled standalone build into a private demo backend. */
export function makeCloudflareDemoConfig(base, { databaseId, databaseName, name } = {}) {
  assert.ok(base && typeof base === 'object' && !Array.isArray(base));
  assert.equal(base.main, 'index.js');
  assert.equal(base.assets?.directory, '../client');
  assert.deepEqual(base.vars, { LLM_PROVIDER: 'none' });
  assert.ok(!base.d1_databases?.length && !base.ai && !base.services?.length);
  assert.match(databaseId ?? '', /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i);
  assert.match(databaseName ?? '', /^[a-z][a-z0-9_-]{2,62}$/);
  assert.match(name ?? '', /^[a-z][a-z0-9-]{2,62}$/);
  return {
    ...base,
    name,
    workers_dev: false,
    preview_urls: false,
    observability: { enabled: false },
    ai: { binding: 'AI' },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId }],
    vars: {
      LLM_PROVIDER: 'workers-ai',
      LLM_MODEL: WORKERS_AI_MODEL,
      LLM_TIMEOUT_MS: '20000',
      LLM_MAX_OUTPUT_TOKENS: '512',
      LLM_MAX_PROMPT_BYTES: '12000',
      TAMPABAYBOT_OPERATIONS_MODE: 'shared',
      TAMPABAYBOT_LIMIT_CLIENT_PER_MINUTE: '12',
      TAMPABAYBOT_LIMIT_REQUESTS_PER_MINUTE: '30',
      TAMPABAYBOT_LIMIT_REQUESTS_PER_DAY: '1000',
      TAMPABAYBOT_LIMIT_OUTBOUND_PER_DAY: '4000',
      TAMPABAYBOT_LIMIT_MODEL_PER_DAY: '100',
      TAMPABAYBOT_LIMIT_CLIENT_AI_PER_DAY: '15',
      TAMPABAYBOT_LIMIT_MODEL_CONCURRENCY: '2',
    },
  };
}
