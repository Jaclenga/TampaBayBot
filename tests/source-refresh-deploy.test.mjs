import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { deployAppliedCandidate, verifyReviewedBuild } from '../scripts/build-source-refresh.mjs';
import { digest, json, makeCorpus, readCorpus } from '../src/lib/ingestion/generation.mjs';
import { applyRefresh, stageRefresh } from '../src/lib/ingestion/refresh.mjs';
import { refreshFixture } from '../src/lib/ingestion/refresh-fixtures.mjs';

async function appliedFixture(t) {
  const fixture = await refreshFixture(t);
  const staged = await stageRefresh(fixture.root, { fetchImpl: async () => new Response('<main><p>Updated synthetic guidance for a deployment fixture.</p></main>') });
  const artifact = `${staged.directory}/build-fixture/work/standalone/reviewed-source`;
  const files = [
    ['client/asset.js', 'export const fixture = true;\n'],
    ['server/index.js', 'export default { fetch() { return new Response("Synthetic fixture"); } };\n'],
    ['server/wrangler.json', json({ name: 'synthetic-review-fixture', main: 'index.js', assets: { directory: '../client' } })],
  ];
  for (const [path, value] of files) {
    await mkdir(dirname(join(fixture.root, artifact, path)), { recursive: true });
    await writeFile(join(fixture.root, artifact, path), value);
  }
  const artifactHash = digest(JSON.stringify(files.map(([path, value]) => [path, digest(value)])));
  await writeFile(join(fixture.root, artifact, 'verification.json'), json({ status: 'passed', artifact_sha256: artifactHash, artifact_file_count: files.length }));
  const receipt = await applyRefresh(fixture.root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Synthetic reviewer',
    validateAndBuild: async candidate => ({ status: 'passed', generation: candidate.corpus.generation,
      artifact, artifact_sha256: artifactHash, config: `${artifact}/server/wrangler.json` }) });
  return { ...fixture, staged, receipt, receiptPath: join(fixture.root, staged.directory, 'application.json') };
}

test('deployment refuses changed upload files, config paths, receipts, and obsolete generations before invoking a command', async t => {
  for (const change of ['asset', 'extra-file', 'config', 'receipt', 'generation']) {
    const { root, staged, receipt, receiptPath } = await appliedFixture(t);
    let commands = 0;
    if (change === 'asset') await writeFile(join(root, receipt.build.artifact, 'client/asset.js'), 'modified after smoke tests');
    if (change === 'extra-file') await writeFile(join(root, receipt.build.artifact, 'server/extra.js'), 'unverified extra module');
    if (change === 'config') {
      receipt.build.config = `${receipt.build.artifact}/verification.json`;
      await writeFile(receiptPath, json(receipt));
    }
    if (change === 'receipt') {
      receipt.candidate_sha256 = '0'.repeat(64);
      await writeFile(receiptPath, json(receipt));
    }
    if (change === 'generation') {
      const active = await readCorpus(root);
      await writeFile(join(root, 'data/corpus.json'), json(makeCorpus(active.sources.map(source => ({ ...source, status: 'unavailable' })), active.chunks)));
    }
    await assert.rejects(deployAppliedCandidate(root, { directory: staged.directory, approve: staged.candidate_sha256,
      deploy: async () => { commands++; return { status: 'command_succeeded' }; } }), /changed|config must belong|another reviewed candidate/);
    assert.equal(commands, 0, `${change} must stop before the external command`);
  }
});

test('deployment requires the original approval and verifies the artifact before any deployment attempt', async t => {
  const { root, staged, receipt, receiptPath } = await appliedFixture(t);
  const before = await readFile(receiptPath, 'utf8');
  await assert.rejects(deployAppliedCandidate(root, { directory: staged.directory, approve: '0'.repeat(64) }), /digest mismatch/);
  assert.equal(await readFile(receiptPath, 'utf8'), before);
  const verified = await verifyReviewedBuild(root, receipt);
  assert.equal(relative(root, verified.artifact).split(sep).join('/'), receipt.build.artifact);
  assert.equal(relative(root, verified.config).split(sep).join('/'), receipt.build.config);
});

test('source deploy CLI retries a failed command with the same reviewed build and records both outcomes', async t => {
  const { root, staged, receipt, receiptPath } = await appliedFixture(t);
  await mkdir(join(root, 'scripts'));
  for (const script of ['source-refresh.mjs', 'build-source-refresh.mjs']) await cp(resolve('scripts', script), join(root, 'scripts', script));
  await cp(resolve('src/lib/ingestion'), join(root, 'src/lib/ingestion'), { recursive: true });
  await cp(resolve('src/lib/csv.mjs'), join(root, 'src/lib/csv.mjs'));
  const command = join(root, 'fake-deploy.mjs');
  const failMarker = join(root, 'fail-next-deployment');
  const callLog = join(root, 'deployment-call.json');
  await writeFile(command, "import fs from 'node:fs';\nimport path from 'node:path';\nconst [marker, log, ...args] = process.argv.slice(2);\nfs.mkdirSync(path.join(path.dirname(args[0]), '.wrangler/tmp'), { recursive: true });\nfs.writeFileSync(log, JSON.stringify({ args, cwd: process.cwd(), logs: process.env.WRANGLER_LOG_PATH }));\nif (fs.existsSync(marker)) process.exit(13);\n");
  await writeFile(failMarker, 'synthetic failure');
  const literal = 'literal argument with spaces; $HOME $(not-a-command)';
  const env = { ...process.env, TAMPABAYBOT_SOURCE_DEPLOY_ARGV: JSON.stringify([process.execPath, command, failMarker, callLog, '{config}', '{artifact}', '{generation}', literal]) };
  const run = () => new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(root, 'scripts/source-refresh.mjs'), 'deploy', '--candidate', staged.directory, '--approve', staged.candidate_sha256],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', fail);
    child.once('exit', code => done({ code, output }));
  });
  const failed = await run();
  assert.equal(failed.code, 1, failed.output);
  const afterFailure = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(afterFailure.status, 'applied');
  assert.equal(afterFailure.deployment.status, 'failed', failed.output);
  assert.equal(afterFailure.deployment_attempts.length, 1);
  assert.equal((await readCorpus(root)).generation, receipt.generation);
  const firstCall = JSON.parse(await readFile(callLog, 'utf8'));
  assert.notEqual(firstCall.args[0], join(root, receipt.build.config));
  assert.equal(firstCall.cwd, join(root, afterFailure.deployment.execution_directory));
  assert.equal(firstCall.logs, join(firstCall.cwd, 'logs'));
  assert.ok((await readdir(join(dirname(firstCall.args[0]), '.wrangler'))).includes('tmp'));
  assert.ok(!(await readdir(join(root, receipt.build.artifact, 'server'))).includes('.wrangler'));
  await verifyReviewedBuild(root, receipt);
  await unlink(failMarker);
  const retried = await run();
  assert.equal(retried.code, 0, retried.output);
  const afterRetry = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(afterRetry.deployment.status, 'command_succeeded');
  assert.deepEqual(afterRetry.deployment_attempts.map(attempt => attempt.status), ['failed', 'command_succeeded']);
  assert.deepEqual(afterRetry.build, receipt.build);
  assert.equal((await readCorpus(root)).generation, receipt.generation);
  const secondCall = JSON.parse(await readFile(callLog, 'utf8'));
  const secondRoot = join(root, afterRetry.deployment.execution_directory);
  assert.notEqual(secondCall.args[0], firstCall.args[0]);
  assert.deepEqual(secondCall.args, [join(secondRoot, 'artifact/server/wrangler.json'), join(secondRoot, 'artifact'), receipt.generation, literal]);
  assert.equal(secondCall.cwd, secondRoot);
  assert.ok(!(await readdir(join(root, receipt.build.artifact, 'server'))).includes('.wrangler'));
  await verifyReviewedBuild(root, receipt);
});
