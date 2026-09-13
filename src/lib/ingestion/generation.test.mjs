import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { json, makeCorpus, publishCorpus, readCorpus, recoverPublication, rollbackCorpus, validateCorpus, withPublicationLock } from './generation.mjs';
import { refreshFixture } from './refresh-fixtures.mjs';

test('one envelope remains authoritative even when compatibility mirrors disagree', async t => {
  const { root, corpus } = await refreshFixture(t);
  await writeFile(join(root, 'data/chunks.json'), '[]\n');
  assert.deepEqual(await readCorpus(root), corpus);
  await recoverPublication(root);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'data/chunks.json'))), corpus.chunks);
});

test('failure before atomic publication keeps the previous generation intact', async t => {
  const { root, corpus } = await refreshFixture(t); const next = makeCorpus(corpus.sources.map(source => ({ ...source, status: 'unavailable' })), corpus.chunks);
  await assert.rejects(withPublicationLock(root, () => publishCorpus(root, next, { expectedGeneration: corpus.generation,
    checkpoint: async point => { if (point === 'before_commit') throw new Error('simulated interruption'); } })), /simulated/);
  assert.deepEqual(await readCorpus(root), corpus);
});

test('failure after the atomic commit is recoverable without serving mixed generations', async t => {
  const { root, corpus } = await refreshFixture(t); const next = makeCorpus(corpus.sources.map(source => ({ ...source, status: 'unavailable' })), corpus.chunks);
  await assert.rejects(withPublicationLock(root, () => publishCorpus(root, next, { expectedGeneration: corpus.generation,
    checkpoint: async point => { if (point === 'after_commit') throw new Error('simulated interruption'); } })), /simulated/);
  assert.deepEqual(await readCorpus(root), next);
  assert.equal(JSON.parse(await readFile(join(root, 'data/sources.json')))[0].status, 'available');
  await recoverPublication(root);
  assert.equal(JSON.parse(await readFile(join(root, 'data/sources.json')))[0].status, 'unavailable');
  await rollbackCorpus(root, corpus.generation, next.generation);
  assert.deepEqual(await readCorpus(root), corpus);
});

test('stale updates and overlapping publishers are rejected', async t => {
  const { root, corpus } = await refreshFixture(t);
  await assert.rejects(publishCorpus(root, corpus, { expectedGeneration: '0'.repeat(64) }), /changed after review/);
  await withPublicationLock(root, async () => {
    await assert.rejects(withPublicationLock(root, async () => {}), /locked/);
    await assert.rejects(recoverPublication(root), /still running/);
  });
});

test('corpus validation checks content identity and raw provenance', async t => {
  const { corpus } = await refreshFixture(t);
  const changed = structuredClone(corpus); changed.chunks[0].text = 'A modified source excerpt';
  assert.throws(() => validateCorpus(changed), /generation digest/);
  assert.throws(() => validateCorpus(makeCorpus(changed.sources, changed.chunks)), /content digest/);
  const wrongSource = corpus.sources.map(source => ({ ...source, content_hash: 'incorrect' }));
  assert.throws(() => validateCorpus(makeCorpus(wrongSource, corpus.chunks)), /provenance differ/);
  assert.equal(json(corpus).endsWith('\n'), true);
});

test('recovery and rollback preserve un-staged registry edits before restoring mirrors', async t => {
  const { root, corpus, source } = await refreshFixture(t);
  const draft = json([{ ...source, selector: '#uncommitted-selector' }]);
  await writeFile(join(root, 'data/sources.json'), draft);
  const recovered = await recoverPublication(root);
  assert.equal(await readFile(join(root, recovered.preserved_mirrors, 'sources.json'), 'utf8'), draft);
  const next = makeCorpus(corpus.sources.map(item => ({ ...item, status: 'unavailable' })), corpus.chunks);
  await withPublicationLock(root, () => publishCorpus(root, next));
  await writeFile(join(root, 'data/sources.json'), draft);
  const rolledBack = await rollbackCorpus(root, corpus.generation, next.generation);
  assert.equal(await readFile(join(root, rolledBack.preserved_mirrors, 'sources.json'), 'utf8'), draft);
});
