/** Refresh a source PR's manifest without sanitizing away or hiding unsafe inputs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSourceOnlyContents, isGeneratedReleasePath, isReleaseTextPath } from './source-policy.mjs';

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Windows indexers can briefly hold a completed output open. Retry the same
// atomic rename; never unlink the prior file or fall back to a partial copy.
export async function renameWithRetry(from, to, { renameFile = rename, wait = milliseconds => new Promise(done => setTimeout(done, milliseconds)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { await renameFile(from, to); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 4) throw error;
      await wait(25 * (attempt + 1));
    }
  }
}

export async function updateSourceManifest(directory) {
  const root = await realpath(directory);
  const manifestPath = join(root, 'SOURCE_RELEASE_MANIFEST.json');
  assert.ok(!(await lstat(manifestPath)).isSymbolicLink(), 'Manifest must not redirect writes');
  const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(previous.distribution, 'source-only-alpha', 'Use release:source to prepare a development checkout');
  const names = [];
  async function walk(relative = '') {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (name === 'SOURCE_RELEASE_MANIFEST.json' || isGeneratedReleasePath(name)) continue;
      assert.ok(!entry.isSymbolicLink(), `Source input must not be a link: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else { assert.ok(entry.isFile(), `Source input must be a regular file: ${name}`); names.push(name); }
    }
  }
  await walk();
  // Inspect actual data before updating hashes. Fetched data is never approved by rehashing.
  await assertSourceOnlyContents(root, names);
  const files = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const filename = join(root, name);
    let bytes = await readFile(filename);
    if (isReleaseTextPath(name)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const normalized = Buffer.from(text.replace(/\r\n?/g, '\n'));
      if (!bytes.equals(normalized)) {
        assert.equal(await realpath(filename), filename, `Source input redirected before normalization: ${name}`);
        const temporary = `${filename}.${process.pid}.lf.tmp`;
        await writeFile(temporary, normalized, { flag: 'wx' });
        await renameWithRetry(temporary, filename);
        bytes = normalized;
      }
    }
    files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
  }
  const manifest = { ...previous, files, content_sha256: digest(json(files)) };
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(temporary, json(manifest), { flag: 'wx' });
  await renameWithRetry(temporary, manifestPath);
  const before = new Map(previous.files.map(file => [file.path, file.sha256]));
  const current = new Set(files.map(file => file.path));
  return { files: files.length, changed: files.filter(file => before.get(file.path) !== file.sha256).map(file => file.path), removed: [...before.keys()].filter(name => !current.has(name)), content_sha256: manifest.content_sha256 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Run npm run release:manifest from the public source checkout');
  console.log(JSON.stringify(await updateSourceManifest(resolve(dirname(fileURLToPath(import.meta.url)), '..')), null, 2));
}
