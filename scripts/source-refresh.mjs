import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { applyRefresh, inspectCandidate, stageRefresh } from '../src/lib/ingestion/refresh.mjs';
import { json, readCorpus, recoverPublication, rollbackCorpus, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { buildReviewedCandidate, deployReviewedBuild } from './build-source-refresh.mjs';

const root = resolve(import.meta.dirname, '..');
const [command, ...args] = process.argv.slice(2);
const { values } = parseArgs({ args, options: {
  output: { type: 'string' }, source: { type: 'string' }, offline: { type: 'boolean' }, candidate: { type: 'string' },
  approve: { type: 'string' }, reviewer: { type: 'string' }, 'worker-name': { type: 'string' },
  'local-diff': { type: 'boolean' }, deploy: { type: 'boolean' }, generation: { type: 'string' }, 'expect-current': { type: 'string' },
}, strict: true });

if (command === 'stage') {
  const result = await stageRefresh(root, { output: values.output, sourceId: values.source, offline: values.offline });
  console.log(json({ candidate: result.directory, candidate_sha256: result.candidate_sha256, ...result.report }));
  if (result.report.failures) process.exitCode = 1;
} else if (command === 'review') {
  assert.ok(values.candidate, 'Pass --candidate work/source-refresh/<directory>');
  const candidate = await inspectCandidate(root, values.candidate);
  const report = candidate.report;
  console.log(json({ ...report, verified_candidate_sha256: candidate.candidate_sha256 }));
  if (values['local-diff']) {
    const previous = await readCorpus(root); const lines = ['# Local source review', '',
      `Candidate: ${candidate.candidate_sha256}`, '', 'Downloaded excerpts below are untrusted source material for local review. Do not upload this file as the metadata-only scheduled artifact.', ''];
    for (const source of candidate.corpus.sources) {
      const oldChunks = previous.chunks.filter(chunk => chunk.source_id === source.source_id);
      const newChunks = candidate.corpus.chunks.filter(chunk => chunk.source_id === source.source_id);
      const oldIds = new Set(oldChunks.map(chunk => chunk.id)); const newIds = new Set(newChunks.map(chunk => chunk.id));
      const added = newChunks.filter(chunk => !oldIds.has(chunk.id)); const removed = oldChunks.filter(chunk => !newIds.has(chunk.id));
      if (!added.length && !removed.length) continue;
      lines.push(`## ${source.source_id}`, '', `Added: ${added.length}; removed: ${removed.length}. Showing at most 20 of each; inspect corpus.json and payload for the complete candidate.`, '');
      for (const [label, chunks] of [['Removed', removed], ['Added', added]]) for (const chunk of chunks.slice(0, 20)) lines.push(`### ${label}: ${chunk.id}`, '', ...chunk.text.split('\n').map(line => `> ${line}`), '');
    }
    const filename = await workspacePath(candidate.candidateRoot, 'review-local.md');
    await writeAtomic(filename, lines.join('\n'));
    console.log(`Local review: ${relative(root, filename)}`);
  }
} else if (command === 'apply') {
  const receipt = await applyRefresh(root, { directory: values.candidate, approve: values.approve, reviewer: values.reviewer,
    validateAndBuild: candidate => buildReviewedCandidate(root, candidate, { workerName: values['worker-name'] }) });
  if (values.deploy) {
    const filename = await workspacePath(root, `${values.candidate}/application.json`);
    try { receipt.deployment = await deployReviewedBuild(root, receipt); }
    catch { receipt.deployment = { status: 'failed', note: 'The reviewed local corpus was applied. Inspect the operator deployment output and retry deployment or roll back explicitly.' }; process.exitCode = 1; }
    await writeAtomic(filename, json(receipt));
  }
  console.log(json(receipt));
} else if (command === 'rollback') {
  console.log(json(await rollbackCorpus(root, values.generation, values['expect-current'])));
} else if (command === 'recover') {
  console.log(json(await recoverPublication(root)));
} else throw new Error('Usage: source-refresh.mjs stage|review|apply|rollback|recover [options]. See docs/SOURCE_UPDATES.md.');
