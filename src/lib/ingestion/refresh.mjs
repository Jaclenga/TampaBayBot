import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fetchSource, DownloadError } from './fetch.mjs';
import { normalize, chunkUnits } from './normalize.mjs';
import { digest, json, makeCorpus, readCorpus, validateCorpus, workspacePath, writeAtomic, withPublicationLock, publishCorpus } from './generation.mjs';

const generatedFields = ['retrieval_date', 'source_updated_date', 'content_hash', 'normalized_content_hash', 'raw_path', 'normalized_path', 'last_attempt', 'last_error', 'response_url', 'content_type', 'etag', 'last_modified', 'content_changed_at', 'status'];
const errorCode = error => error instanceof DownloadError ? error.code : 'source_normalization_or_provenance_failed';
const snapshot = source => ({ status: source?.status ?? 'unavailable', content_hash: source?.content_hash ?? null, normalized_content_hash: source?.normalized_content_hash ?? null, retrieval_date: source?.retrieval_date ?? null });
const changedConfiguration = (before, after) => [...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])]
  .filter(key => !generatedFields.includes(key) && JSON.stringify(before?.[key]) !== JSON.stringify(after[key]));
function withholdPreviousEvidence(source, nextChunks) {
  for (const key of generatedFields) if (!['last_attempt', 'last_error'].includes(key)) delete source[key];
  Object.assign(source, { status: 'unavailable', retrieval_date: null, source_updated_date: null, last_error: 'configuration_changed_evidence_withheld' });
  nextChunks.set(source.source_id, []);
}

export async function refreshBaseline(root) {
  const corpus = await readCorpus(root);
  const registryBytes = await readFile(await workspacePath(root, 'data/sources.json'));
  const authored = JSON.parse(registryBytes);
  assert.ok(Array.isArray(authored) && authored.length > 0 && authored.length <= 256, 'Registry must contain 1–256 sources');
  assert.equal(new Set(authored.map(source => source.source_id)).size, authored.length, 'Duplicate source id');
  for (const source of authored) assert.match(source.source_id, /^[a-z0-9-]+$/);
  return { corpus, authored, hash: digest(`${corpus.generation}\n${digest(registryBytes)}`) };
}

export function sourceChange(before, after, oldChunks, newChunks, details = {}) {
  const oldIds = new Set(oldChunks.map(chunk => chunk.id)); const newIds = new Set(newChunks.map(chunk => chunk.id));
  return { source_id: after.source_id, before: snapshot(before), after: snapshot(after),
    configuration_fields_changed: changedConfiguration(before, after),
    raw_changed: before?.content_hash !== after.content_hash,
    normalized_changed: before?.normalized_content_hash !== after.normalized_content_hash,
    chunks_before: oldChunks.length, chunks_after: newChunks.length,
    chunks_added: newChunks.filter(chunk => !oldIds.has(chunk.id)).length,
    chunks_removed: oldChunks.filter(chunk => !newIds.has(chunk.id)).length, ...details };
}

/** Acquisition writes only an ignored candidate tree. Approval/application is a separate operation. */
export async function stageRefresh(root, { output, sourceId, offline = false, fetchImpl,
  downloadOptions = {}, normalizeImpl = normalize, now = () => new Date().toISOString() } = {}) {
  output ??= `work/source-refresh/${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = await workspacePath(root, output);
  assert.ok(directory.startsWith(`${resolve(root, 'work/source-refresh')}${sep}`), 'Candidates must stay below work/source-refresh/');
  await mkdir(directory, { recursive: false }).catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(directory), { recursive: true }); await mkdir(directory);
  });
  const { corpus: active, authored, hash: baselineHash } = await refreshBaseline(root);
  if (sourceId) assert.ok(authored.some(source => source.source_id === sourceId), 'Unknown source id');
  const current = new Map(active.sources.map(source => [source.source_id, source]));
  const nextSources = authored.map(definition => {
    const source = { ...definition }; const previous = current.get(source.source_id);
    for (const field of generatedFields) { delete source[field]; if (previous && Object.hasOwn(previous, field)) source[field] = previous[field]; }
    source.status ??= 'unavailable'; return source;
  });
  const nextChunks = new Map(nextSources.map(source => [source.source_id, active.chunks.filter(chunk => chunk.source_id === source.source_id)]));
  const payload = [];
  const report = { schema_version: 1, status: 'acquiring', created_at: now(),
    note: 'Metadata only. Downloaded evidence remains in the local candidate and requires review before application.',
    base_generation: active.generation, base_hash: baselineHash, sources: [], removed_sources: active.sources.filter(source => !nextChunks.has(source.source_id)).map(source => source.source_id) };
  const saveReport = () => writeAtomic(resolve(directory, 'report.json'), json(report));
  await saveReport();
  for (const source of nextSources) {
    const previous = current.get(source.source_id); const oldChunks = nextChunks.get(source.source_id); const attemptedAt = now();
    const configurationChanged = changedConfiguration(previous, source).length > 0;
    if (sourceId && source.source_id !== sourceId || source.ingestion_method === 'live-query-only') {
      if (configurationChanged && oldChunks.length) withholdPreviousEvidence(source, nextChunks);
      if (configurationChanged) report.sources.push(sourceChange(previous, source, oldChunks, nextChunks.get(source.source_id), { result: 'configuration_only', withheld_previous_chunks: oldChunks.length }));
      continue;
    }
    let detail;
    try {
      let bytes; let http = {}; let attempts = 0;
      if (offline) {
        assert.ok(source.raw_path?.startsWith(`data/raw/${source.source_id}/`), 'No preserved raw snapshot');
        bytes = await readFile(await workspacePath(root, source.raw_path));
        assert.ok(bytes.length <= 30 * 1024 * 1024, 'Preserved source exceeds size cap');
        assert.equal(digest(bytes), source.content_hash, 'Preserved raw digest mismatch');
      } else {
        ({ bytes, http, attempts } = await fetchSource(source.fetch_url ?? source.canonical_url, {
          ...downloadOptions, ...(fetchImpl ? { fetchImpl } : {}), accept: source.source_type === 'html' ? 'text/html' : '*/*',
        }));
      }
      const normalized = await normalizeImpl(bytes, source);
      const rawHash = digest(bytes); const normalizedHash = digest(JSON.stringify(normalized.units));
      const retrievedAt = offline ? source.retrieval_date : attemptedAt;
      const chunks = chunkUnits(normalized, source, retrievedAt, rawHash);
      assert.ok(chunks.length, 'Normalization produced no evidence');
      const extension = ['arcgis', 'geojson'].includes(source.source_type) ? 'json' : source.source_type;
      assert.ok(['html', 'pdf', 'csv', 'json'].includes(extension), 'Unsupported snapshot type');
      const rawPath = `data/raw/${source.source_id}/${rawHash}.${extension}`;
      const normalizedBytes = json({ source_id: source.source_id, raw_content_hash: rawHash, ...normalized });
      const normalizedPath = `data/normalized/${source.source_id}/${rawHash}-${digest(normalizedBytes)}.json`;
      for (const [name, value] of [[rawPath, bytes], [normalizedPath, normalizedBytes]]) {
        const target = await workspacePath(directory, `payload/${name}`); await writeAtomic(target, value);
        payload.push({ path: name, sha256: digest(value), bytes: Buffer.byteLength(value) });
      }
      Object.assign(source, { ...http, retrieval_date: retrievedAt, source_updated_date: normalized.source_updated_date ?? source.source_updated_date ?? null,
        content_hash: rawHash, normalized_content_hash: normalizedHash, raw_path: rawPath, normalized_path: normalizedPath,
        status: 'available', last_attempt: attemptedAt, last_error: null });
      if (previous?.normalized_content_hash && previous.normalized_content_hash !== normalizedHash) source.content_changed_at = attemptedAt;
      nextChunks.set(source.source_id, chunks); detail = { result: 'acquired', bytes: bytes.length, attempts };
    } catch (error) {
      const code = errorCode(error);
      Object.assign(source, { status: 'unavailable', last_attempt: attemptedAt, last_error: code });
      if (configurationChanged && oldChunks.length) withholdPreviousEvidence(source, nextChunks);
      detail = { result: 'unavailable', error_code: code, retained_previous_evidence: nextChunks.get(source.source_id).length > 0,
        withheld_previous_chunks: configurationChanged ? oldChunks.length : 0 };
    }
    report.sources.push(sourceChange(previous, source, oldChunks, nextChunks.get(source.source_id), detail));
    await saveReport();
  }
  const corpus = validateCorpus(makeCorpus(nextSources, [...nextChunks.values()].flat()));
  await writeAtomic(resolve(directory, 'corpus.json'), json(corpus));
  Object.assign(report, { status: 'awaiting_review', completed_at: now(),
    generation: corpus.generation, failures: report.sources.filter(source => source.result === 'unavailable').length });
  const manifest = { schema_version: 1, base_hash: baselineHash, base_generation: active.generation,
    corpus_sha256: digest(json(corpus)), report_sha256: digest(json(report)), generation: corpus.generation, created_at: report.created_at, payload };
  const approvalHash = digest(json(manifest));
  await writeAtomic(resolve(directory, 'manifest.json'), json(manifest));
  report.candidate_sha256 = approvalHash;
  await saveReport();
  return { directory: relative(root, directory).split(sep).join('/'), candidate_sha256: approvalHash, report };
}

export async function inspectCandidate(root, directory, expectedApproval) {
  const candidateRoot = await workspacePath(root, directory);
  assert.ok(candidateRoot.startsWith(`${resolve(root, 'work/source-refresh')}${sep}`), 'Candidate must stay below work/source-refresh/');
  const bytes = await readFile(await workspacePath(candidateRoot, 'manifest.json'));
  const hash = digest(bytes); if (expectedApproval !== undefined) assert.equal(hash, expectedApproval, 'Reviewed candidate digest mismatch');
  const manifest = JSON.parse(bytes); assert.equal(manifest.schema_version, 1);
  const report = JSON.parse(await readFile(await workspacePath(candidateRoot, 'report.json'), 'utf8'));
  const { candidate_sha256: reportApproval, ...canonicalReport } = report;
  assert.equal(reportApproval, hash, 'Review report names another candidate');
  assert.equal(digest(json(canonicalReport)), manifest.report_sha256, 'Review report was modified after staging');
  const corpusBytes = await readFile(await workspacePath(candidateRoot, 'corpus.json'));
  assert.equal(digest(corpusBytes), manifest.corpus_sha256, 'Candidate corpus was modified after staging');
  const corpus = validateCorpus(JSON.parse(corpusBytes)); assert.equal(corpus.generation, manifest.generation);
  const paths = new Set();
  for (const file of manifest.payload) {
    assert.match(file.path, /^data\/(?:raw|normalized)\/[a-z0-9-]+\/[a-f0-9-]+\.(?:html|pdf|csv|json)$/);
    assert.ok(!paths.has(file.path), 'Duplicate candidate snapshot'); paths.add(file.path);
    const value = await readFile(await workspacePath(candidateRoot, `payload/${file.path}`));
    assert.equal(value.length, file.bytes, 'Candidate snapshot size changed'); assert.equal(digest(value), file.sha256, 'Candidate snapshot changed');
  }
  for (const source of corpus.sources.filter(source => source.raw_path)) {
    assert.ok(source.raw_path.startsWith(`data/raw/${source.source_id}/`), 'Raw provenance belongs to another source');
    const filename = paths.has(source.raw_path)
      ? await workspacePath(candidateRoot, `payload/${source.raw_path}`) : await workspacePath(root, source.raw_path);
    assert.equal(digest(await readFile(filename)), source.content_hash, 'Source raw snapshot and registry disagree');
  }
  return { candidateRoot, manifest, corpus, report, candidate_sha256: hash };
}

/** Validate/build the immutable candidate first. Failed validation leaves the active generation alone. */
export async function applyRefresh(root, { directory, approve, reviewer, validateAndBuild, checkpoint } = {}) {
  assert.match(approve ?? '', /^[a-f0-9]{64}$/, 'Pass the reviewed candidate SHA-256 with --approve');
  assert.ok(typeof reviewer === 'string' && reviewer.trim() && reviewer.length <= 200, 'Record --reviewer');
  assert.equal(typeof validateAndBuild, 'function', 'Application requires a validation and build step');
  const candidate = await inspectCandidate(root, directory, approve);
  assert.equal((await refreshBaseline(root)).hash, candidate.manifest.base_hash, 'Sources or active corpus changed after staging; stage again');
  const build = await validateAndBuild(candidate);
  assert.equal(build?.status, 'passed', 'Candidate validation/build did not pass');
  if (build.generation !== undefined) assert.equal(build.generation, candidate.corpus.generation, 'Build used another corpus generation');
  return withPublicationLock(root, async () => {
    await inspectCandidate(root, directory, approve);
    assert.equal((await refreshBaseline(root)).hash, candidate.manifest.base_hash, 'Sources or active corpus changed during build; stage again');
    for (const file of candidate.manifest.payload) {
      const source = await workspacePath(candidate.candidateRoot, `payload/${file.path}`);
      const destination = await workspacePath(root, file.path);
      try { assert.equal(digest(await readFile(destination)), file.sha256, 'Existing provenance snapshot differs'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await writeAtomic(destination, await readFile(source)); }
    }
    const publication = await publishCorpus(root, candidate.corpus, { expectedGeneration: candidate.manifest.base_generation, checkpoint });
    const receipt = { schema_version: 1, status: 'applied', applied_at: new Date().toISOString(), reviewer: reviewer.trim(), candidate_sha256: approve, ...publication,
      build, deployment: 'not_deployed', note: 'Restart local servers or deploy the verified build to serve this generation.' };
    await writeAtomic(await workspacePath(candidate.candidateRoot, 'application.json'), json(receipt));
    return receipt;
  });
}

export async function verifyPreservedSources(root, sourceId, { allowEmpty = false } = {}) {
  const corpus = await readCorpus(root); const report = { status: 'passed', sources: [] };
  if (sourceId) assert.ok(corpus.sources.some(source => source.source_id === sourceId), 'Unknown source id');
  for (const source of corpus.sources) {
    if (sourceId && source.source_id !== sourceId || source.ingestion_method === 'live-query-only') continue;
    const stored = corpus.chunks.filter(chunk => chunk.source_id === source.source_id);
    if (allowEmpty && source.status === 'unavailable' && !source.raw_path && stored.length === 0) {
      report.sources.push({ source_id: source.source_id, status: 'unavailable', chunks: 0 }); continue;
    }
    try {
      assert.ok(source.raw_path?.startsWith(`data/raw/${source.source_id}/`), 'No preserved snapshot');
      const bytes = await readFile(await workspacePath(root, source.raw_path));
      assert.equal(digest(bytes), source.content_hash, 'Raw snapshot digest mismatch');
      const normalized = await normalize(bytes, source); const chunks = chunkUnits(normalized, source, source.retrieval_date, source.content_hash);
      assert.deepEqual(chunks, stored, 'Preserved corpus differs');
      report.sources.push({ source_id: source.source_id, status: 'passed', chunks: chunks.length });
    } catch { report.status = 'failed'; report.sources.push({ source_id: source.source_id, status: 'failed', error_code: 'preserved_source_verification_failed' }); }
  }
  return report;
}
