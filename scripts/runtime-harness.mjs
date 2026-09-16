/** Isolated local Worker fixtures shared by the synthetic and real-model checks. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';

export async function createRuntimeFixture(project, prefix) {
  await access(join(project, 'src/lib/llm/index.mjs'));
  await access(join(project, 'src/lib/runtime-env.mjs'));
  const actualProject = await realpath(project);
  const workRoot = join(actualProject, 'work');
  await mkdir(workRoot, { recursive: true });
  const actualWork = await realpath(workRoot);
  assert.equal(relative(workRoot, actualWork), '', 'The fixture work root must not be redirected through a link.');
  const actual = await realpath(await mkdtemp(join(actualWork, prefix)));
  assert.ok(actual.startsWith(`${actualWork}${sep}`), 'Generated fixture must remain inside workspace work/.');
  // Vite supports standalone fixtures without Sites metadata. Never copy the
  // project's hosting configuration or environment files into a runtime check.
  for (const name of ['src', 'scripts', 'public', 'evaluation', 'vendor']) {
    await cp(join(actualProject, name), join(actual, name), { recursive: true });
  }
  await mkdir(join(actual, 'data'));
  for (const entry of await readdir(join(actualProject, 'data'), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) await cp(join(actualProject, 'data', entry.name), join(actual, 'data', entry.name));
  }
  for (const name of ['package.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(actualProject, name), join(actual, name));
  const config = await readFile(join(actual, 'vite.config.ts'), 'utf8');
  assert.match(config, /return\s*\{\s*\n\s*server:/, 'Fixture isolation expects the project Vite config return shape.');
  // Keep optimized modules out of shared dependencies, retaining the path
  // convention recognized by vinext's CommonJS plugin.
  await writeFile(join(actual, 'vite.config.ts'), config.replace(/return\s*\{\s*\n\s*server:/, "return {\n    cacheDir: '.runtime-cache/node_modules/.vite',\n    server:"));
  await symlink(join(actualProject, 'node_modules'), join(actual, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return actual;
}

// Public health cannot certify authenticated shared operations readiness. Like
// the resident smoke check, permit only the two explicit unprobed states.
export function runtimeHealthReady(health) {
  if (health?.corpus?.ready !== true) return false;
  const operations = health.operations;
  return operations?.ready === true || (operations?.ready === false && (
    (operations.mode === 'local' && operations.reason === 'shared_controls_not_configured') ||
    (operations.mode === 'shared' && operations.reason === 'authenticated_probe_required')
  ));
}

async function freePort() {
  const temporary = createServer();
  await new Promise((accept, reject) => { temporary.once('error', reject); temporary.listen(0, '127.0.0.1', accept); });
  const port = temporary.address().port;
  await new Promise((accept, reject) => temporary.close(error => error ? reject(error) : accept()));
  return port;
}

export function createRuntimeWorker({ fixture, redact = String }) {
  let worker;
  let log = '';
  let spawnError = false;
  return {
    get log() { return log; },
    async start() {
      assert.ok(!worker, 'Stop the fixture Worker before starting it again.');
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const childEnv = { ...process.env };
      for (const key of Object.keys(childEnv)) if (key.startsWith('LLM_')) delete childEnv[key];
      Object.assign(childEnv, { NODE_ENV: 'development', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' });
      log = '';
      spawnError = false;
      worker = spawn(process.execPath, [join(fixture, 'node_modules/vinext/dist/cli.js'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
        cwd: fixture, env: childEnv, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      });
      const append = value => { log = (log + redact(value)).slice(-100000); };
      worker.stdout.on('data', append); worker.stderr.on('data', append);
      worker.on('error', error => { spawnError = true; append(error.message); });
      const deadline = performance.now() + 120000;
      while (performance.now() < deadline) {
        if (spawnError || worker.exitCode !== null || worker.signalCode !== null) throw new Error('Fixture Worker could not start; inspect the ignored worker.log.');
        try {
          const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
          if (response.ok && runtimeHealthReady(await response.json())) return base;
        } catch { /* Vite and Workerd are still starting. */ }
        await new Promise(accept => setTimeout(accept, 500));
      }
      throw new Error('Fixture Worker startup exceeded 120 seconds.');
    },
    async stop() {
      const child = worker;
      worker = null;
      if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === 'win32') {
        // Stop only the process tree created by this harness.
        await new Promise(accept => {
          const stopper = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          stopper.once('error', accept); stopper.once('exit', accept);
        });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
      }
      await new Promise(accept => {
        if (child.exitCode !== null || child.signalCode !== null) return accept();
        const timer = setTimeout(accept, 5000);
        child.once('exit', () => { clearTimeout(timer); accept(); });
      });
    },
  };
}
