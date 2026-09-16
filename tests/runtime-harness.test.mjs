import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createRuntimeFixture, createRuntimeWorker, runtimeHealthReady } from '../scripts/runtime-harness.mjs';
import { operationsStatus } from '../src/lib/operations/control.mjs';
import { corpusReadiness, readinessResponse } from '../src/lib/operations/readiness.mjs';
import { makeDemoCorpus } from './fixtures/demo-corpus.mjs';

async function projectFixture(t) {
  const work = resolve('work');
  await mkdir(work, { recursive: true });
  const project = await mkdtemp(join(work, 'runtime-harness-test-'));
  t.after(async () => {
    assert.ok(project.startsWith(`${work}${sep}`));
    await rm(project, { recursive: true, force: true });
  });
  for (const directory of ['scripts', 'public', 'evaluation', 'vendor', 'data/raw', 'node_modules/vinext/dist']) {
    await mkdir(join(project, directory), { recursive: true });
  }
  for (const [name, content] of [
    ['src/lib/llm/index.mjs', 'export {};'], ['src/lib/runtime-env.mjs', 'export {};'],
    ['package.json', '{"type":"module"}'], ['tsconfig.json', '{}'],
    ['vite.config.ts', 'export default () => { return {\n  server: {}\n}; };\n'],
    ['data/corpus.json', '{"synthetic":true}'], ['data/raw/private.txt', 'synthetic raw input'],
    ['.env', 'SYNTHETIC_PRIVATE_VALUE=do-not-copy'],
    ['node_modules/vinext/package.json', '{"type":"module"}'],
  ]) {
    await mkdir(dirname(join(project, name)), { recursive: true });
    await writeFile(join(project, name), content);
  }
  return project;
}

test('runtime fixtures work without hosting or Next config and isolate project configuration', async t => {
  const project = await projectFixture(t);
  for (const hostingExists of [false, true]) {
    if (hostingExists) {
      await mkdir(join(project, '.openai'));
      await writeFile(join(project, '.openai/hosting.json'), '{"synthetic_private_binding":"do-not-copy"}');
    }
    const fixture = await createRuntimeFixture(project, 'synthetic-runtime-');
    for (const name of ['.env', '.openai', 'next.config.ts', 'data/raw']) {
      await assert.rejects(access(join(fixture, name)), { code: 'ENOENT' });
    }
    assert.deepEqual(await readdir(join(fixture, 'data')), ['corpus.json']);
    assert.deepEqual(JSON.parse(await readFile(join(fixture, 'data/corpus.json'))), { synthetic: true });
    assert.equal(await realpath(join(fixture, 'node_modules')), await realpath(join(project, 'node_modules')));
    assert.match(await readFile(join(fixture, 'vite.config.ts'), 'utf8'), /cacheDir: '\.runtime-cache\/node_modules\/\.vite'/);
    assert.doesNotMatch(await readFile(join(project, 'vite.config.ts'), 'utf8'), /cacheDir/);
    assert.equal(await readFile(join(project, '.env'), 'utf8'), 'SYNTHETIC_PRIVATE_VALUE=do-not-copy');
  }
});

test('runtime readiness permits public unprobed states but rejects empty evidence and operations failures', async () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const corpus = makeDemoCorpus(now);
  const fresh = corpusReadiness(corpus.sources, corpus.chunks, now);
  for (const env of [{}, { TAMPABAYBOT_OPERATIONS_MODE: 'shared', TAMPABAYBOT_LIMIT_SECRET: 'synthetic-limit-secret-at-least-32-characters' }]) {
    const operations = await operationsStatus(env);
    const health = readinessResponse(fresh, operations, 'fixture', 'fixture');
    assert.equal(health.status, 'degraded');
    assert.equal(runtimeHealthReady(health), true);
    assert.equal(runtimeHealthReady(readinessResponse(corpusReadiness([], [], now), operations, 'fixture', 'fixture')), false);
  }
  assert.equal(runtimeHealthReady({ corpus: fresh, operations: { ready: true } }), true);
  for (const health of [undefined, { status: 'ready' }, { corpus: fresh },
    { corpus: fresh, operations: { ready: false, mode: 'shared', reason: 'operations_unavailable' } },
    { corpus: fresh, operations: { ready: false, mode: 'shared', reason: 'shared_controls_not_configured' } },
    { corpus: fresh, operations: { ready: false, mode: 'local', reason: 'maintenance' } },
  ]) assert.equal(runtimeHealthReady(health), false);
});

test('runtime worker starts on degraded local readiness, redacts logs and stops its own process', async t => {
  const project = await projectFixture(t);
  await writeFile(join(project, 'node_modules/vinext/dist/cli.js'), `
import { createServer } from 'node:http';
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
console.log('synthetic-log-secret');
createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(request.url === '/api/health'
    ? { status: 'degraded', corpus: { ready: true }, operations: { ready: false, mode: 'local', reason: 'shared_controls_not_configured' } }
    : { llmKeys: Object.keys(process.env).filter(key => key.startsWith('LLM_')), mode: process.env.NODE_ENV, metrics: process.env.WRANGLER_SEND_METRICS }));
}).listen(port, '127.0.0.1');
`);
  const fixture = await createRuntimeFixture(project, 'synthetic-runtime-');
  const worker = createRuntimeWorker({ fixture, redact: value => String(value).replaceAll('synthetic-log-secret', '[redacted]') });
  try {
    const base = await worker.start();
    assert.deepEqual(await (await fetch(base)).json(), { llmKeys: [], mode: 'development', metrics: 'false' });
    assert.match(worker.log, /\[redacted\]/);
    assert.doesNotMatch(worker.log, /synthetic-log-secret/);
    await worker.stop();
    await assert.rejects(fetch(base, { signal: AbortSignal.timeout(2000) }));
  } finally { await worker.stop(); }
});

test('runtime worker reports an exited startup process without waiting for readiness timeout', async t => {
  const project = await projectFixture(t);
  await writeFile(join(project, 'node_modules/vinext/dist/cli.js'), 'process.exit(13);\n');
  const fixture = await createRuntimeFixture(project, 'synthetic-runtime-');
  const worker = createRuntimeWorker({ fixture });
  try { await assert.rejects(worker.start(), /Fixture Worker could not start/); }
  finally { await worker.stop(); }
});
