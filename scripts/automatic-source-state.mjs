import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { digest, json, readCorpus, validateCorpus, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { inspectCandidate } from '../src/lib/ingestion/refresh.mjs';
import { verifyReviewedBuild } from './build-source-refresh.mjs';

const MAX_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 20000;
function keyBytes(key) {
  assert.match(key ?? '', /^[a-f0-9]{64}$/i, 'SOURCE_STATE_KEY must be a 32-byte hexadecimal secret');
  return Buffer.from(key, 'hex');
}
function aad(context) {
  assert.match(context.repository ?? '', /^[\w.-]+\/[\w.-]+$/);
  assert.match(context.worker ?? '', /^[a-z][a-z0-9-]{2,62}$/);
  return Buffer.from(`tampabaybot-source-state:v1:${context.repository.toLowerCase()}:${context.worker}`);
}
function allowed(name, candidateDirectory) {
  if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) return false;
  if (name === 'data/corpus.json' || name === 'work/source-refresh/automatic-state.json') return true;
  if (/^data\/(raw|normalized)\/[a-z0-9-]+\/[a-f0-9-]+\.(html|pdf|csv|json)$/.test(name)) return true;
  if (/^data\/generations\/[a-f0-9]{64}\.json$/.test(name)) return true;
  if (!candidateDirectory || !name.startsWith(`${candidateDirectory}/`)) return false;
  const item = name.slice(candidateDirectory.length + 1);
  return ['manifest.json', 'report.json', 'corpus.json', 'application.json'].includes(item) ||
    /^payload\/data\/(raw|normalized)\/[a-z0-9-]+\/[a-f0-9-]+\.(html|pdf|csv|json)$/.test(item) ||
    /^artifact-[a-f0-9]{8}\/(?:server|client)\/[\w./@-]+$/.test(item) ||
    /^artifact-[a-f0-9]{8}\/(?:verification|artifact)\.json$/.test(item);
}
function candidatePath(state) {
  if (!state) return null;
  assert.match(state.directory ?? '', /^work\/source-refresh\/[a-zA-Z0-9-]+$/);
  return state.directory;
}

export function encryptState(archive, key, context) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), nonce);
  cipher.setAAD(aad(context));
  const plaintext = Buffer.from(json(archive));
  assert.ok(plaintext.length <= MAX_BYTES, 'Source state exceeds the size limit; retain a private backup and review retention');
  const ciphertext = Buffer.concat([cipher.update(gzipSync(plaintext)), cipher.final()]);
  return Buffer.concat([Buffer.from('TBBSTATE1'), nonce, cipher.getAuthTag(), ciphertext]);
}
export function decryptState(bytes, key, context) {
  assert.ok(bytes.length > 37 && bytes.length <= MAX_BYTES && bytes.subarray(0, 9).toString() === 'TBBSTATE1', 'Invalid encrypted source state');
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), bytes.subarray(9, 21));
    decipher.setAAD(aad(context));
    decipher.setAuthTag(bytes.subarray(21, 37));
    const compressed = Buffer.concat([decipher.update(bytes.subarray(37)), decipher.final()]);
    return JSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_BYTES }).toString('utf8'));
  } catch { throw new Error('Source-state authentication/decryption failed; do not replace it with an empty baseline'); }
}

export async function saveSourceState(root, { key, repository, worker, output } = {}) {
  const corpus = await readCorpus(root);
  // Existing production must never be replaced with a fresh source-only checkout.
  assert.ok(corpus.chunks.length, 'Seed the hosted workflow from the existing reviewed corpus; an empty baseline cannot be published');
  for (const source of corpus.sources.filter(source => source.raw_path)) {
    assert.ok(allowed(source.raw_path, null), 'Unexpected raw provenance path');
    assert.equal(digest(await readFile(await workspacePath(root, source.raw_path))), source.content_hash, 'Source-state raw provenance is missing or changed');
  }
  let state = null;
  try { state = JSON.parse(await readFile(await workspacePath(root, 'work/source-refresh/automatic-state.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state) {
    const candidateDirectory = candidatePath(state);
    try {
      const receipt = JSON.parse(await readFile(await workspacePath(root, `${candidateDirectory}/application.json`), 'utf8'));
      assert.equal(receipt.generation, corpus.generation, 'Application and active source state disagree');
      assert.equal(state.worker_name, worker, 'State targets another Worker');
      await inspectCandidate(root, state.directory, state.candidate_sha256);
      await verifyReviewedBuild(root, receipt);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = null;
    }
  }
  const directory = candidatePath(state);
  const files = [];
  let bytes = 0;
  async function visit(name) {
    const path = await workspacePath(root, name);
    let stat;
    try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    assert.ok(!stat.isSymbolicLink(), 'Source state cannot contain symbolic links');
    if (stat.isDirectory()) {
      for (const child of await readdir(path)) await visit(`${name}/${child}`);
    } else if (allowed(name, directory)) {
      assert.ok(stat.isFile() && stat.size <= MAX_BYTES);
      const content = await readFile(path);
      bytes += content.length;
      assert.ok(bytes <= MAX_BYTES / 2 && files.length < MAX_FILES, 'Source state exceeds retention limits');
      files.push({ path: name, sha256: digest(content), content: content.toString('base64') });
    }
  }
  for (const name of ['data/corpus.json', 'data/raw', 'data/normalized', 'data/generations', ...(state ? ['work/source-refresh/automatic-state.json'] : []), ...(directory ? [directory] : [])]) await visit(name);
  const archive = { schema_version: 1, created_at: new Date().toISOString(), generation: corpus.generation, candidate_directory: directory, files };
  const encrypted = encryptState(archive, key, { repository, worker });
  await writeAtomic(await workspacePath(root, output), encrypted);
  return { status: 'saved', generation: corpus.generation, files: files.length, encrypted_bytes: encrypted.length };
}

/** Authenticate and validate the entire manifest before any filesystem mutation. */
export async function restoreSourceState(root, { key, repository, worker, input } = {}) {
  const archive = decryptState(await readFile(await workspacePath(root, input)), key, { repository, worker });
  assert.equal(archive.schema_version, 1);
  assert.ok(Array.isArray(archive.files) && archive.files.length > 0 && archive.files.length <= MAX_FILES);
  if (archive.candidate_directory) candidatePath({ directory: archive.candidate_directory });
  const files = new Map();
  let size = 0;
  for (const file of archive.files) {
    assert.ok(allowed(file.path, archive.candidate_directory) && !files.has(file.path), 'Invalid/duplicate source-state path');
    assert.ok(typeof file.content === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(file.content));
    const bytes = Buffer.from(file.content, 'base64');
    size += bytes.length;
    assert.ok(size <= MAX_BYTES / 2);
    assert.equal(digest(bytes), file.sha256, 'Source-state file digest mismatch');
    await workspacePath(root, file.path);
    files.set(file.path, bytes);
  }
  assert.ok(files.has('data/corpus.json'), 'Source state has no corpus');
  const corpus = validateCorpus(JSON.parse(files.get('data/corpus.json').toString('utf8')));
  assert.equal(corpus.generation, archive.generation);
  assert.ok(corpus.chunks.length, 'A source-only baseline cannot replace the production corpus');
  let current;
  try { current = await readCorpus(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.ok(!current?.chunks.length || current.generation === corpus.generation, 'Restore only into a fresh checkout or the same active generation');
  for (const source of corpus.sources.filter(source => source.raw_path)) {
    assert.equal(digest(files.get(source.raw_path) ?? Buffer.alloc(0)), source.content_hash, 'Source-state raw provenance is missing or changed');
  }
  const stateBytes = files.get('work/source-refresh/automatic-state.json');
  if (stateBytes) {
    const state = JSON.parse(stateBytes);
    assert.equal(candidatePath(state), archive.candidate_directory);
    assert.equal(state.worker_name, worker, 'State targets another Worker');
  } else assert.equal(archive.candidate_directory, null);
  // Check collisions before writing, so restoration never silently overwrites
  // an operator's snapshots or a different pending application.
  for (const [name, content] of files) {
    if (name === 'data/corpus.json') continue;
    try { assert.equal(digest(await readFile(await workspacePath(root, name))), digest(content), 'Existing source-state file differs'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const [name, content] of files) if (name !== 'data/corpus.json') await writeAtomic(await workspacePath(root, name), content);
  await writeAtomic(await workspacePath(root, 'data/corpus.json'), files.get('data/corpus.json'));
  if (archive.candidate_directory) {
    const state = JSON.parse(stateBytes);
    const candidate = await inspectCandidate(root, state.directory, state.candidate_sha256);
    assert.equal(candidate.corpus.generation, corpus.generation, 'Pending artifact and corpus disagree');
    const receiptPath = await workspacePath(root, `${state.directory}/application.json`);
    try { await verifyReviewedBuild(root, JSON.parse(await readFile(receiptPath, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { status: 'restored', generation: corpus.generation, files: files.size };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { input: { type: 'string' }, output: { type: 'string' } } });
  const root = resolve(import.meta.dirname, '..');
  const context = { key: process.env.SOURCE_STATE_KEY, repository: process.env.GITHUB_REPOSITORY,
    worker: process.env.SOURCE_WORKER, input: values.input, output: values.output };
  if (positionals[0] === 'save' || positionals[0] === 'restore') {
    // CLI archive paths are restricted to ignored work/ outputs.
    const chosen = positionals[0] === 'save' ? context.output : context.input;
    assert.ok(typeof chosen === 'string' && chosen.startsWith('work/'));
    await mkdir(dirname(await workspacePath(root, chosen)), { recursive: true });
    console.log(json(await (positionals[0] === 'save' ? saveSourceState : restoreSourceState)(root, context)));
  } else throw new Error('Usage: automatic-source-state.mjs save --output work/...|restore --input work/...');
}
