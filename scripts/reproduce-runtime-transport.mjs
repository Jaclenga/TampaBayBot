/**
 * Local, synthetic Miniflare assets/body-cancellation reproduction. No app,
 * provider, resident input, .env, or external service is used. Exit 1 means
 * a following request failed; this is deliberately not a retry or skipped test.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as playwrightRequest } from '@playwright/test';
import { release } from 'node:os';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const runtimeRequire = createRequire(wranglerRequire.resolve('miniflare/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
await mkdir(join(project, 'work'), { recursive: true });
const fixture = await mkdtemp(join(project, 'work/runtime-transport-'));
const assetDirectory = join(fixture, 'assets');
await mkdir(assetDirectory);
await writeFile(join(assetDirectory, 'synthetic.txt'), 'Synthetic static asset.\n');
const report = {
  observed_at: null,
  scope: 'Synthetic localhost Workerd requests with and without Miniflare static-assets routing. This does not establish that hosted Cloudflare is affected.',
  environment: { platform: process.platform, os_release: release(), architecture: process.arch, node: process.version,
    miniflare: wranglerRequire('miniflare/package.json').version, workerd: runtimeRequire('workerd/package.json').version },
  compatibility_date: '2026-09-11',
  observations: [],
};
function options(name, script) {
  return { name, host: '127.0.0.1', port: 0, modules: true, script,
    compatibilityDate: report.compatibility_date, logRequests: false, telemetry: { enabled: false },
    unsafeRegisterWorker: false, unsafeDevRegistryPath: join(fixture, name, 'registry'),
    resourcePersistencePath: join(fixture, name, 'resources'), resourceTmpPath: join(fixture, name, 'tmp') };
}
function runtime(input) {
  return new Miniflare(typeof convertV4MiniflareOptions === 'function' ? convertV4MiniflareOptions(input) : input);
}
try {
  for (const assets of [false, true]) {
    const backendOptions = options('synthetic-backend', `export default { async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/cancel') void request.body.cancel().catch(() => {});
      // Drain is a finite 9 KB control fixture, never a proposed application fix.
      if (path === '/drain' || path === '/after') await request.arrayBuffer();
      return new Response(path, { status: path === '/after' ? 200 : 400 });
    }};`);
    if (assets) backendOptions.assets = { directory: assetDirectory, routerConfig: { has_user_worker: true } };
    const backend = runtime(backendOptions);
    let proxy, client;
    try {
      const backendURL = String(await backend.ready);
      proxy = runtime(options('synthetic-proxy', `export default { fetch(request) {
        const url = new URL(request.url); url.host = new URL(${JSON.stringify(backendURL)}).host;
        return fetch(url, new Request(request));
      }};`));
      client = await playwrightRequest.newContext({ baseURL: String(await proxy.ready), timeout: 15000 });
      for (const action of ['early', 'cancel', 'drain']) {
        for (let cycle = 0; cycle < 3; cycle++) {
          const first = await client.post(`/${action}`, { data: { synthetic: 'a'.repeat(9000) }, maxRetries: 0 });
          await first.text();
          const following = await client.post('/after', { data: { synthetic: 'small input' }, maxRetries: 0 });
          const text = await following.text();
          report.observations.push({ assets, action, cycle, expected_first: 400, first_status: first.status(),
            expected_following: 200, following_status: following.status(),
            network_connection_lost: text.includes('Network connection lost') });
        }
      }
    } finally {
      await client?.dispose();
      await proxy?.dispose();
      await backend.dispose();
    }
  }
} finally {
  report.observed_at = new Date().toISOString();
  report.unexpected_responses = report.observations.filter(item => item.first_status !== item.expected_first || item.following_status !== item.expected_following).length;
  report.status = report.observations.length !== 18 || report.unexpected_responses ? 'failed' : 'passed';
  const output = join(fixture, 'results.json');
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, unexpected_responses: report.unexpected_responses, report: relative(project, output) }));
  if (report.status === 'failed') process.exitCode = 1;
}
