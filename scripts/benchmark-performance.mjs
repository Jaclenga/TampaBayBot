import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { answerResidentQuestion } from '../src/lib/core/resident.mjs';
import { createTimings } from '../src/lib/performance/timing.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';
import { validateCitationIntegrity } from '../src/lib/citations/evidence.mjs';
import { makeDemoCorpus } from '../tests/fixtures/demo-corpus.mjs';

const { values } = parseArgs({ options: {
  corpus: { type: 'string' }, samples: { type: 'string', default: '100' },
  output: { type: 'string', default: 'work/performance/results.json' },
  compare: { type: 'string' },
} });
const samples = Number(values.samples);
if (!Number.isInteger(samples) || samples < 10 || samples > 1000) throw new Error('Use 10–1000 samples.');
const now = new Date('2026-11-16T12:00:00Z');
const corpus = values.corpus ? JSON.parse(await readFile(values.corpus, 'utf8')) : makeDemoCorpus(now);
const { sources, chunks } = corpus;
const config = parseLlmConfig({ LLM_PROVIDER: 'none' });
const queries = [
  ['greeting', 'hello'],
  ['housing', 'Where can I find rental assistance in Tampa?'],
  ['property', 'Find property records for 315 E Kennedy Blvd, Tampa.'],
  ['zoning', 'What are Tampa zoning rules for a duplex?'],
  ['permits', 'Do I need a permit to replace a water heater in Tampa?'],
  ['development', 'Where can I find development records in Tampa?'],
  ['followup', 'What documents do I need?'],
  ['unsupported', 'Write a song about the moon.'],
  ['ambiguous', 'Can I apply?'],
];
const seed = await answerResidentQuestion(queries[1][1], { sources, chunks, now, config, jurisdictionId: 'tampa' });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const percentile = (numbers, q) => [...numbers].sort((a,b) => a-b)[Math.ceil(numbers.length*q)-1] ?? null;
const summary = numbers => ({ p50Ms: percentile(numbers,.5), p95Ms: percentile(numbers,.95) });
const results = [];
for (const [category, question] of queries) {
  const options = { sources, chunks, now, config, jurisdictionId: 'tampa', ...(category === 'followup' ? { conversation: seed.conversation } : {}) };
  // First invocation is reported separately; warm samples never cache questions/answers.
  const runs = [];
  let first, last;
  for (let i = 0; i <= samples; i++) {
    const timings = createTimings();
    const stop = timings.start('total');
    const answer = await answerResidentQuestion(question, { ...options, timings });
    stop();
    const row = timings.snapshot();
    if (!i) first = row; else runs.push(row);
    last = answer;
    if (!validateCitationIntegrity(answer, { sources, chunks, now }).valid) throw new Error(`Invalid citations: ${category}`);
  }
  const stages = [...new Set(runs.flatMap(row => Object.keys(row)))];
  results.push({ category, firstMs: first.total, stages: Object.fromEntries(stages.map(stage => [stage, summary(runs.map(row => row[stage] ?? 0))])),
    status: last.status, evidenceIds: last.evidence.map(item => `${item.source_id}/${item.chunk_id}`),
    outputHash: hash({ answer: last.answer, evidence: last.evidence, status: last.status, conversation: last.conversation }),
    citationValidity: 1, errors: 0, ttftMs: null });
}
const report = { mode: 'offline in-process; model disabled; no government network calls', samplesPerCategory: samples,
  runtime: process.version, corpus: { sources: sources.length, chunks: chunks.length, digest: hash(corpus) },
  note: 'First call is not an isolate cold-start measurement. Nested stage timings overlap. Property category measures chat navigation, not a GIS lookup. TTFT is unavailable for completed JSON responses.', results };
if (values.compare) {
  const before = JSON.parse(await readFile(values.compare, 'utf8'));
  if (before.corpus.digest !== report.corpus.digest) throw new Error('Compare the same corpus and verification date.');
  report.comparison = results.map(row => {
    const baseline = before.results.find(item => item.category === row.category);
    if (!baseline) throw new Error('Baseline category missing.');
    const unchanged = baseline.outputHash === row.outputHash;
    if (row.category !== 'greeting' && !unchanged) throw new Error(`Answer or evidence changed: ${row.category}`);
    return { category: row.category, unchanged, before: baseline.stages.total, after: row.stages.total };
  });
}
await mkdir(dirname(values.output), { recursive: true });
await writeFile(values.output, JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ output: values.output, results: results.map(row => ({ category: row.category, ...row.stages.total, status: row.status })) }, null, 2));
