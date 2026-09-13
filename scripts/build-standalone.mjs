/** Build an account-independent Worker from an isolated copy of the source. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'npm run build:standalone -- --name <your-worker-name> [--outdir work/standalone/<new-directory>]';
const { values } = parseArgs({ options: {
  name: { type: 'string' }, outdir: { type: 'string' }, help: { type: 'boolean' },
}, strict: true, allowPositionals: false });
if (values.help) { console.log(usage); process.exit(0); }
assert.match(values.name ?? '', /^[a-z][a-z0-9-]{2,62}$/, usage);
const workRoot = resolve(project, 'work');
await mkdir(workRoot, { recursive: true });
assert.equal(await realpath(workRoot), join(await realpath(project), 'work'), 'work/ must not be redirected through a link.');
const output = resolve(project, values.outdir ?? `work/standalone/${values.name}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
assert.ok(output.startsWith(`${resolve(workRoot, 'standalone')}${sep}`), 'Choose an output directory below work/standalone/.');
// Refuse existing outputs, and validate every ancestor before creating anything.
// This also prevents a linked output directory from escaping the workspace.
let cursor = workRoot;
const segments = relative(workRoot, output).split(sep);
for (const [index, segment] of segments.entries()) {
  cursor = join(cursor, segment);
  try {
    const stat = await lstat(cursor);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Artifact ancestors must be ordinary directories.');
    assert.ok(index < segments.length - 1, 'The output already exists. Use a new --outdir; existing artifacts and operator settings are never overwritten.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const fixture = await mkdtemp(join(workRoot, 'standalone-build-'));
for (const name of ['src', 'scripts', 'public', 'evaluation', 'vendor']) {
  await cp(join(project, name), join(fixture, name), { recursive: true, filter: source => !relative(project, source).split(sep).some(part => part.startsWith('.')) });
}
await mkdir(join(fixture, 'data'));
for (const entry of await readdir(join(project, 'data'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) await cp(join(project, 'data', entry.name), join(fixture, 'data', entry.name));
}
for (const name of ['package.json', 'next.config.ts', 'tsconfig.json', 'vite.config.ts']) {
  await cp(join(project, name), join(fixture, name));
}
await symlink(join(project, 'node_modules'), join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const childEnv = { ...process.env, TAMPABAYBOT_STANDALONE: '1', LLM_PROVIDER: 'none',
  WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_LOG_PATH: join(fixture, '.wrangler/logs'), MINIFLARE_REGISTRY_PATH: join(fixture, '.wrangler/registry') };
for (const key of Object.keys(childEnv)) {
  if (/^(LLM_|NEXT_PUBLIC_|VITE_|CLOUDFLARE_|CF_)/.test(key)) delete childEnv[key];
}
childEnv.LLM_PROVIDER = 'none';
await new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [join(project, 'node_modules/vinext/dist/cli.js'), 'build'], {
    cwd: fixture, env: childEnv, stdio: 'inherit', windowsHide: true,
  });
  child.once('error', rejectRun);
  child.once('exit', code => code === 0 ? resolveRun() : rejectRun(new Error(`Standalone build exited ${code}.`)));
});
const built = JSON.parse(await readFile(join(fixture, 'dist/server/wrangler.json'), 'utf8'));
assert.equal(built.main, 'index.js', 'Update the standalone packager if the compiled entrypoint changes.');
assert.equal(built.assets.directory, '../client');
for (const key of ['d1_databases', 'r2_buckets', 'kv_namespaces', 'services', 'queues']) {
  const value = built[key];
  assert.ok(!value || (Array.isArray(value) ? value.length === 0 : Object.values(value).every(items => Array.isArray(items) && items.length === 0)), `Independent artifact must not inherit ${key}.`);
}
await mkdir(join(output, 'server'), { recursive: true });
// Only compiled JavaScript modules and public assets enter the upload artifact.
// Framework metadata, environment files, source maps and Sites identity do not.
await cp(join(fixture, 'dist/server'), join(output, 'server'), {
  recursive: true,
  filter: async source => {
    const parts = relative(join(fixture, 'dist/server'), source).split(sep);
    if (parts.some(part => part.startsWith('.'))) return false;
    const stat = await lstat(source);
    assert.ok(!stat.isSymbolicLink(), 'Compiled modules must not be links.');
    return stat.isDirectory() || /\.m?js$/.test(source);
  },
});
await cp(join(fixture, 'dist/client'), join(output, 'client'), {
  recursive: true,
  filter: async source => {
    const parts = relative(join(fixture, 'dist/client'), source).split(sep);
    const stat = await lstat(source);
    assert.ok(!stat.isSymbolicLink(), 'Public assets must not be links.');
    return !parts.some(part => part.startsWith('.')) && !source.endsWith('.map');
  },
});
const config = {
  name: values.name, main: 'index.js',
  compatibility_date: built.compatibility_date,
  compatibility_flags: built.compatibility_flags,
  no_bundle: true, rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
  assets: { directory: '../client' }, workers_dev: true, preview_urls: false,
  observability: { enabled: false }, vars: { LLM_PROVIDER: 'none' },
};
await writeFile(join(output, 'server/wrangler.json'), `${JSON.stringify(config, null, 2)}\n`);
await writeFile(join(output, 'artifact.json'), `${JSON.stringify({
  schema_version: 1, created_at: new Date().toISOString(), worker_name: values.name,
  package_version: JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).version,
  build_mode: 'isolated-standalone', sites_identity_included: false,
  environment_files_loaded: false, provider: 'none',
  note: 'No deployment has occurred. Third-party corpus content in the input source remains the operator responsibility.',
}, null, 2)}\n`);
const displayPath = relative(project, output).split(sep).join('/');
console.log(`Standalone artifact: ${displayPath}`);
console.log(`Verify: npm run test:standalone -- --directory ${displayPath}`);
console.log(`After your own account login: npx wrangler deploy --config ${displayPath}/server/wrangler.json`);
