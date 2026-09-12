/** Serve the built deployment entrypoint in local Workerd for production browser tests. */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Use the exact Miniflare runtime installed with the project's pinned Wrangler.
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { values: options } = parseArgs({
  options: {
    port: { type: 'string', default: '3100' },
    'no-assets': { type: 'boolean', default: false },
  },
  strict: true,
});
const port = Number(options.port);
const noAssets = options['no-assets'];
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Choose an unprivileged local port.');
const serverRoot = await realpath(resolve(project, 'dist/server'));
const config = JSON.parse(await readFile(resolve(serverRoot, 'wrangler.json'), 'utf8'));
const entrypoint = await realpath(resolve(serverRoot, config.main));
assert.ok(entrypoint.startsWith(`${serverRoot}${sep}`), 'The built entrypoint must stay in dist/server.');
const clientRoot = await realpath(resolve(project, 'dist/client'));
assert.equal(await realpath(resolve(serverRoot, config.assets.directory)), clientRoot, 'The built asset directory must be dist/client.');
assert.equal(config.d1_databases?.length ?? 0, 0, 'This local fixture does not configure database bindings.');
assert.equal(config.r2_buckets?.length ?? 0, 0, 'This local fixture does not configure storage bindings.');
const stateRoot = resolve(project, noAssets ? 'work/built-worker-direct-state' : 'work/built-worker-state');
await mkdir(stateRoot, { recursive: true });
assert.deepEqual(config.rules, [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }], 'Update the fixture module loader if build rules change.');
const modules = [{ type: 'ESModule', path: entrypoint }];
async function collectModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectModules(path);
    else if (entry.isFile() && /\.m?js$/.test(entry.name) && path !== entrypoint) modules.push({ type: 'ESModule', path });
  }
}
await collectModules(serverRoot);
assert.ok(config.assets.run_worker_first === undefined || typeof config.assets.run_worker_first === 'boolean', 'Update this fixture for path-specific Worker-first routing.');

const runtimeOptions = {
  name: config.name,
  host: '127.0.0.1', port,
  rootPath: serverRoot,
  modules,
  modulesRoot: serverRoot,
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  // No .env files, resident inputs, provider secrets or host environment are loaded.
  bindings: { ...config.vars, LLM_PROVIDER: 'none' },
  resourcePersistencePath: resolve(stateRoot, 'resources'),
  isolatedResourcePersistencePath: resolve(stateRoot, 'isolated'),
  resourceTmpPath: resolve(stateRoot, 'tmp'),
  unsafeDevRegistryPath: resolve(stateRoot, 'registry'),
  unsafeRegisterWorker: false,
  telemetry: { enabled: false },
  logRequests: false,
};
if (!noAssets) runtimeOptions.assets = {
  directory: clientRoot,
  binding: config.assets.binding,
  routerConfig: {
    has_user_worker: true,
    invoke_user_worker_ahead_of_assets: config.assets.run_worker_first,
  },
};
const runtime = new Miniflare(convertV4MiniflareOptions(runtimeOptions));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await runtime.dispose();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void stop().catch(error => { console.error(error); process.exitCode = 1; });
});
try {
  const url = await runtime.ready;
  const runtimeVersion = wranglerRequire('miniflare/package.json').version;
  const routeMode = noAssets ? 'direct Worker route' : 'static-assets route';
  console.log(`Built Worker ready at ${url} (Miniflare ${runtimeVersion}; ${config.compatibility_date}; ${routeMode}; model provider none).`);
} catch (error) {
  await stop();
  throw error;
}
