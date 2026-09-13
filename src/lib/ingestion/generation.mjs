import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const json = value => `${JSON.stringify(value, null, 2)}\n`;
export const makeCorpus = (sources, chunks) => ({ schema_version: 1, generation: digest(JSON.stringify({ sources, chunks })), sources, chunks });

export function validateCorpus(corpus) {
  assert.equal(corpus.schema_version, 1, 'Unsupported corpus schema');
  assert.ok(Array.isArray(corpus.sources) && Array.isArray(corpus.chunks), 'Corpus requires sources and chunks');
  assert.equal(corpus.generation, makeCorpus(corpus.sources, corpus.chunks).generation, 'Corpus generation digest mismatch');
  const sources = new Map(); const chunks = new Set();
  for (const source of corpus.sources) {
    assert.match(source.source_id, /^[a-z0-9-]+$/, 'Invalid source id');
    assert.ok(!sources.has(source.source_id), 'Duplicate source id'); sources.set(source.source_id, source);
  }
  for (const chunk of corpus.chunks) {
    assert.ok(typeof chunk.id === 'string' && !chunks.has(chunk.id), 'Invalid or duplicate chunk id'); chunks.add(chunk.id);
    const source = sources.get(chunk.source_id);
    assert.ok(source, 'Chunk has no registry source');
    assert.equal(typeof chunk.text, 'string', 'Chunk must contain text');
    assert.equal(chunk.content_hash, digest(chunk.text), 'Chunk content digest mismatch');
    if (source.content_hash) assert.equal(chunk.raw_content_hash, source.content_hash, 'Chunk and source raw provenance differ');
  }
  return corpus;
}

/** Validate each ancestor before writes; a symlink/junction cannot redirect refresh artifacts. */
export async function workspacePath(root, name) {
  root = await realpath(root);
  assert.ok(typeof name === 'string' && name && !isAbsolute(name), 'Use a relative workspace path');
  const target = resolve(root, name); const local = relative(root, target);
  assert.ok(local && !local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local), 'Path escapes the workspace');
  let current = root;
  for (const part of local.split(sep)) {
    current = join(current, part);
    try { assert.ok(!(await lstat(current)).isSymbolicLink(), 'Refresh paths cannot contain symbolic links or junctions'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

export async function writeAtomic(filename, value) {
  await mkdir(dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, filename); break; }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 4) throw error;
        await new Promise(done => setTimeout(done, 25 * (attempt + 1)));
      }
    }
    // POSIX directory sync persists the rename. Windows does not expose directory fsync.
    if (process.platform !== 'win32') { const directory = await open(dirname(filename), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
  } finally { try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

export async function readCorpus(root) {
  try { return validateCorpus(JSON.parse(await readFile(await workspacePath(root, 'data/corpus.json'), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Legacy/test fixture bootstrap only. Once published, one envelope is authoritative.
  const sources = JSON.parse(await readFile(await workspacePath(root, 'data/sources.json'), 'utf8'));
  const chunks = JSON.parse(await readFile(await workspacePath(root, 'data/chunks.json'), 'utf8'));
  return validateCorpus(makeCorpus(sources, chunks));
}

async function archiveCorpus(root, corpus) {
  const filename = await workspacePath(root, `data/generations/${corpus.generation}.json`);
  try { assert.equal(await readFile(filename, 'utf8'), json(corpus), 'Immutable corpus history was modified'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeAtomic(filename, json(corpus));
  }
}

export async function synchronizeMirrors(root, corpus) {
  corpus ??= await readCorpus(root);
  await writeAtomic(await workspacePath(root, 'data/sources.json'), json(corpus.sources));
  await writeAtomic(await workspacePath(root, 'data/chunks.json'), json(corpus.chunks));
}

async function preserveMirrorEdits(root, corpus) {
  const directory = `work/source-recovery/${Date.now()}-${randomUUID().slice(0, 8)}`; let preserved = false;
  for (const name of ['sources', 'chunks']) {
    try {
      const bytes = await readFile(await workspacePath(root, `data/${name}.json`));
      if (digest(bytes) === digest(json(corpus[name]))) continue;
      await writeAtomic(await workspacePath(root, `${directory}/${name}.json`), bytes); preserved = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return preserved ? directory : null;
}

export async function withPublicationLock(root, operation) {
  const filename = await workspacePath(root, 'data/.source-update.lock');
  await mkdir(dirname(filename), { recursive: true });
  let handle;
  try { handle = await open(filename, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Source update is locked; inspect the running process or use source:recover after an interrupted update'); throw error; }
  try { await handle.writeFile(json({ pid: process.pid, started_at: new Date().toISOString() })); await handle.sync(); await handle.close(); return await operation(); }
  finally { try { await handle?.close(); } catch { /* Already closed. */ } await unlink(filename); }
}

/** Caller holds the publication lock. The envelope rename is the only commit point. */
export async function publishCorpus(root, corpus, { expectedGeneration, checkpoint = async () => {} } = {}) {
  validateCorpus(corpus);
  const previous = await readCorpus(root);
  if (expectedGeneration !== undefined) assert.equal(previous.generation, expectedGeneration, 'Active corpus changed after review');
  await archiveCorpus(root, previous); await archiveCorpus(root, corpus);
  await checkpoint('before_commit');
  await writeAtomic(await workspacePath(root, 'data/corpus.json'), json(corpus));
  await checkpoint('after_commit');
  await synchronizeMirrors(root, corpus);
  return { generation: corpus.generation, previous_generation: previous.generation };
}

export async function recoverPublication(root, { checkpoint = async () => {} } = {}) {
  // Serialize stale-owner inspection and removal. A second recovery must never
  // unlink a fresh publisher's lock based on the first recovery's stale owner.
  // Never automatically remove this guard: interrupted recovery requires the
  // explicit owner inspection documented in SOURCE_UPDATES.md.
  const guard = await workspacePath(root, 'data/.source-recovery.lock');
  await mkdir(dirname(guard), { recursive: true });
  let handle;
  try { handle = await open(guard, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Source recovery is locked. Inspect data/.source-recovery.lock and confirm no recovery process is running before manual cleanup; see docs/SOURCE_UPDATES.md.');
    throw error;
  }
  try {
    await handle.writeFile(json({ pid: process.pid, started_at: new Date().toISOString() })); await handle.sync(); await handle.close();
    const lock = await workspacePath(root, 'data/.source-update.lock');
    try {
      const owner = JSON.parse(await readFile(lock, 'utf8'));
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
      assert.ok(!alive, 'Refusing recovery while the publication owner is still running');
      await checkpoint('stale_owner_confirmed');
      await unlink(lock);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return await withPublicationLock(root, async () => {
      await checkpoint('publication_locked');
      const corpus = await readCorpus(root); const preservedMirrors = await preserveMirrorEdits(root, corpus);
      await synchronizeMirrors(root, corpus);
      return { status: 'recovered', generation: corpus.generation, preserved_mirrors: preservedMirrors };
    });
  } finally {
    try { await handle.close(); } catch { /* Already closed. */ }
    await unlink(guard);
  }
}

export async function rollbackCorpus(root, generation, expectedGeneration) {
  assert.match(generation, /^[a-f0-9]{64}$/); assert.match(expectedGeneration, /^[a-f0-9]{64}$/);
  return withPublicationLock(root, async () => {
    const active = await readCorpus(root); assert.equal(active.generation, expectedGeneration, 'Active corpus changed before rollback');
    const preservedMirrors = await preserveMirrorEdits(root, active);
    const corpus = validateCorpus(JSON.parse(await readFile(await workspacePath(root, `data/generations/${generation}.json`), 'utf8')));
    return { ...await publishCorpus(root, corpus, { expectedGeneration }), preserved_mirrors: preservedMirrors };
  });
}
