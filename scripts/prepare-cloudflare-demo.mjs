/** Prepare a Cloudflare demo upload without changing the reviewed build or deploying. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inspectCandidate } from '../src/lib/ingestion/refresh.mjs';
import { assertReviewedBuild, makeCloudflareDemoConfig } from './cloudflare-demo-config.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'npm run prepare:cloudflare-demo -- --artifact work/standalone/<verified-artifact> --candidate work/source-refresh/<applied-candidate> --database-id <D1-UUID> [--database-name tampabaybot-demo-ops] [--name tampabaybot-demo-api]';
const { values } = parseArgs({ options: {
  artifact: { type: 'string' },
  candidate: { type: 'string' },
  'database-id': { type: 'string' },
  'database-name': { type: 'string' },
  name: { type: 'string' },
  help: { type: 'boolean' },
}, strict: true, allowPositionals: false });
if (values.help) { console.log(usage); process.exit(0); }
assert.ok(values.artifact && values.candidate && values['database-id'], usage);

const work = await realpath(join(project, 'work'));
assert.equal(work, join(await realpath(project), 'work'), 'work/ must be an ordinary project directory.');
const artifact = await realpath(resolve(project, values.artifact));
assert.ok(artifact.startsWith(`${join(work, 'standalone')}${sep}`), 'Use a verified work/standalone artifact.');
const manifest = JSON.parse(await readFile(join(artifact, 'artifact.json'), 'utf8'));
const verification = JSON.parse(await readFile(join(artifact, 'verification.json'), 'utf8'));
assert.equal(manifest.build_mode, 'isolated-standalone');
assert.equal(verification.status, 'passed', 'Run test:standalone before preparing the demo.');
assert.ok(verification.corpus?.chunks > 0, 'The artifact has no reviewed evidence passages. Acquire and review a corpus before preparing a public cited demo.');
assert.match(verification.corpus?.generation ?? '', /^[a-f\d]{64}$/i, 'Verification must record the reviewed corpus generation.');
const candidate = await inspectCandidate(project, values.candidate);
const receiptFile = join(candidate.candidateRoot, 'application.json');
const receiptStat = await lstat(receiptFile);
assert.ok(receiptStat.isFile() && !receiptStat.isSymbolicLink(), 'The application receipt must be an ordinary file.');
const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
assertReviewedBuild(verification, receipt, candidate);

const files = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.ok(!entry.name.startsWith('.') && !entry.isSymbolicLink(), 'Upload files cannot be hidden files or links.');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else {
      assert.ok(entry.isFile(), 'Upload paths must be ordinary files.');
      files.push([relative(artifact, path).split(sep).join('/'), createHash('sha256').update(await readFile(path)).digest('hex')]);
    }
  }
}
await inspect(join(artifact, 'server'));
await inspect(join(artifact, 'client'));
const digest = createHash('sha256').update(JSON.stringify(files.sort((a, b) => a[0].localeCompare(b[0])))).digest('hex');
assert.equal(digest, verification.artifact_sha256, 'Verified artifact changed; rebuild and retest it.');
const sourceConfig = JSON.parse(await readFile(join(artifact, 'server/wrangler.json'), 'utf8'));
const config = makeCloudflareDemoConfig(sourceConfig, {
  databaseId: values['database-id'],
  databaseName: values['database-name'] ?? 'tampabaybot-demo-ops',
  name: values.name ?? 'tampabaybot-demo-api',
});

const parent = join(work, 'cloudflare-demo');
await mkdir(parent, { recursive: true });
assert.equal(await realpath(parent), parent, 'Demo output root must not be redirected through a link.');
const output = join(parent, `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(output);
assert.ok((await lstat(output)).isDirectory());
await cp(join(artifact, 'server'), join(output, 'server'), { recursive: true });
await cp(join(artifact, 'client'), join(output, 'client'), { recursive: true });
await writeFile(join(output, 'server/wrangler.json'), `${JSON.stringify(config, null, 2)}\n`);
await writeFile(join(output, 'deployment.json'), `${JSON.stringify({
  schema_version: 1,
  created_at: new Date().toISOString(),
  source_artifact_sha256: digest,
  corpus_chunks: verification.corpus.chunks,
  corpus_sources: verification.corpus.sources,
  corpus_generation: verification.corpus.generation,
  reviewed_candidate_sha256: receipt.candidate_sha256,
  worker_name: config.name,
  status: 'prepared_not_deployed',
}, null, 2)}\n`);
const path = relative(project, output).split(sep).join('/');
console.log(`Prepared backend: ${path}`);
console.log(`Dry-run: npx wrangler deploy --dry-run --config ${path}/server/wrangler.json`);
console.log('Configure server-side limit and monitor secrets before exposing the Pages demo.');
console.log(`Deploy after review: npx wrangler deploy --config ${path}/server/wrangler.json`);
