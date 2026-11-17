import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encryptState, decryptState, saveSourceState, restoreSourceState } from '../scripts/automatic-source-state.mjs';
import { refreshFixture } from '../src/lib/ingestion/refresh-fixtures.mjs';
import { digest, json, makeCorpus, readCorpus } from '../src/lib/ingestion/generation.mjs';
import { stageRefresh, applyRefresh } from '../src/lib/ingestion/refresh.mjs';

const context = { repository: 'fixture/repository', worker: 'fixture-worker' };
const key = randomBytes(32).toString('hex');
const options = { ...context, key, output: 'work/state/source-state.enc', input: 'work/state/source-state.enc' };
async function emptyTarget(t) {
  const target = await refreshFixture(t);
  await writeFile(join(target.root, 'data/corpus.json'), json(makeCorpus(target.corpus.sources, [])));
  return target;
}

test('encrypted state authenticates both bytes and repository/Worker identity without disclosing source text', () => {
  const archive = { schema_version: 1, files: [{ content: 'private source sentinel' }] };
  const encrypted = encryptState(archive, key, context);
  assert.ok(!encrypted.includes(Buffer.from('private source sentinel')));
  assert.deepEqual(decryptState(encrypted, key, context), archive);
  const tampered = Buffer.from(encrypted); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptState(tampered, key, context), /authentication/);
  assert.throws(() => decryptState(encrypted, randomBytes(32).toString('hex'), context), /authentication/);
  assert.throws(() => decryptState(encrypted, key, { ...context, worker: 'other-worker' }), /authentication/);
  assert.throws(() => decryptState(encrypted, key, { ...context, repository: 'other/repository' }), /authentication/);
});

test('a fresh hosted checkout restores provenance and history without overwriting its authored registry', async t => {
  const source = await refreshFixture(t);
  await mkdir(join(source.root, 'data/generations'), { recursive: true });
  await writeFile(join(source.root, `data/generations/${source.corpus.generation}.json`), json(source.corpus));
  const saved = await saveSourceState(source.root, options);
  assert.equal(saved.status, 'saved');
  const target = await emptyTarget(t);
  const authored = await readFile(join(target.root, 'data/sources.json'));
  await mkdir(join(target.root, 'work/state'), { recursive: true });
  await writeFile(join(target.root, options.input), await readFile(join(source.root, options.output)));
  const restored = await restoreSourceState(target.root, options);
  assert.equal(restored.generation, source.corpus.generation);
  assert.equal((await readCorpus(target.root)).generation, source.corpus.generation);
  assert.deepEqual(await readFile(join(target.root, 'data/sources.json')), authored);
  assert.deepEqual(await readFile(join(target.root, source.source.raw_path)), source.bytes);
  assert.equal(JSON.parse(await readFile(join(target.root, `data/generations/${source.corpus.generation}.json`))).generation, source.corpus.generation);
});

test('tampering, unsafe paths and missing provenance stop restoration before replacing the corpus', async t => {
  const target = await emptyTarget(t);
  const before = await readFile(join(target.root, 'data/corpus.json'));
  const corpusBytes = Buffer.from(json(target.corpus));
  for (const badFile of [
    { path: '../outside.json', content: '', sha256: digest('') },
    { path: 'data/sources.json', content: '', sha256: digest('') },
    { path: 'work/source-refresh/../../scripts/unsafe.js', content: '', sha256: digest('') },
    { path: target.source.raw_path, content: Buffer.from('wrong bytes').toString('base64'), sha256: digest('wrong bytes') },
  ]) {
    const archive = { schema_version: 1, generation: target.corpus.generation, candidate_directory: null,
      files: [{ path: 'data/corpus.json', content: corpusBytes.toString('base64'), sha256: digest(corpusBytes) }, badFile] };
    await mkdir(join(target.root, 'work/state'), { recursive: true });
    await writeFile(join(target.root, options.input), encryptState(archive, key, context));
    await assert.rejects(restoreSourceState(target.root, options), /path|provenance/);
    assert.deepEqual(await readFile(join(target.root, 'data/corpus.json')), before);
  }
});

test('empty baselines and differing live generations cannot be silently saved or replaced', async t => {
  const empty = await emptyTarget(t);
  await assert.rejects(saveSourceState(empty.root, options), /empty baseline/);
  const source = await refreshFixture(t);
  await saveSourceState(source.root, options);
  const other = await refreshFixture(t);
  await writeFile(join(other.root, 'data/corpus.json'), json(makeCorpus(other.corpus.sources.map(s => ({ ...s, status: 'unavailable' })), other.corpus.chunks)));
  await mkdir(join(other.root, 'work/state'), { recursive: true });
  await writeFile(join(other.root, options.input), await readFile(join(source.root, options.output)));
  await assert.rejects(restoreSourceState(other.root, options), /fresh checkout/);
});

test('incomplete validation state is omitted so it cannot prevent the next fresh acquisition', async t => {
  const source = await refreshFixture(t);
  await mkdir(join(source.root, 'work/source-refresh'), { recursive: true });
  await writeFile(join(source.root, 'work/source-refresh/automatic-state.json'), json({ status: 'pending', directory: 'work/source-refresh/failed-build', worker_name: context.worker }));
  await saveSourceState(source.root, options);
  const archive = decryptState(await readFile(join(source.root, options.output)), key, context);
  assert.equal(archive.candidate_directory, null);
  assert.ok(!archive.files.some(file => file.path.endsWith('/automatic-state.json')));
});

test('a checkpoint carries its applied candidate and verified upload artifact into a fresh runner', async t => {
  const f = await refreshFixture(t);
  const staged = await stageRefresh(f.root, { fetchImpl: async () => new Response(f.bytes) });
  const artifact = `${staged.directory}/artifact-abcdef12`;
  const entries = [['client/app.js', 'fixture client'], ['server/index.js', 'fixture worker'], ['server/wrangler.json', json({ name: context.worker, main: 'index.js' })]];
  for (const [name, bytes] of entries) {
    await mkdir(join(f.root, artifact, name, '..'), { recursive: true });
    await writeFile(join(f.root, artifact, name), bytes);
  }
  const hash = digest(JSON.stringify(entries.map(([name, bytes]) => [name, digest(bytes)])));
  await writeFile(join(f.root, artifact, 'verification.json'), json({ status: 'passed', artifact_sha256: hash, artifact_file_count: entries.length }));
  await applyRefresh(f.root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'fixture-only',
    validateAndBuild: async candidate => ({ status: 'passed', generation: candidate.corpus.generation, artifact,
      artifact_sha256: hash, config: `${artifact}/server/wrangler.json` }) });
  await writeFile(join(f.root, 'work/source-refresh/automatic-state.json'), json({ status: 'pending', deploy: true,
    worker_name: context.worker, directory: staged.directory, candidate_sha256: staged.candidate_sha256 }));
  await saveSourceState(f.root, options);
  const target = await emptyTarget(t);
  await mkdir(join(target.root, 'work/state'), { recursive: true });
  await writeFile(join(target.root, options.input), await readFile(join(f.root, options.output)));
  await restoreSourceState(target.root, options);
  assert.equal(JSON.parse(await readFile(join(target.root, 'work/source-refresh/automatic-state.json'))).status, 'pending');
  assert.equal(await readFile(join(target.root, artifact, 'server/index.js'), 'utf8'), 'fixture worker');
});

