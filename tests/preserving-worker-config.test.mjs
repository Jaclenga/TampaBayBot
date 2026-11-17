import test from 'node:test';
import assert from 'node:assert/strict';
import { preservingWorkerConfig } from '../scripts/deploy-preserving-worker.mjs';
const original = { name: 'fixture-worker', compatibility_date: '2026-09-11', compatibility_flags: ['nodejs_compat'],
  vars: { LLM_PROVIDER: 'none' }, assets: { directory: '../client' }, workers_dev: true, preview_urls: true };
const settings = { compatibility_date: '2026-09-11', compatibility_flags: ['nodejs_compat'], usage_model: 'standard',
  bindings: [{ name: 'AI', type: 'ai' }, { name: 'DB', type: 'd1', id: '11111111-1111-4111-8111-111111111111' },
    { name: 'LLM_PROVIDER', type: 'plain_text', text: 'workers-ai' }, { name: 'TAMPABAYBOT_OPERATIONS_MODE', type: 'plain_text', text: 'shared' },
    { name: 'TAMPABAYBOT_LIMIT_SECRET', type: 'secret_text' }] };
const exposure = { enabled: false, previews_enabled: false };
test('deployment overlay preserves AI, exact D1, live controls and disabled backend URLs without secret values', () => {
  const result = preservingWorkerConfig(original, settings, exposure, 'fixture-worker');
  assert.equal(result.workers_dev, false); assert.equal(result.preview_urls, false);
  assert.deepEqual(result.ai, { binding: 'AI' });
  assert.equal(result.d1_databases[0].database_id, settings.bindings[1].id);
  assert.equal(result.vars.LLM_PROVIDER, 'workers-ai');
  assert.equal(result.vars.TAMPABAYBOT_OPERATIONS_MODE, 'shared');
  assert.equal(result.keep_vars, true);
  assert.ok(!Object.hasOwn(result.vars, 'TAMPABAYBOT_LIMIT_SECRET'));
  assert.deepEqual(result.assets, original.assets);
});
test('unknown bindings, missing resource IDs, target and runtime changes fail closed', () => {
  assert.throws(() => preservingWorkerConfig(original, { ...settings, bindings: [...settings.bindings, { name: 'STORE', type: 'r2_bucket' }] }, exposure, 'fixture-worker'), /Unsupported live binding/);
  assert.throws(() => preservingWorkerConfig(original, { ...settings, bindings: [{ name: 'DB', type: 'd1' }] }, exposure, 'fixture-worker'), /D1 ID/);
  assert.throws(() => preservingWorkerConfig(original, settings, exposure, 'another-worker'), /another Worker/);
  assert.throws(() => preservingWorkerConfig(original, { ...settings, compatibility_date: '2026-11-17' }, exposure, 'fixture-worker'), /Runtime date/);
  assert.throws(() => preservingWorkerConfig(original, settings, {}, 'fixture-worker'));
});
