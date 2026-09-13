import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllowedReleasePath, assertSourceOnlyContents, isGeneratedReleasePath } from './source-policy.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifySourceRelease(directory) {
  const root = await realpath(directory);
  const manifestName = 'SOURCE_RELEASE_MANIFEST.json';
  const manifestStat = await lstat(join(root, manifestName));
  assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink(), 'Release manifest must be a regular file.');
  const manifest = JSON.parse(await readFile(join(root, manifestName), 'utf8'));
  assert.equal(manifest.distribution, 'source-only-alpha');
  assert.equal(manifest.external_snapshots_included, false);
  assert.equal(manifest.git_history_included, false);
  assert.equal(manifest.owner_hosting_config_included, false);
  assert.equal(manifest.initial_evidence_chunks, 0);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  assert.equal(sha(JSON.stringify(manifest.files, null, 2) + '\n'), manifest.content_sha256, 'Manifest file-list digest mismatch.');
  const expected = new Set([manifestName]);
  for (const file of manifest.files) {
    assert.equal(typeof file.path, 'string');
    assert.ok(!file.path.includes('\\') && !file.path.split('/').some(part => !part || part === '..' || part === '.'));
    assert.ok(!expected.has(file.path), 'Duplicate manifest path.');
    assertAllowedReleasePath(file.path);
    expected.add(file.path);
    const target = resolve(root, file.path);
    assert.ok(target.startsWith(root + sep), 'Manifest path escapes the release.');
    assert.ok((await lstat(target)).isFile() && !(await lstat(target)).isSymbolicLink(), 'Manifest inputs must be regular files.');
    assert.equal(await realpath(target), target, 'Manifest input redirected through a link.');
    const bytes = await readFile(target);
    assert.equal(bytes.length, file.bytes, `Release size changed: ${file.path}`);
    assert.equal(sha(bytes), file.sha256, `Release content changed: ${file.path}`);
  }
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const target = join(directory, item.name);
      const name = relative(root, target).split(sep).join('/');
      if (isGeneratedReleasePath(name)) continue;
      assert.ok(!item.isSymbolicLink(), 'Unreviewed symbolic link in release.');
      if (item.isDirectory()) await walk(target);
      else assert.ok(expected.has(name), `Unreviewed file in source release: ${name}`);
    }
  }
  await walk(root);
  await assertSourceOnlyContents(root, manifest.files.map(file => file.path));
  return { status: 'passed', files: manifest.files.length, contentSha256: manifest.content_sha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Run release:verify from a fresh source-release checkout.');
  console.log(JSON.stringify(await verifySourceRelease(resolve(dirname(fileURLToPath(import.meta.url)), '..')), null, 2));
}
