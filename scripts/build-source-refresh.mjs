import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, json, readCorpus, withPublicationLock, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { inspectCandidate, verifyPreservedSources } from '../src/lib/ingestion/refresh.mjs';

function run(executable, args, { cwd, env = process.env } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true, shell: false });
    const timer = setTimeout(() => { child.kill(); fail(new Error('Source refresh validation exceeded 15 minutes')); }, 15 * 60 * 1000);
    child.once('error', error => { clearTimeout(timer); fail(error); });
    child.once('exit', code => { clearTimeout(timer); if (code === 0) done(); else fail(new Error(`Source refresh validation exited ${code}`)); });
  });
}

export async function buildReviewedCandidate(root, candidate, { workerName = 'tampabaybot-reviewed-source' } = {}) {
  assert.match(workerName, /^[a-z][a-z0-9-]{2,62}$/);
  assert.ok(process.env.npm_execpath, 'Run application through npm run source:apply to select the installed npm CLI');
  const fixture = await workspacePath(candidate.candidateRoot, `build-${randomUUID().slice(0, 8)}`);
  await mkdir(fixture);
  for (const name of ['src', 'scripts', 'tests', 'evaluation', 'vendor', 'public']) {
    await cp(join(root, name), join(fixture, name), { recursive: true, filter: source => !relative(root, source).split(sep).some(part => part.startsWith('.')) });
  }
  for (const name of ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'vite.config.ts', 'eslint.config.mjs', 'postcss.config.mjs', 'playwright.config.ts']) {
    await cp(join(root, name), join(fixture, name));
  }
  await mkdir(join(fixture, 'data'));
  for (const item of await readdir(join(root, 'data'), { withFileTypes: true })) {
    if (item.isFile() && item.name.endsWith('.json') && !['sources.json', 'chunks.json', 'corpus.json'].includes(item.name)) await cp(join(root, 'data', item.name), join(fixture, 'data', item.name));
  }
  await writeAtomic(join(fixture, 'data/corpus.json'), json(candidate.corpus));
  await writeAtomic(join(fixture, 'data/sources.json'), json(candidate.corpus.sources));
  await writeAtomic(join(fixture, 'data/chunks.json'), json(candidate.corpus.chunks));
  const payload = new Set(candidate.manifest.payload.map(file => file.path));
  for (const source of candidate.corpus.sources.filter(source => source.raw_path)) {
    const input = payload.has(source.raw_path)
      ? await workspacePath(candidate.candidateRoot, `payload/${source.raw_path}`) : await workspacePath(root, source.raw_path);
    const destination = await workspacePath(fixture, source.raw_path);
    await mkdir(dirname(destination), { recursive: true }); await cp(input, destination);
  }
  const env = { ...process.env, TAMPABAYBOT_STANDALONE: '1', LLM_PROVIDER: 'none', WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' };
  for (const name of Object.keys(env)) if (/^(?:LLM_|CLOUDFLARE_|CF_|NEXT_PUBLIC_|VITE_)/.test(name)) delete env[name];
  env.LLM_PROVIDER = 'none';
  const options = { cwd: fixture, env };
  const provenance = await verifyPreservedSources(fixture, undefined, { allowEmpty: true });
  await writeAtomic(join(fixture, 'data/verification-report.json'), json(provenance));
  assert.equal(provenance.status, 'passed', 'Candidate evidence must reproduce exactly from its preserved raw snapshots');
  await run(process.execPath, [process.env.npm_execpath, 'ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], options);
  await run(process.execPath, [process.env.npm_execpath, 'run', 'test:source'], options);
  await run(process.execPath, [join(fixture, 'node_modules/typescript/bin/tsc'), '--noEmit'], options);
  const output = 'work/standalone/reviewed-source';
  await run(process.execPath, [join(fixture, 'scripts/build-standalone.mjs'), '--name', workerName, '--outdir', output], options);
  await run(process.execPath, [join(fixture, 'scripts/test-standalone.mjs'), '--directory', output], options);
  const artifact = relative(root, resolve(fixture, output)).split(sep).join('/');
  const verification = JSON.parse(await readFile(resolve(fixture, output, 'verification.json'), 'utf8'));
  assert.equal(verification.status, 'passed', 'Standalone verification did not pass');
  return { status: 'passed', generation: candidate.corpus.generation, artifact,
    artifact_sha256: verification.artifact_sha256, config: `${artifact}/server/wrangler.json`,
    source_provenance: 'passed', source_tests: 'passed', typecheck: 'passed', standalone_smoke: verification.status };
}

/** Recheck every upload byte; an edited config or asset invalidates the smoke-tested build. */
export async function verifyReviewedBuild(root, receipt) {
  assert.equal(receipt.build?.status, 'passed', 'Deployment requires a successful reviewed build');
  assert.equal(receipt.build.generation, receipt.generation, 'Build used another corpus generation');
  assert.match(receipt.build.artifact_sha256 ?? '', /^[a-f0-9]{64}$/, 'Build has no verified artifact digest');
  const artifact = await workspacePath(root, receipt.build.artifact);
  const config = await workspacePath(root, receipt.build.config);
  assert.equal(config, join(artifact, 'server/wrangler.json'), 'Deployment config must belong to the reviewed artifact');
  const verification = JSON.parse(await readFile(await workspacePath(artifact, 'verification.json'), 'utf8'));
  assert.equal(verification.status, 'passed', 'Standalone verification did not pass');
  assert.equal(verification.artifact_sha256, receipt.build.artifact_sha256, 'Standalone verification and receipt disagree');
  const files = [];
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(!entry.name.startsWith('.') && !entry.isSymbolicLink(), 'Reviewed artifacts cannot contain hidden files or links');
      const path = await workspacePath(artifact, relative(artifact, join(directory, entry.name)));
      if (entry.isDirectory()) await inspect(path);
      else {
        assert.ok(entry.isFile(), 'Reviewed artifact entries must be ordinary files');
        files.push([relative(artifact, path).split(sep).join('/'), digest(await readFile(path))]);
      }
    }
  }
  await inspect(await workspacePath(artifact, 'server'));
  await inspect(await workspacePath(artifact, 'client'));
  assert.equal(digest(JSON.stringify(files.sort((a, b) => a[0].localeCompare(b[0])))), receipt.build.artifact_sha256, 'Reviewed artifact changed after verification; build and verify again');
  assert.equal(files.length, verification.artifact_file_count, 'Reviewed artifact file count changed');
  return { artifact, config };
}

/** No shell interpretation. Deployment is opt-in and the operator supplies the executable/arguments. */
export async function deployReviewedBuild(root, receipt) {
  assert.ok(process.env.TAMPABAYBOT_SOURCE_DEPLOY_ARGV, 'Set TAMPABAYBOT_SOURCE_DEPLOY_ARGV to a JSON executable/argument array before using --deploy');
  const args = JSON.parse(process.env.TAMPABAYBOT_SOURCE_DEPLOY_ARGV);
  assert.ok(Array.isArray(args) && args.length > 0 && args.every(value => typeof value === 'string' && value.length), 'Deployment command must be a nonempty string array');
  const reviewed = await verifyReviewedBuild(root, receipt);
  // Wrangler writes .wrangler/tmp beside its config, including when deploy fails.
  // Give each attempt its own unchanged upload copy so the reviewed artifact stays reusable.
  const attemptDirectory = `work/source-deploy/${receipt.generation}-${randomUUID()}`;
  const executionRoot = await workspacePath(root, attemptDirectory);
  const copyPath = `${attemptDirectory}/artifact`;
  const copy = await workspacePath(root, copyPath);
  await mkdir(copy, { recursive: true });
  for (const name of ['server', 'client', 'verification.json']) {
    await cp(await workspacePath(reviewed.artifact, name), join(copy, name), { recursive: true });
  }
  const { config, artifact } = await verifyReviewedBuild(root, { ...receipt, build: {
    ...receipt.build, artifact: copyPath, config: `${copyPath}/server/wrangler.json`,
  } });
  const expanded = args.map(value => value.replaceAll('{config}', config).replaceAll('{artifact}', artifact).replaceAll('{generation}', receipt.generation));
  try {
    await run(expanded[0], expanded.slice(1), { cwd: executionRoot, env: { ...process.env,
      WRANGLER_LOG_PATH: join(executionRoot, 'logs'), MINIFLARE_REGISTRY_PATH: join(executionRoot, 'registry'), WRANGLER_SEND_METRICS: 'false',
    } });
  } catch (error) {
    error.deployment_directory = attemptDirectory;
    throw error;
  }
  return { status: 'command_succeeded', generation: receipt.generation, completed_at: new Date().toISOString(), execution_directory: attemptDirectory,
    note: 'Operator deployment command completed from a verified per-attempt copy; hosted behavior requires the operator smoke check.' };
}

/** Retry the same applied build without replaying acquisition or overwriting active sources. */
export async function deployAppliedCandidate(root, { directory, approve, deploy = deployReviewedBuild } = {}) {
  assert.match(approve ?? '', /^[a-f0-9]{64}$/, 'Pass the reviewed candidate SHA-256 with --approve');
  return withPublicationLock(root, async () => {
    const candidate = await inspectCandidate(root, directory, approve);
    const filename = await workspacePath(candidate.candidateRoot, 'application.json');
    const receipt = JSON.parse(await readFile(filename, 'utf8'));
    assert.equal(receipt.status, 'applied', 'Candidate has not been applied');
    assert.equal(receipt.candidate_sha256, approve, 'Application receipt names another reviewed candidate');
    assert.equal(receipt.generation, candidate.corpus.generation, 'Application receipt names another corpus generation');
    assert.equal((await readCorpus(root)).generation, receipt.generation, 'Active corpus changed since application; deploy the current reviewed generation');
    const artifact = await workspacePath(root, receipt.build?.artifact);
    assert.ok(artifact.startsWith(`${candidate.candidateRoot}${sep}`), 'Build must stay below its reviewed candidate');
    await verifyReviewedBuild(root, receipt);
    const attempt = { status: 'running', generation: receipt.generation, started_at: new Date().toISOString() };
    receipt.deployment_attempts ??= [];
    receipt.deployment_attempts.push(attempt);
    receipt.deployment = attempt;
    await writeAtomic(filename, json(receipt));
    try {
      Object.assign(attempt, await deploy(root, receipt));
      assert.equal(attempt.status, 'command_succeeded', 'Deployment command did not complete successfully');
    } catch (error) {
      Object.assign(attempt, { status: 'failed', completed_at: new Date().toISOString(), note: 'The reviewed local corpus remains applied. Retry source:deploy or roll back explicitly; inspect the hosting provider if a command timed out.' });
      if (error.deployment_directory) attempt.execution_directory = error.deployment_directory;
      await writeAtomic(filename, json(receipt));
      throw error;
    }
    await writeAtomic(filename, json(receipt));
    return receipt;
  });
}
