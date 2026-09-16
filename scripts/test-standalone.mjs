/** Verify the exact standalone Wrangler artifact without login or deployment. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'npm run test:standalone -- --directory work/standalone/<artifact-directory>';
const { values } = parseArgs({ options: { directory: { type: 'string' }, help: { type: 'boolean' } }, strict: true });
if (values.help) { console.log(usage); process.exit(0); }
assert.ok(values.directory, usage);
const artifact = await realpath(resolve(project, values.directory));
const artifactRoot = resolve(await realpath(project), 'work/standalone');
assert.ok(artifact.startsWith(`${artifactRoot}${sep}`), 'Test an artifact below this checkout\'s work/standalone/.');
const manifest = JSON.parse(await readFile(join(artifact, 'artifact.json'), 'utf8'));
assert.equal(manifest.build_mode, 'isolated-standalone');
const config = JSON.parse(await readFile(join(artifact, 'server/wrangler.json'), 'utf8'));
assert.deepEqual(config.vars, { LLM_PROVIDER: 'none' }, 'This no-inference smoke test requires the original provider-none config.');
assert.equal(config.main, 'index.js');
assert.equal(config.assets.directory, '../client');
assert.equal(config.account_id, undefined);
assert.equal(config.routes, undefined);
assert.equal(config.d1_databases, undefined);
assert.equal(config.r2_buckets, undefined);
assert.equal(config.observability.enabled, false);
const state = await mkdtemp(join(project, 'work/standalone-check-'));
const runtimeArtifact = join(state, 'artifact');
const configPath = join(runtimeArtifact, 'server/wrangler.json');
await mkdir(join(state, 'state'));
await writeFile(join(state, 'empty.env'), '');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_LOG_PATH: join(state, 'logs'), MINIFLARE_REGISTRY_PATH: join(state, 'registry'), CI: 'true' };
for (const key of Object.keys(env)) if (/^(LLM_|CLOUDFLARE_|CF_)/.test(key)) delete env[key];
const wrangler = join(project, 'node_modules/wrangler/bin/wrangler.js');
const report = {
  schema_version: 1, observed_at: new Date().toISOString(), status: 'running',
  scope: 'Independent artifact: real Wrangler deploy --dry-run and local production Worker HTTP from an unchanged copy of the compiled modules/config/assets. Tool state stays outside the original artifact. No account login or external deployment. No browser or throughput certification.',
  artifact: relative(project, artifact).split(sep).join('/'),
  package_version: manifest.package_version, worker_name: config.name,
  compatibility_date: config.compatibility_date,
  wrangler: JSON.parse(await readFile(join(project, 'node_modules/wrangler/package.json'), 'utf8')).version,
  platform: process.platform, node: process.version, checks: [],
  known_limit: 'The local Miniflare static-assets route can lose a following connection after an abandoned upload; see docs/RELEASE_READINESS.md#remaining-review-and-operational-work. Browser verification tests the compiled Worker directly for that boundary.',
};
let worker;
let log = '';
const common = ['--config', configPath, '--env-file', join(state, 'empty.env')];
function start(args) {
  const child = spawn(process.execPath, [wrangler, ...args, ...common], { cwd: state, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log = (log + chunk.toString()).slice(-80000); });
  return child;
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise(resolveStop => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', resolveStop); killer.once('exit', resolveStop);
    });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
}
async function run(args) {
  const child = start(args);
  try {
    await new Promise((resolveRun, rejectRun) => {
      const timer = setTimeout(() => { rejectRun(new Error('Wrangler dry-run exceeded 90 seconds.')); }, 90000);
      child.once('error', error => { clearTimeout(timer); rejectRun(error); });
      child.once('exit', code => {
        clearTimeout(timer);
        if (code === 0) resolveRun();
        else rejectRun(new Error(`Wrangler exited ${code}.`));
      });
    });
  } finally { await stop(child); }
}
async function check(name, callback) {
  await callback(); report.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
}
try {
  await check('artifact_has_no_owner_identity_or_environment_files', async () => {
    const files = [];
    async function inspect(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        assert.ok(!entry.name.startsWith('.') && !entry.isSymbolicLink(), 'Artifact must not include hidden files or links.');
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await inspect(path);
        else {
          const bytes = await readFile(path);
          files.push([relative(artifact, path).split(sep).join('/'), createHash('sha256').update(bytes).digest('hex')]);
          if (/\.(m?js|json|css|html)$/.test(entry.name)) {
            assert.doesNotMatch(bytes.toString('utf8'), /appgprj_[a-f0-9]{20,}|[A-Za-z]:[\\/]Users[\\/]|\/Users\/[^/]+\/|\/home\/[^/]+\//, 'Artifact must not include Sites project identity or machine-specific home paths.');
          }
        }
      }
    }
    await inspect(join(artifact, 'server'));
    await inspect(join(artifact, 'client'));
    report.artifact_file_count = files.length;
    report.artifact_sha256 = createHash('sha256').update(JSON.stringify(files.sort((a, b) => a[0].localeCompare(b[0])))).digest('hex');
    await mkdir(runtimeArtifact);
    // Wrangler creates .wrangler/tmp beside its config even with --persist-to.
    // Execute unchanged copies so repeated verification leaves upload files clean.
    await cp(join(artifact, 'server'), join(runtimeArtifact, 'server'), { recursive: true });
    await cp(join(artifact, 'client'), join(runtimeArtifact, 'client'), { recursive: true });
  });
  await check('wrangler_deploy_dry_run', () => run(['deploy', '--dry-run', '--outdir', join(state, 'upload')]));
  const port = await new Promise((resolvePort, rejectPort) => {
    const socket = createServer(); socket.once('error', rejectPort);
    socket.listen(0, '127.0.0.1', () => { const value = socket.address().port; socket.close(error => error ? rejectPort(error) : resolvePort(value)); });
  });
  worker = start(['dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--persist-to', join(state, 'state'), '--show-interactive-dev-session=false']);
  let workerError;
  worker.once('error', error => { workerError = error; });
  const base = `http://127.0.0.1:${port}`;
  let health;
  await check('production_worker_health', async () => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (workerError) throw workerError;
      assert.equal(worker.exitCode, null, 'Worker exited before becoming ready.');
      try {
        const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) { health = await response.json(); break; }
        await response.body?.cancel();
      } catch { /* Allow the local runtime to finish starting. */ }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
    }
    assert.ok(health, 'Worker did not become ready in 90 seconds.');
    assert.equal(health.status, health.chunks ? 'degraded' : 'no_evidence');
    assert.equal(health.ready, false, 'An independent artifact without shared production controls is not ready for public traffic.');
    assert.equal(health.operations.reason, 'shared_controls_not_configured');
    assert.equal(health.corpus.chunks, health.chunks);
    assert.equal(health.version, manifest.package_version);
    report.corpus = { sources: health.sources, chunks: health.chunks };
  });
  let html;
  await check('production_html_and_security_headers', async () => {
    const response = await fetch(base, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); html = await response.text();
    assert.match(html, /TampaBayBot/i);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /'nonce-[^']+'/); assert.match(csp, /frame-ancestors 'self'/);
    assert.doesNotMatch(csp.split(';').find(value => value.trim().startsWith('script-src ')), /unsafe-inline/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
  await check('compiled_browser_asset', async () => {
    const match = html.match(/(?:src|href)="(\/assets\/[^"\s]+\.js)"/);
    assert.ok(match, 'HTML must reference the compiled client.');
    const response = await fetch(`${base}${match[1]}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); assert.ok((await response.text()).length > 100);
  });
  await check('public_sources_endpoint', async () => {
    const response = await fetch(`${base}/api/sources`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); assert.equal((await response.json()).length, health.sources);
  });
  await check('actual_question_api_without_model', async () => {
    const response = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Where can I find help paying for housing?', jurisdictionId: 'tampa' }), signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); const answer = await response.json();
    assert.equal(answer.generation.status, 'disabled'); assert.equal(answer.generation.mode, 'extractive');
    if (health.chunks === 0) assert.ok(['insufficient_evidence', 'unavailable_source'].includes(answer.status), 'An empty corpus must return a conservative unavailable-evidence state.');
    else assert.equal(answer.status, 'answered');
    report.answer_status = answer.status;
  });
  await check('sensitive_input_blocked', async () => {
    const response = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Help with housing, SSN 123-45-6789' }), signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 422); const body = await response.text();
    assert.equal(JSON.parse(body).code, 'sensitive_input'); assert.ok(!body.includes('123-45-6789'));
  });
  await check('environment_and_image_routes_unavailable', async () => {
    for (const route of ['/.env', '/_next/image?url=https://invalid.example/image&w=100&q=75']) {
      const response = await fetch(`${base}${route}`, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 404); await response.body?.cancel();
    }
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.message).replaceAll(project, '[checkout]').replaceAll(state, '[test-state]');
  console.error(report.failure); process.exitCode = 1;
} finally {
  await stop(worker);
  await writeFile(join(state, 'wrangler.log'), log);
  await writeFile(join(artifact, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Standalone verification: ${report.status}; ${report.checks.length} checks. Report: ${relative(project, join(artifact, 'verification.json')).split(sep).join('/')}`);
}
