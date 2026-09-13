/** Run fictional evidence in an isolated source tree; never replace operator data. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createSourceRelease } from './package-release.mjs';
import { makeDemoCorpus } from '../tests/fixtures/demo-corpus.mjs';

export async function prepareDemo(root, { output = `work/releases/demo-${Date.now()}-${process.pid}`, linkDependencies = true } = {}) {
  const release = await createSourceRelease({ root, output });
  const directory = resolve(root, release.output);
  const { sources, chunks } = makeDemoCorpus();
  const generation = createHash('sha256').update(JSON.stringify({ sources, chunks })).digest('hex');
  for (const [name, value] of Object.entries({ sources, chunks, corpus: { schema_version: 1, generation, sources, chunks } })) {
    await writeFile(join(directory, 'data', `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }
  if (linkDependencies) await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // Shared dependencies must not share optimized React modules across Vite roots.
  // vinext excludes its link shim by package name, but the app's next/link alias
  // can still be prebundled into the client React graph and reused during SSR.
  // Keep that ESM shim and its lazy router import in each environment's graph.
  // Include the icon library up front: late RSC imports otherwise
  // trigger a second optimization pass that reloads the first resident answer.
  const configPath = join(directory, 'vite.config.ts');
  const config = await readFile(configPath, 'utf8');
  const isolated = config.replace(/return\s*\{\s*\n\s*server:/, "return {\n    cacheDir: '.demo-cache/node_modules/.vite',\n    optimizeDeps: { exclude: ['next/link', 'next/router.js'], include: ['lucide-react'] },\n    server:");
  assert.notEqual(isolated, config, 'Update demo cache isolation if the Vite config shape changes');
  await writeFile(configPath, isolated);
  return directory;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '3001' }, 'prepare-only': { type: 'boolean' } }, strict: true });
  const port = Number(values.port);
  assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535, 'Choose a port from 1025 to 65535');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const directory = await prepareDemo(root);
  console.log('Fictional demonstration only. No real housing programs or decisions.');
  console.log(`Demo directory: ${directory}`);
  if (!values['prepare-only']) {
    const env = { ...process.env, TAMPABAYBOT_STANDALONE: '1', LLM_PROVIDER: 'none', WRANGLER_SEND_METRICS: 'false' };
    for (const key of Object.keys(env)) if (/^(?:LLM_|CLOUDFLARE_|CF_|NEXT_PUBLIC_|VITE_)/.test(key)) delete env[key];
    env.LLM_PROVIDER = 'none';
    const child = spawn(process.execPath, [join(root, 'node_modules/vinext/dist/cli.js'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: directory, env, windowsHide: true, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 0; });
  }
}
