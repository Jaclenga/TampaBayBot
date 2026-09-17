import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, json, makeCorpus, readCorpus } from './generation.mjs';
import { applyRefresh, inspectCandidate, stageRefresh, verifyPreservedSources } from './refresh.mjs';
import { refreshFixture } from './refresh-fixtures.mjs';
import { deriveFacts } from '../domain/facts.mjs';

const updatedHtml = '<main><h1>Fixture program</h1><p>Updated synthetic guidance requires agency review.</p></main>';
const fetchUpdated = async () => new Response(updatedHtml);
const buildPassed = async () => ({ status: 'passed', artifact: 'synthetic-test-artifact' });

test('redirected acquisition fails before contacting its target and preserves active evidence', async t => {
  const { root, corpus } = await refreshFixture(t);
  let calls = 0;
  const staged = await stageRefresh(root, { fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/internal' } });
  } });
  assert.equal(calls, 1);
  assert.equal(staged.report.failures, 1);
  assert.equal(staged.report.sources[0].error_code, 'source_redirect_not_allowed');
  assert.equal(staged.report.sources[0].retained_previous_evidence, true);
  const candidate = await inspectCandidate(root, staged.directory, staged.candidate_sha256);
  assert.deepEqual(candidate.manifest.payload, []);
  assert.equal(candidate.corpus.sources[0].status, 'unavailable');
  assert.deepEqual(candidate.corpus.chunks, corpus.chunks);
  assert.deepEqual(await readCorpus(root), corpus);
});

test('excessive normalization output fails before serialization and keeps the active generation', async t => {
  const { root, corpus } = await refreshFixture(t);
  const staged = await stageRefresh(root, { fetchImpl: fetchUpdated,
    normalizeImpl: async () => ({ units: Array.from({ length: 10001 }, () => ({ text: 'Synthetic evidence remains subject to agency review.' })), links: [] }),
  });
  assert.equal(staged.report.failures, 1);
  assert.equal(staged.report.sources[0].error_code, 'normalization_limit_exceeded');
  const candidate = await inspectCandidate(root, staged.directory, staged.candidate_sha256);
  assert.deepEqual(candidate.manifest.payload, []);
  assert.deepEqual(candidate.corpus.chunks, corpus.chunks);
  assert.deepEqual(await readCorpus(root), corpus);
});

test('staging honors edited source configuration without changing active evidence', async t => {
  const { root, corpus, source } = await refreshFixture(t);
  await writeFile(join(root, 'data/sources.json'), json([{ ...source, fetch_url: 'https://example.gov/updated-feed' }]));
  let fetched;
  const staged = await stageRefresh(root, { fetchImpl: async url => { fetched = url.href; return new Response(updatedHtml); } });
  assert.equal(fetched, 'https://example.gov/updated-feed'); assert.deepEqual(await readCorpus(root), corpus);
  assert.equal(staged.report.status, 'awaiting_review');
  assert.equal(staged.report.sources[0].chunks_added, 1); assert.equal(staged.report.sources[0].chunks_removed, 1);
  assert.deepEqual(staged.report.sources[0].configuration_fields_changed, ['fetch_url']);
  assert.doesNotMatch(json(staged.report), /Updated synthetic guidance|Original synthetic guidance|<main>/);
  const candidate = await inspectCandidate(root, staged.directory, staged.candidate_sha256);
  assert.equal(candidate.corpus.sources[0].fetch_url, fetched);
  assert.ok(candidate.corpus.chunks[0].text.includes('Updated synthetic'));
});

test('failed fetches retain dated evidence and only stage an unavailable status', async t => {
  const { root, corpus } = await refreshFixture(t);
  const staged = await stageRefresh(root, { downloadOptions: { attempts: 1 }, fetchImpl: async () => new Response('private response detail', { status: 503 }) });
  const candidate = await inspectCandidate(root, staged.directory);
  assert.equal(staged.report.failures, 1); assert.equal(candidate.corpus.sources[0].status, 'unavailable');
  assert.deepEqual(candidate.corpus.chunks, corpus.chunks);
  assert.equal(candidate.corpus.sources[0].retrieval_date, corpus.sources[0].retrieval_date);
  assert.deepEqual(await readCorpus(root), corpus); assert.doesNotMatch(json(staged.report), /private response detail/);
});

test('a failed build leaves active corpus and its compatibility mirrors untouched', async t => {
  const { root, corpus } = await refreshFixture(t); const staged = await stageRefresh(root, { fetchImpl: fetchUpdated });
  await assert.rejects(applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Synthetic reviewer',
    validateAndBuild: async () => { throw new Error('synthetic build failure'); } }), /build failure/);
  assert.deepEqual(await readCorpus(root), corpus);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'data/sources.json'))), corpus.sources);
});

test('approval binds the full candidate and corrupted staged bytes are rejected before building', async t => {
  const { root } = await refreshFixture(t); const staged = await stageRefresh(root, { fetchImpl: fetchUpdated });
  let builds = 0; const validateAndBuild = async () => { builds++; return buildPassed(); };
  await assert.rejects(applyRefresh(root, { directory: staged.directory, approve: '0'.repeat(64), reviewer: 'Reviewer', validateAndBuild }), /digest mismatch/);
  const candidate = await inspectCandidate(root, staged.directory);
  await writeFile(join(candidate.candidateRoot, 'payload', candidate.manifest.payload[0].path), 'changed downloaded bytes');
  await assert.rejects(applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Reviewer', validateAndBuild }), /snapshot/);
  assert.equal(builds, 0);
});

test('successful approval publishes a consistent generation and preserves all old raw bytes', async t => {
  const { root, corpus, bytes, source } = await refreshFixture(t); const staged = await stageRefresh(root, { fetchImpl: fetchUpdated });
  const receipt = await applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Synthetic reviewer', validateAndBuild: buildPassed });
  const active = await readCorpus(root);
  assert.equal(receipt.generation, active.generation); assert.equal(receipt.previous_generation, corpus.generation);
  assert.equal(receipt.deployment, 'not_deployed'); assert.equal(receipt.reviewer, 'Synthetic reviewer');
  assert.deepEqual(await readFile(join(root, source.raw_path)), bytes);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'data/sources.json'))), active.sources);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'data/chunks.json'))), active.chunks);
  assert.ok(active.sources[0].normalized_path.startsWith('data/normalized/fixture/'));
});

test('unchanged snapshots can be reviewed again without overwriting immutable normalization', async t => {
  const { root } = await refreshFixture(t);
  for (const date of ['2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z']) {
    const staged = await stageRefresh(root, { fetchImpl: fetchUpdated, now: () => date });
    await applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Reviewer', validateAndBuild: buildPassed });
  }
  assert.equal((await readCorpus(root)).sources[0].retrieval_date, '2026-02-02T00:00:00Z');
});

test('source edits after review or during build cannot be silently overwritten', async t => {
  const { root, source, corpus } = await refreshFixture(t); const staged = await stageRefresh(root, { fetchImpl: fetchUpdated });
  await assert.rejects(applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Reviewer',
    validateAndBuild: async () => { await writeFile(join(root, 'data/sources.json'), json([{ ...source, selector: '#changed' }])); return buildPassed(); } }), /changed during build/);
  assert.deepEqual(await readCorpus(root), corpus);
  await assert.rejects(applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Reviewer', validateAndBuild: buildPassed }), /changed after staging/);
});

test('offline staging verifies preserved raw hashes and does not perform network calls', async t => {
  const { root, source } = await refreshFixture(t);
  const staged = await stageRefresh(root, { offline: true, fetchImpl: async () => { throw new Error('No offline network'); } });
  assert.equal(staged.report.failures, 0); assert.equal(staged.report.sources[0].normalized_changed, false);
  await writeFile(join(root, source.raw_path), 'corrupted preserved snapshot');
  const failed = await stageRefresh(root, { offline: true }); assert.equal(failed.report.failures, 1);
});

test('facts survive reviewed publication and preserved snapshot verification', async t => {
  const { root } = await refreshFixture(t);
  const html = '<main><p>Applications are closed.</p><p>Maximum assistance: $2,000.</p><p>Income Limits 2025: $60,000.</p></main>';
  const staged = await stageRefresh(root, { fetchImpl: async () => new Response(html) });
  const candidate = await inspectCandidate(root, staged.directory, staged.candidate_sha256);
  assert.equal(candidate.corpus.chunks.flatMap(chunk => chunk.facts).filter(fact => fact.factType === 'application_status').length, 1);
  await applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Synthetic reviewer', validateAndBuild: buildPassed });
  assert.deepEqual((await readCorpus(root)).chunks, candidate.corpus.chunks);
  assert.equal((await verifyPreservedSources(root)).status, 'passed');
});

test('legacy snapshots remain verifiable and offline staging adds facts without changing evidence identity', async t => {
  const { root, corpus } = await refreshFixture(t);
  const legacy = makeCorpus(corpus.sources, corpus.chunks.map(chunk => {
    const copy = { ...chunk, locator: { ...chunk.locator } }; delete copy.facts; delete copy.answer_sections;
    delete copy.locator.starts_at_sentence_boundary; return copy;
  }));
  for (const [name, value] of [['corpus', legacy], ['sources', legacy.sources], ['chunks', legacy.chunks]]) await writeFile(join(root, 'data', `${name}.json`), json(value));
  assert.equal((await verifyPreservedSources(root)).status, 'passed');
  const staged = await stageRefresh(root, { offline: true });
  const candidate = await inspectCandidate(root, staged.directory);
  assert.equal(staged.report.sources[0].normalized_changed, false);
  assert.deepEqual(candidate.corpus.chunks.map(chunk => chunk.id), legacy.chunks.map(chunk => chunk.id));
  assert.ok(candidate.corpus.chunks.every(chunk => Array.isArray(chunk.facts)));
  assert.ok(candidate.corpus.chunks.every(chunk => typeof chunk.locator.starts_at_sentence_boundary === 'boolean'));
});

test('legacy annotated continuation chunks verify conservatively and offline staging restores a complete leading closure', async t => {
  const { root } = await refreshFixture(t);
  const html = `<main><p>${'Background. '.repeat(116)}Notes. Applications are currently closed. Contact the agency for future availability.</p></main>`;
  const staged = await stageRefresh(root, { fetchImpl: async () => new Response(html) });
  await applyRefresh(root, { directory: staged.directory, approve: staged.candidate_sha256, reviewer: 'Synthetic reviewer', validateAndBuild: buildPassed });
  const active = await readCorpus(root);
  const legacy = makeCorpus(active.sources, active.chunks.map(chunk => {
    const copy = { ...chunk, locator: { ...chunk.locator } }; delete copy.locator.starts_at_sentence_boundary;
    copy.facts = deriveFacts(copy, active.sources[0]); return copy;
  }));
  assert.ok(!legacy.chunks.flatMap(chunk => chunk.facts).some(fact => fact.factType === 'application_status'));
  for (const [name, value] of [['corpus', legacy], ['sources', legacy.sources], ['chunks', legacy.chunks]]) await writeFile(join(root, 'data', `${name}.json`), json(value));
  assert.equal((await verifyPreservedSources(root)).status, 'passed');
  const regenerated = await stageRefresh(root, { offline: true });
  const candidate = await inspectCandidate(root, regenerated.directory);
  assert.deepEqual(candidate.corpus.chunks.map(chunk => chunk.id), legacy.chunks.map(chunk => chunk.id));
  assert.deepEqual(candidate.corpus.chunks.map(chunk => chunk.content_hash), legacy.chunks.map(chunk => chunk.content_hash));
  assert.deepEqual(candidate.corpus.chunks.flatMap(chunk => chunk.facts).filter(fact => fact.factType === 'application_status').map(fact => fact.value), ['closed']);
});

test('offline regeneration cannot relabel an old snapshot using an edited publisher definition', async t => {
  const { root, source, corpus } = await refreshFixture(t);
  await writeFile(join(root, 'data/sources.json'), json([{ ...source, canonical_url: 'https://example.gov/another-city', jurisdiction_ids: ['clearwater'] }]));
  const staged = await stageRefresh(root, { offline: true, fetchImpl: async () => { throw new Error('Offline must not fetch'); } });
  const candidate = await inspectCandidate(root, staged.directory);
  assert.equal(staged.report.failures, 1);
  assert.equal(staged.report.sources[0].error_code, 'offline_configuration_requires_acquisition');
  assert.equal(candidate.corpus.sources[0].status, 'unavailable');
  assert.equal(candidate.corpus.sources[0].raw_path, undefined);
  assert.equal(candidate.corpus.chunks.length, 0);
  assert.deepEqual(await readCorpus(root), corpus);
});

test('a refreshed page without a publisher update date does not inherit the prior page date', async t => {
  const { root, source, corpus } = await refreshFixture(t);
  const dated = makeCorpus([{ ...source, source_updated_date: '2025-12-01' }], corpus.chunks);
  await writeFile(join(root, 'data/corpus.json'), json(dated));
  await writeFile(join(root, 'data/sources.json'), json(dated.sources));
  const staged = await stageRefresh(root, { fetchImpl: fetchUpdated });
  const candidate = await inspectCandidate(root, staged.directory);
  assert.equal(candidate.corpus.sources[0].source_updated_date, null);
  assert.equal((await readCorpus(root)).sources[0].source_updated_date, '2025-12-01');
});

test('failed or unselected configuration changes cannot relabel retained evidence into another jurisdiction', async t => {
  for (const unselected of [false, true]) {
    const { root, source, corpus } = await refreshFixture(t);
    const changed = { ...source, jurisdiction_ids: ['clearwater'], canonical_url: 'https://example.gov/another-city' };
    const registry = unselected ? [changed, { ...source, source_id: 'other', status: 'unavailable', ingestion_method: 'live-query-only' }] : [changed];
    await writeFile(join(root, 'data/sources.json'), json(registry));
    const staged = await stageRefresh(root, { ...(unselected ? { sourceId: 'other' } : {}), downloadOptions: { attempts: 1 }, fetchImpl: async () => new Response('', { status: 503 }) });
    const candidate = await inspectCandidate(root, staged.directory);
    assert.equal(candidate.corpus.chunks.length, 0);
    assert.equal(candidate.corpus.sources[0].status, 'unavailable');
    assert.equal(candidate.corpus.sources[0].raw_path, undefined);
    assert.equal(staged.report.sources[0].withheld_previous_chunks, corpus.chunks.length);
    assert.deepEqual(await readCorpus(root), corpus);
  }
});

test('self-consistent chunk hashes cannot disguise text absent from the preserved raw source', async t => {
  const { root, corpus } = await refreshFixture(t);
  const chunks = corpus.chunks.map(chunk => ({ ...chunk, text: 'Invented text is not present in the preserved original.', content_hash: digest('Invented text is not present in the preserved original.') }));
  await writeFile(join(root, 'data/corpus.json'), json(makeCorpus(corpus.sources, chunks)));
  assert.equal((await verifyPreservedSources(root, undefined, { allowEmpty: true })).status, 'failed');
});

test('the review summary is bound to the approval digest, not only the evidence payload', async t => {
  const { root } = await refreshFixture(t); const staged = await stageRefresh(root, { fetchImpl: fetchUpdated });
  const filename = join(root, staged.directory, 'report.json');
  const report = JSON.parse(await readFile(filename, 'utf8')); report.sources[0].chunks_added = 0;
  await writeFile(filename, json(report));
  await assert.rejects(inspectCandidate(root, staged.directory, staged.candidate_sha256), /Review report was modified/);
});

test('immutable normalized paths include resolved links, not only passage text', async t => {
  const { root } = await refreshFixture(t);
  const html = updatedHtml.replace('</main>', '<a href="apply">Application path</a></main>');
  const fetchImpl = async () => new Response(html);
  const first = await stageRefresh(root, { fetchImpl });
  await applyRefresh(root, { directory: first.directory, approve: first.candidate_sha256, reviewer: 'Reviewer', validateAndBuild: buildPassed });
  const before = await readCorpus(root); const source = before.sources[0];
  await writeFile(join(root, 'data/sources.json'), json([{ ...source, canonical_url: 'https://example.gov/another/base' }]));
  const next = await stageRefresh(root, { fetchImpl });
  await applyRefresh(root, { directory: next.directory, approve: next.candidate_sha256, reviewer: 'Reviewer', validateAndBuild: buildPassed });
  const after = (await readCorpus(root)).sources[0];
  assert.equal(after.content_hash, source.content_hash); assert.equal(after.normalized_content_hash, source.normalized_content_hash);
  assert.notEqual(after.normalized_path, source.normalized_path);
  assert.equal(JSON.parse(await readFile(join(root, after.normalized_path))).links[0].url, 'https://example.gov/another/apply');
  assert.equal(JSON.parse(await readFile(join(root, source.normalized_path))).links[0].url, 'https://example.gov/apply');
});
