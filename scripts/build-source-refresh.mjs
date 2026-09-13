import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { json, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { verifyPreservedSources } from '../src/lib/ingestion/refresh.mjs';

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

/** No shell interpretation. Deployment is opt-in and the operator supplies the executable/arguments. */
export async function deployReviewedBuild(root, receipt) {
  assert.ok(process.env.TAMPABAYBOT_SOURCE_DEPLOY_ARGV, 'Set TAMPABAYBOT_SOURCE_DEPLOY_ARGV to a JSON executable/argument array before using --deploy');
  const args = JSON.parse(process.env.TAMPABAYBOT_SOURCE_DEPLOY_ARGV);
  assert.ok(Array.isArray(args) && args.length > 0 && args.every(value => typeof value === 'string' && value.length), 'Deployment command must be a nonempty string array');
  const config = await workspacePath(root, receipt.build.config);
  const artifact = await workspacePath(root, receipt.build.artifact);
  const expanded = args.map(value => value.replaceAll('{config}', config).replaceAll('{artifact}', artifact).replaceAll('{generation}', receipt.generation));
  await run(expanded[0], expanded.slice(1), { cwd: root });
  return { status: 'command_succeeded', generation: receipt.generation, completed_at: new Date().toISOString(), note: 'Operator deployment command completed; hosted behavior requires the operator smoke check.' };
}
