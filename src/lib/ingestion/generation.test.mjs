import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
    const owner = await readFile(join(root, 'data/.source-update.lock'), 'utf8');
    await assert.rejects(withPublicationLock(root, async () => {}), /locked/);
    await assert.rejects(recoverPublication(root), /still running/);
    assert.equal(await readFile(join(root, 'data/.source-update.lock'), 'utf8'), owner);
    await assert.rejects(readFile(join(root, 'data/.source-recovery.lock')), { code: 'ENOENT' });
  });
});

test('overlapping stale recoveries cannot remove the newly acquired publication lock', async t => {
  const { root, corpus } = await refreshFixture(t);
  const pid = await new Promise((done, fail) => {
    const child = spawn(process.execPath, ['-e', ''], { windowsHide: true, stdio: 'ignore' });
    child.once('error', fail); child.once('exit', () => done(child.pid));
  });
  const lock = join(root, 'data/.source-update.lock');
  await writeFile(lock, json({ pid, started_at: '2026-01-01T00:00:00Z' }));
  const stale = Promise.withResolvers(); const proceed = Promise.withResolvers();
  const owned = Promise.withResolvers(); const complete = Promise.withResolvers();
  const recovery = recoverPublication(root, { checkpoint: async stage => {
    if (stage === 'stale_owner_confirmed') { stale.resolve(); await proceed.promise; }
    if (stage === 'publication_locked') { owned.resolve(); await complete.promise; }
  } });
  try {
    await Promise.race([stale.promise, recovery.then(() => assert.fail('Expected stale lock checkpoint'))]);
    await assert.rejects(recoverPublication(root), /Source recovery is locked/);
    assert.equal(JSON.parse(await readFile(lock, 'utf8')).pid, pid);
    proceed.resolve();
    await Promise.race([owned.promise, recovery.then(() => assert.fail('Expected publication lock checkpoint'))]);
    const owner = await readFile(lock, 'utf8');
    assert.equal(JSON.parse(owner).pid, process.pid);
    await assert.rejects(recoverPublication(root), /Source recovery is locked/);
    await assert.rejects(withPublicationLock(root, async () => assert.fail('Publication must remain excluded')), /locked/);
    assert.equal(await readFile(lock, 'utf8'), owner);
  } finally {
    proceed.resolve(); complete.resolve();
    await recovery;
  }
  assert.deepEqual(await readCorpus(root), corpus);
  for (const name of ['.source-update.lock', '.source-recovery.lock']) await assert.rejects(readFile(join(root, 'data', name)), { code: 'ENOENT' });
});

test('failed recovery releases its guard while interrupted guard ownership requires manual inspection', async t => {
  const { root } = await refreshFixture(t);
  await assert.rejects(recoverPublication(root, { checkpoint: async () => { throw new Error('Synthetic recovery failure'); } }), /Synthetic recovery failure/);
  for (const name of ['.source-update.lock', '.source-recovery.lock']) await assert.rejects(readFile(join(root, 'data', name)), { code: 'ENOENT' });
  assert.equal((await recoverPublication(root)).status, 'recovered');
  const guard = join(root, 'data/.source-recovery.lock');
  const interrupted = json({ pid: 2147483647, started_at: '2026-01-01T00:00:00Z' });
  await writeFile(guard, interrupted);
  await assert.rejects(recoverPublication(root), /confirm no recovery process is running before manual cleanup/);
  assert.equal(await readFile(guard, 'utf8'), interrupted, 'Automatic stale-guard removal would reintroduce the ownership race.');
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
