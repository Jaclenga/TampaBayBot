import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { digest, json, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { verifyReviewedBuild } from './build-source-refresh.mjs';

export function preservingWorkerConfig(original, settings, exposure, worker) {
  assert.equal(original.name, worker, 'Verified build targets another Worker');
  assert.equal(original.compatibility_date, settings.compatibility_date, 'Runtime date changed; build and review that migration separately');
  assert.deepEqual(original.compatibility_flags ?? [], settings.compatibility_flags ?? [], 'Runtime flags changed');
  assert.equal(settings.usage_model, 'standard', 'Unsupported Worker usage model');
  assert.equal(typeof exposure.enabled, 'boolean');
  assert.equal(typeof exposure.previews_enabled, 'boolean');
  const config = { ...original, keep_vars: true, vars: {}, d1_databases: [],
    workers_dev: exposure.enabled, preview_urls: exposure.previews_enabled,
    logpush: settings.logpush ?? false, tail_consumers: settings.tail_consumers ?? [] };
  // Omitted routes preserve dashboard-managed routing. Never add a new route.
  delete config.routes; delete config.route; delete config.ai;
  const seen = new Set();
  for (const binding of settings.bindings ?? []) {
    assert.match(binding.name ?? '', /^[A-Za-z_][A-Za-z0-9_]*$/);
    assert.ok(!seen.has(binding.name), 'Duplicate live binding'); seen.add(binding.name);
    switch (binding.type) {
      case 'plain_text':
        assert.equal(typeof binding.text, 'string');
        assert.ok(!['__proto__', 'constructor', 'prototype'].includes(binding.name));
        config.vars[binding.name] = binding.text;
        break;
      case 'secret_text': break; // Wrangler preserves existing secrets; no values are read.
      case 'ai':
        assert.ok(!config.ai, 'Multiple AI bindings are unsupported');
        config.ai = { binding: binding.name }; break;
      case 'd1': {
        const id = binding.database_id ?? binding.id;
        assert.match(id ?? '', /^[a-f0-9-]{36}$/i, 'Existing D1 ID is required; never provision a replacement');
        config.d1_databases.push({ binding: binding.name, database_id: id }); break;
      }
      default: throw new Error(`Unsupported live binding type: ${binding.type}; do not remove it automatically`);
    }
  }
  if (settings.placement?.mode) config.placement = settings.placement;
  if (settings.limits) config.limits = settings.limits;
  if (settings.observability) config.observability = settings.observability;
  return config;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function run(root, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
      cwd, windowsHide: true, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' },
    });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? done() : fail(new Error(`Preserving deployment command failed (${code})`)));
  });
}

export async function verifyPublicAssets(url, fetcher = fetch) {
  const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, 'Public chat HTML failed after deployment');
  const html = await response.text();
  const paths = [...new Set([...html.matchAll(/(?:src|href)="([^"\s]*\/assets\/[^"\s]+)"/g)].map(match => match[1]))];
  assert.ok(paths.some(path => path.endsWith('.css')) && paths.some(path => path.endsWith('.js')), 'Public chat must reference styles and scripts');
  for (const path of paths) {
    const asset = new URL(path, url);
    assert.equal(asset.origin, new URL(url).origin, 'Unexpected external chat asset');
    const result = await fetcher(asset, { signal: AbortSignal.timeout(20000) });
    const type = result.headers.get('content-type') ?? '';
    assert.ok(result.ok && (path.endsWith('.css') ? type.includes('text/css') : /javascript/.test(type)), `Public chat asset unavailable: ${asset.pathname}`);
    await result.arrayBuffer();
  }
  return { assets: paths.length };
}

export async function deployPreservingWorker(root, { artifact, worker, dryRun = false } = {}) {
  assert.match(worker ?? '', /^[a-z][a-z0-9-]{2,62}$/);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert.match(account ?? '', /^[a-f0-9]{32}$/);
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'A scoped CI deployment token is required');
  const input = await workspacePath(root, relative(root, resolve(root, artifact)));
  const verification = JSON.parse(await readFile(await workspacePath(input, 'verification.json'), 'utf8'));
  await verifyReviewedBuild(root, { generation: 'verified-upload', build: { status: 'passed', generation: 'verified-upload',
    artifact: relative(root, input).split(sep).join('/'), config: relative(root, resolve(input, 'server/wrangler.json')).split(sep).join('/'), artifact_sha256: verification.artifact_sha256 } });
  const original = JSON.parse(await readFile(await workspacePath(input, 'server/wrangler.json'), 'utf8'));
  const get = async suffix => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/${suffix}`, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    assert.ok(response.ok && body.success, 'Could not read live Worker configuration; do not deploy a bare standalone config');
    return body.result;
  };
  const observe = async () => ({ settings: await get('settings'), exposure: await get('subdomain') });
  const before = await observe();
  const config = preservingWorkerConfig(original, before.settings, before.exposure, worker);
  const execution = await workspacePath(root, `work/source-deploy/production-${randomUUID()}`);
  await mkdir(dirname(execution), { recursive: true });
  await mkdir(execution);
  for (const name of ['server', 'client']) await cp(await workspacePath(input, name), resolve(execution, name), { recursive: true });
  const configPath = await workspacePath(execution, 'server/wrangler.json');
  await writeAtomic(configPath, json(config));
  await run(root, ['deploy', '--dry-run', '--config', configPath, '--outdir', resolve(execution, 'upload')], execution);
  assert.equal(digest(json(stable(await observe()))), digest(json(stable(before))), 'Live settings changed during validation; retry without overwriting them');
  if (!dryRun) {
    await run(root, ['deploy', '--config', configPath], execution);
    if (worker === 'tampabaybot-limited-api') await verifyPublicAssets('https://tampabaybot-housing-preview.pages.dev/');
  }
  return { status: dryRun ? 'dry_run_passed' : 'command_succeeded', worker,
    note: 'Existing bindings, variables, secret names and endpoint exposure were preserved. No secret values were retrieved.' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { artifact: { type: 'string' }, worker: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  console.log(json(await deployPreservingWorker(resolve(import.meta.dirname, '..'), { artifact: values.artifact, worker: values.worker, dryRun: values['dry-run'] })));
}
