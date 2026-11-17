import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { evidenceSafetyReason, isAuthoritative } from '../retrieval/eligibility.mjs';
import { digest, json, makeCorpus, workspacePath, writeAtomic } from './generation.mjs';
import { inspectCandidate, refreshBaseline, sourceChange } from './refresh.mjs';

const highImpact = /\b(?:evict\w*|foreclos\w*|eligib\w*|funding|income|deadline|statut\w*|legal|court|fee|fees|rent|assistance|benefits?|desalojo|elegib\w*|ingresos|plazos?|tribunal\w*|alquiler|financiamiento|fondos|subsidios?|asistencia|requisitos|tarifas?|\d+\s+d[i\u00ed]as?|applications?\s+(?:open|closed)|\d+\s+(?:business\s+)?days?)\b|[$%§]/iu;
const meaningfulChunk = chunk => {
  const meaning = { ...chunk };
  delete meaning.retrieved_at;
  delete meaning.raw_content_hash;
  return meaning;
};

export function validateAutomaticPolicy(policy) {
  assert.equal(policy?.schema_version, 1, 'Unsupported automatic-refresh policy');
  assert.ok(Array.isArray(policy.allowed_origins) && policy.allowed_origins.length > 0);
  for (const origin of policy.allowed_origins) {
    const url = new URL(origin);
    assert.ok(url.protocol === 'https:' && url.origin === origin && !url.username && !url.password, 'Policy requires exact HTTPS origins');
  }
  assert.ok(policy.content_updates && typeof policy.content_updates === 'object' && !Array.isArray(policy.content_updates));
  for (const [id, rule] of Object.entries(policy.content_updates)) {
    assert.match(id, /^[a-z0-9-]+$/);
    const url = new URL(rule.url);
    assert.ok(policy.allowed_origins.includes(url.origin) && !url.username && !url.password && !url.hash);
    assert.equal(typeof rule.allow_initial, 'boolean');
    assert.ok(Number.isInteger(rule.max_chunks) && rule.max_chunks > 0 && rule.max_chunks <= 1000);
    assert.ok(Number.isFinite(rule.max_change_ratio) && rule.max_change_ratio > 0 && rule.max_change_ratio <= 1);
  }
  return policy;
}

/** Deterministic policy, never an LLM approval or a claim of factual verification. */
export function automaticDecision(before, after, oldChunks, newChunks, change, policy) {
  if (change?.result !== 'acquired' || after.status !== 'available') return 'acquisition_failed';
  if (!before || change.configuration_fields_changed?.length) return 'registry_change';
  if (!isAuthoritative(after)) return 'non_authoritative';
  const urls = [after.canonical_url, after.fetch_url ?? after.canonical_url, after.response_url ?? after.fetch_url ?? after.canonical_url];
  if (urls.some(value => {
    try { const url = new URL(value); return url.protocol !== 'https:' || url.username || url.password || !policy.allowed_origins.includes(url.origin); }
    catch { return true; }
  })) return 'unapproved_origin';
  if (urls[2] !== urls[1]) return 'unexpected_response_url';
  if (after.known_issues?.length) return 'known_source_conflict';
  if (!newChunks.length || newChunks.some(chunk => evidenceSafetyReason(after, chunk))) return 'unsafe_or_empty_evidence';
  // Unchanged text alone is insufficient: derived facts, links and locators must
  // also match. Only actual acquisition dates and raw snapshot hashes may differ.
  if (before.normalized_content_hash === after.normalized_content_hash && oldChunks.length &&
      JSON.stringify(oldChunks.map(meaningfulChunk)) === JSON.stringify(newChunks.map(meaningfulChunk))) return 'unchanged';
  const rule = policy.content_updates[after.source_id];
  if (!rule || after.canonical_url !== rule.url || (after.fetch_url && after.fetch_url !== rule.url)) return 'substantive_review_needed';
  if (!oldChunks.length && !rule.allow_initial) return 'baseline_missing';
  if (newChunks.length > rule.max_chunks) return 'unexpected_document_size';
  if (highImpact.test([...oldChunks, ...newChunks].map(chunk => [chunk.title, chunk.section, chunk.text].join(' ')).join('\n'))) return 'safety_sensitive_change';
  const oldText = new Set(oldChunks.map(chunk => chunk.content_hash));
  const newText = new Set(newChunks.map(chunk => chunk.content_hash));
  const changed = [...oldText].filter(hash => !newText.has(hash)).length + [...newText].filter(hash => !oldText.has(hash)).length;
  if (oldChunks.length && changed / (oldText.size + newText.size) > rule.max_change_ratio) return 'unexpected_content_change';
  return oldChunks.length ? 'approved_content_update' : 'approved_initial_acquisition';
}

/** Derive a separate immutable candidate; rejected content never enters its payload. */
export async function prepareAutomaticRefresh(root, { directory, output, policy, now = () => new Date().toISOString() } = {}) {
  validateAutomaticPolicy(policy);
  const staged = await inspectCandidate(root, directory);
  const baseline = await refreshBaseline(root);
  assert.equal(staged.manifest.base_hash, baseline.hash, 'Baseline changed after acquisition');
  const authored = new Map(baseline.authored.map(source => [source.source_id, source]));
  // An unattended publication must never overwrite operator registry edits.
  const reviewFields = ['last_content_reviewed_at', 'review_status', 'next_review_at', 'last_link_checked_at', 'link_status', 'known_issues', 'review_notes'];
  const registryChanged = baseline.corpus.sources.length !== baseline.authored.length ||
    baseline.corpus.sources.some(source => {
      const definition = authored.get(source.source_id);
      return !definition || sourceChange(source, definition, [], []).configuration_fields_changed.length > 0 ||
        reviewFields.some(key => JSON.stringify(source[key]) !== JSON.stringify(definition[key]));
    });
  const byId = new Map(staged.corpus.sources.map(source => [source.source_id, source]));
  const changes = new Map(staged.report.sources.map(change => [change.source_id, change]));
  const accepted = new Set();
  const decisions = baseline.corpus.sources.map(before => {
    const after = byId.get(before.source_id);
    const oldChunks = baseline.corpus.chunks.filter(chunk => chunk.source_id === before.source_id);
    const newChunks = staged.corpus.chunks.filter(chunk => chunk.source_id === before.source_id);
    const reason = registryChanged || !after ? 'registry_change' : changes.has(before.source_id)
      ? automaticDecision(before, after, oldChunks, newChunks, changes.get(before.source_id), policy) : 'not_selected';
    const eligible = ['unchanged', 'approved_content_update', 'approved_initial_acquisition'].includes(reason);
    if (eligible) accepted.add(before.source_id);
    return { source_id: before.source_id, action: eligible ? 'auto_refresh' : reason === 'not_selected' ? 'unchanged' : 'review', reason };
  });
  const decision = { schema_version: 1, created_at: now(), policy_sha256: digest(json(policy)),
    staged_candidate_sha256: staged.candidate_sha256, base_generation: baseline.corpus.generation,
    status: accepted.size ? 'eligible' : 'no_eligible_updates', sources: decisions,
    note: 'Machine acquisition checks only. Substantive verification dates and known issues are never cleared by automation.' };
  if (!accepted.size) return { decision, candidate: null };
  assert.ok(output, 'Supply a new automatic candidate output');
  const destination = await workspacePath(root, output);
  assert.ok(destination.startsWith(`${resolve(root, 'work/source-refresh')}${sep}`));
  await mkdir(destination, { recursive: false });
  const sources = baseline.corpus.sources.map(before => accepted.has(before.source_id) ? byId.get(before.source_id) : before);
  const chunks = sources.flatMap(source => (accepted.has(source.source_id) ? staged.corpus : baseline.corpus).chunks.filter(chunk => chunk.source_id === source.source_id));
  const corpus = makeCorpus(sources, chunks);
  const selectedPaths = new Set(sources.filter(source => accepted.has(source.source_id)).flatMap(source => [source.raw_path, source.normalized_path]));
  const payload = staged.manifest.payload.filter(file => selectedPaths.has(file.path));
  for (const file of payload) {
    await writeAtomic(await workspacePath(destination, `payload/${file.path}`), await readFile(await workspacePath(staged.candidateRoot, `payload/${file.path}`)));
  }
  const report = { schema_version: 1, status: 'awaiting_review', created_at: decision.created_at,
    completed_at: now(), base_hash: baseline.hash, base_generation: baseline.corpus.generation,
    generation: corpus.generation, failures: 0, removed_sources: [], automatic: decision,
    sources: sources.filter(source => accepted.has(source.source_id)).map(source => sourceChange(
      baseline.corpus.sources.find(old => old.source_id === source.source_id), source,
      baseline.corpus.chunks.filter(chunk => chunk.source_id === source.source_id),
      corpus.chunks.filter(chunk => chunk.source_id === source.source_id), { result: 'acquired' })) };
  const manifest = { schema_version: 1, base_hash: baseline.hash, base_generation: baseline.corpus.generation,
    corpus_sha256: digest(json(corpus)), report_sha256: digest(json(report)), generation: corpus.generation,
    created_at: decision.created_at, payload };
  const approval = digest(json(manifest));
  await writeAtomic(await workspacePath(destination, 'corpus.json'), json(corpus));
  await writeAtomic(await workspacePath(destination, 'manifest.json'), json(manifest));
  await writeAtomic(await workspacePath(destination, 'report.json'), json({ ...report, candidate_sha256: approval }));
  return { decision, candidate: { directory: relative(root, destination).split(sep).join('/'), candidate_sha256: approval } };
}
