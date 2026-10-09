/** Package the pre-session Next interface and an independent housing directory for Pages. */
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stage = resolve(process.argv[2] ?? join(root, 'work', `classic-pages-${Date.now()}`));
const [nextAssets, directoryHtml] = await Promise.all([
  stat(join(root, 'dist', 'client', 'assets')),
  readFile(join(root, 'pages-demo', 'dist', 'index.html'), 'utf8'),
]);
assert.ok(nextAssets.isDirectory(), 'Run npm run build first.');
assert.ok(directoryHtml.includes('Housing assistance directory preview'),
  'Build the static directory with VITE_DIRECTORY_ONLY=true before packaging.');
try { await stat(stage); throw new Error('Use a new stage path; existing output is never overwritten.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const output = join(stage, 'dist');
await mkdir(join(output, 'housing-help'), { recursive: true });
await cp(join(root, 'pages-demo', 'dist'), output, { recursive: true });
await cp(join(root, 'dist', 'client'), output, { recursive: true });
await writeFile(join(output, 'housing-help', 'index.html'), directoryHtml);
await writeFile(join(output, '_routes.json'), JSON.stringify({
  version: 1, include: ['/*'], exclude: ['/assets/*', '/housing-help', '/housing-help/*'],
}));
await cp(join(root, 'functions'), join(stage, 'functions'), { recursive: true });
const config = JSON.parse(await readFile(join(root, 'wrangler.pages.json'), 'utf8'));
delete config.$schema;
config.pages_build_output_dir = './dist';
await writeFile(join(stage, 'wrangler.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({ stage, pagesDirectory: output, backendWorker: config.services?.[0]?.service }, null, 2));
