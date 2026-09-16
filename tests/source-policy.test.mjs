import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSourceRelease } from '../scripts/package-release.mjs';
import { verifySourceRelease } from '../scripts/verify-source-release.mjs';
import { updateSourceManifest, renameWithRetry } from '../scripts/update-source-manifest.mjs';
import { GENERATED_ROOT_DIRECTORIES } from '../scripts/source-policy.mjs';

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(run) {
  const work = path.resolve('work');
  await mkdir(work, { recursive: true });
  const root = await mkdtemp(path.join(work, 'source-policy-'));
  try {
    for (const name of ['src', 'scripts', 'tests', 'vendor', 'data', 'evaluation/suite', 'evaluation/results', 'docs/images']) await mkdir(path.join(root, name), { recursive: true });
    await writeFile(path.join(root, 'data/sources.json'), json([{ source_id: 'fiction', source_updated_date: null, retrieval_date: null, status: 'unavailable' }]));
    await writeFile(path.join(root, 'evaluation/results/latest.json'), json({ metrics: {} }));
    await writeFile(path.join(root, 'src/example.mjs'), 'export const example = 1;\n');
    const result = await createSourceRelease({ root, output: 'work/releases/candidate' });
    await run(path.join(root, result.output), root);
  } finally {
    assert.ok(root.startsWith(work + path.sep));
    await rm(root, { recursive: true, force: true });
  }
}
// Deliberately recompute hashes as an incorrect packager could. Verification
// must still reject downloaded data rather than trust manifest declarations.
async function forgeEntry(root, name, value) {
  const bytes = Buffer.from(json(value));
  await mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await writeFile(path.join(root, name), bytes);
  const manifest = JSON.parse(await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8'));
  manifest.files = manifest.files.filter(file => file.path !== name);
  manifest.files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) });
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  manifest.content_sha256 = sha(json(manifest.files));
  await writeFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), json(manifest));
}
test('semantic verification rejects correctly hashed downloaded evidence, private files and archived documents', async () => {
  for (const [name, value, message] of [
    ['data/chunks.json', [{ text: 'external evidence sentinel' }], /Downloaded evidence/],
    ['evaluation/human-audit/responses.json', [{ question: 'resident input sentinel' }], /response packets/],
    ['data/raw/source/page.html', 'external bytes', /Forbidden distribution path/],
    ['.openai/hosting.json', { project_id: 'owner sentinel' }, /Forbidden distribution path/],
    ['docs/alpha-private-deployment.json', { project_id: 'owner sentinel' }, /Unreviewed documentation artifact/],
    ['docs/deployment.json', { account_id: 'owner sentinel' }, /Unreviewed documentation artifact/],
    ['Docs/Deployment.JSON', { account_id: 'owner sentinel' }, /Unreviewed documentation artifact/],
    ['docs/ALPHA_VERIFICATION.json', { status: 'historical' }, /Unreviewed documentation artifact/],
    ['docs/TAMPA_BAY_VERIFICATION.json', { status: 'historical' }, /Unreviewed documentation artifact/],
    ['docs/OLLAMA_TESTING.md', 'historical model report', /Archived document/],
    ['docs/BUG_FIX_FOLLOWUP_2026-09-12.md', 'historical runtime report', /Archived document/],
    ['docs/RISKS.md', 'consolidated warnings', /Archived document/],
    ['evaluation/results/latest.json', { status: 'passed', benchmark_count: 1 }, /Historical evaluation/],
  ]) await fixture(async root => {
    await forgeEntry(root, name, value);
    await assert.rejects(verifySourceRelease(root), message);
    const manifestBefore = await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8');
    await assert.rejects(updateSourceManifest(root), message);
    assert.equal(await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8'), manifestBefore);
  });
});
test('source PR command includes added source files and refuses populated registries', async () => {
  await fixture(async root => {
    await writeFile(path.join(root, 'src/new.mjs'), 'export const newFeature = true;\n');
    await writeFile(path.join(root, 'src/example.mjs'), 'export const example = 2;\n');
    const result = await updateSourceManifest(root);
    assert.deepEqual(result.changed, ['src/example.mjs', 'src/new.mjs']);
    assert.equal((await verifySourceRelease(root)).status, 'passed');
    const manifestBefore = await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8');
    await writeFile(path.join(root, 'data/sources.json'), json([{ source_id: 'fiction', status: 'available', retrieval_date: '2026-09-12' }]));
    await assert.rejects(updateSourceManifest(root), /Fetched source/);
    assert.equal(await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8'), manifestBefore);
  });
});
test('source verification requires the release manifest and atomic corpus envelope', async () => {
  await fixture(async root => {
    await rm(path.join(root, 'data/corpus.json'));
    await assert.rejects(updateSourceManifest(root), /Required source-only file missing/);
    await rm(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'));
    await assert.rejects(verifySourceRelease(root), { code: 'ENOENT' });
  });
});

test('not_run labels and zero headline counts cannot hide retained report data after rehashing', async () => {
  const attacks = [
    ['data/ingestion-report.json', report => { report.sources = [{ text: 'downloaded evidence sentinel' }]; }],
    ['data/verification-report.json', report => { report.responses = [{ question: 'resident input sentinel' }]; }],
    ['evaluation/results/latest.json', report => { report.responses = ['retained response sentinel']; }],
    ['evaluation/results/latest.json', report => { report.baseline_count = 8; }],
    ['evaluation/results/latest.json', report => { report.metrics.accuracy = { passed: 8, total: 10, rate: 0.8 }; }],
    ['evaluation/results/latest.json', report => { report.metrics.review = { score: 4, status: 'not_run', note: 'old human judgment' }; }],
    ['evaluation/results/latest.json', report => { report.failures = [{ text: 'historical response' }]; }],
    ['evaluation/suite/results/latest.json', report => { report.provenance = { excerpt: 'retained source excerpt' }; }],
    ['evaluation/suite/results/latest.json', report => { report.summary.checks.passed = 10; }],
    ['evaluation/suite/results/latest.json', report => { report.summary.suites.navigation.cases = 10; }],
    ['evaluation/suite/results/latest.json', report => { report.humanEvaluation = { status: 'not_run', responses: ['retained question'] }; }],
    ['evaluation/suite/results/latest.json', report => { report.automatedQuality = { score: 1 }; }],
    ['data/corpus.json', corpus => { corpus.rawEvidence = ['downloaded evidence sentinel']; }],
  ];
  for (const [name, attack] of attacks) await fixture(async root => {
    const value = JSON.parse(await readFile(path.join(root, name), 'utf8'));
    attack(value);
    await forgeEntry(root, name, value);
    await assert.rejects(verifySourceRelease(root), { code: 'ERR_ASSERTION' }, name);
    const manifestBefore = await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8');
    await assert.rejects(updateSourceManifest(root), { code: 'ERR_ASSERTION' }, name);
    assert.equal(await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8'), manifestBefore);
  });
});

test('source registry cannot retain generated statistics or remote failure text', async () => {
  for (const [key, value] of [['normalized_path', 'data/normalized/fiction/fixture.json'], ['record_count', 200], ['content_type', 'text/html'], ['last_error', 'Remote response contained private input']]) await fixture(async root => {
    const sources = JSON.parse(await readFile(path.join(root, 'data/sources.json'), 'utf8'));
    sources[0][key] = value;
    await forgeEntry(root, 'data/sources.json', sources);
    await assert.rejects(verifySourceRelease(root), /Retained snapshot provenance|Retained source failure details/);
  });
});

test('manifest preparation and verification tolerate tool output but never include it as release content', async () => {
  await fixture(async root => {
    const generated = [...GENERATED_ROOT_DIRECTORIES.map(name => `${name}/fixture-output.json`), 'next-env.d.ts', 'tsconfig.tsbuildinfo', 'src/cache.tsbuildinfo'];
    for (const name of generated) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), 'local generated output sentinel');
    }
    const result = await updateSourceManifest(root);
    assert.deepEqual(result.changed, []);
    assert.equal((await verifySourceRelease(root)).status, 'passed');
    for (const name of generated) {
      await forgeEntry(root, name, 'generated output must not become payload');
      await assert.rejects(verifySourceRelease(root), /Generated output cannot enter distribution/);
      // Rebuilding the manifest removes the forged generated path again.
      await updateSourceManifest(root);
    }
    for (const name of ['.env.local', '.openai/hosting.json', 'data/raw/candidate.json']) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), 'private inputs are never generated-output exclusions');
      await assert.rejects(updateSourceManifest(root), /Private or external artifact|Forbidden distribution path/);
      await assert.rejects(verifySourceRelease(root), /Unreviewed file/);
      await rm(path.join(root, name));
    }
  });
});

test('manifest preparation normalizes supported text to LF while preserving binary assets exactly', async () => {
  await fixture(async root => {
    await writeFile(path.join(root, 'src/example.mjs'), 'export const example = 2;\r\n');
    await writeFile(path.join(root, 'README.md'), '# Windows edit\r\n\r\nOriginal project documentation.\r\n');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await mkdir(path.join(root, 'docs/images'), { recursive: true });
    await writeFile(path.join(root, 'docs/images/demo.png'), png);
    await updateSourceManifest(root);
    assert.equal(await readFile(path.join(root, 'src/example.mjs'), 'utf8'), 'export const example = 2;\n');
    assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), '# Windows edit\n\nOriginal project documentation.\n');
    assert.deepEqual(await readFile(path.join(root, 'docs/images/demo.png')), png);
    assert.equal((await verifySourceRelease(root)).status, 'passed');
    const before = await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8');
    assert.deepEqual((await updateSourceManifest(root)).changed, []);
    assert.equal(await readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8'), before);
  });
});

test('atomic manifest renames retry transient file locks within a fixed budget and surface terminal failures', async () => {
  const attempts = []; const delays = [];
  await renameWithRetry('prepared.tmp', 'SOURCE_RELEASE_MANIFEST.json', { renameFile: async (from, to) => {
    attempts.push([from, to]);
    if (attempts.length <= 3) throw Object.assign(new Error('Temporary file lock'), { code: ['EPERM', 'EBUSY', 'EACCES'][attempts.length - 1] });
  }, wait: async milliseconds => delays.push(milliseconds) });
  assert.deepEqual(delays, [25, 50, 75]);
  assert.deepEqual(attempts, Array.from({ length: 4 }, () => ['prepared.tmp', 'SOURCE_RELEASE_MANIFEST.json']));
  for (const [code, expectedCalls] of [['EPERM', 5], ['ENOENT', 1]]) {
    let calls = 0;
    await assert.rejects(renameWithRetry('prepared.tmp', 'SOURCE_RELEASE_MANIFEST.json', { renameFile: async () => { calls++; throw Object.assign(new Error('Rename failed'), { code }); }, wait: async () => {} }), { code });
    assert.equal(calls, expectedCalls);
  }
});
