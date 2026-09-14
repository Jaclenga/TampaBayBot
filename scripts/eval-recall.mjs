import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readCorpus, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { evaluateProgramRecall, recallMarkdown } from '../evaluation/recall.mjs';
import { PROJECT_ROOT, resolveOutput, prepareOutputDirectory, writeJsonArtifact } from '../evaluation/suite/runner.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const HELP = `Measure applicable-program recall without network or model calls.

  npm run eval:recall -- --corpus-root <checkout-with-reviewed-data>
  npm run eval:recall -- --benchmark evaluation/program-recall-benchmark.json --output work/evals/recall
  npm run eval:recall -- --strict

The active checkout is the default corpus root. An empty source-only corpus is
not evaluable. The benchmark pins its date and source passage hashes; changed
passages require label review. Reports contain IDs and metrics, not source text.
Exit 0: measurement completed (omissions may exist); 1: --strict completeness
or control failure; 2: incomplete corpus, execution failure or invalid inputs.
`;

export function parseRecallArguments(args) {
  const flags = { corpusRoot: '.', benchmark: 'evaluation/program-recall-benchmark.json', output: 'work/evals/recall', strict: false };
  const valued = { '--corpus-root': 'corpusRoot', '--benchmark': 'benchmark', '--output': 'output' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (seen.has(key)) throw new Error('Duplicate recall option');
    seen.add(key);
    if (key === '--help') flags.help = true;
    else if (key === '--strict') flags.strict = true;
    else {
      if (!Object.hasOwn(valued, key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Unknown recall option or missing value');
      flags[valued[key]] = args[++i];
    }
  }
  return flags;
}

async function implementationHash() {
  const parts = [];
  async function visit(relative) {
    for (const entry of (await fs.readdir(path.join(PROJECT_ROOT, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(name);
      else if (entry.name.endsWith('.mjs')) parts.push([name, sha(await fs.readFile(path.join(PROJECT_ROOT, name)))]);
    }
  }
  await visit('src/lib');
  return sha(JSON.stringify(parts));
}

export async function main(args = process.argv.slice(2)) {
  const flags = parseRecallArguments(args);
  if (flags.help) { console.log(HELP); return 0; }
  const output = resolveOutput(flags.output);
  const work = path.join(PROJECT_ROOT, 'work');
  const relative = path.relative(work, output);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Recall reports must remain under ignored work/');
  await workspacePath(PROJECT_ROOT, path.relative(PROJECT_ROOT, output));
  await prepareOutputDirectory(output);
  const corpus = await readCorpus(path.resolve(PROJECT_ROOT, flags.corpusRoot));
  const benchmarkBytes = await fs.readFile(path.resolve(PROJECT_ROOT, flags.benchmark));
  const benchmark = JSON.parse(benchmarkBytes);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network is disabled in program recall evaluation'); };
  let report;
  try { report = await evaluateProgramRecall({ benchmark, sources: corpus.sources, chunks: corpus.chunks }); }
  finally { globalThis.fetch = originalFetch; }
  report.provenance = {
    generatedAt: new Date().toISOString(), evaluatedAsOf: benchmark.reference_date,
    corpusGeneration: corpus.generation, sourcesHash: sha(JSON.stringify(corpus.sources)), chunksHash: sha(JSON.stringify(corpus.chunks)),
    benchmarkHash: sha(benchmarkBytes), evaluatorHash: sha(await fs.readFile(new URL('../evaluation/recall.mjs', import.meta.url))),
    implementationHash: await implementationHash(), runnerHash: sha(await fs.readFile(new URL('./eval-recall.mjs', import.meta.url))),
    nodeVersion: process.version, outboundFetch: 'disabled', model: 'none',
  };
  await writeJsonArtifact(report, 'latest.json', output);
  await writeAtomic(path.join(output, 'latest.md'), recallMarkdown(report));
  console.log(JSON.stringify({ status: report.status, ...report.summary, stages: report.stages,
    output: path.relative(PROJECT_ROOT, output).split(path.sep).join('/') }, null, 2));
  if (report.status !== 'measured') return 2;
  if (flags.strict && (report.stages[`retrieval_at_${report.productionRetrievalLimit}`].casesWithOmissions ||
    report.stages.answer_evidence.casesWithOmissions || report.summary.controlsPassed !== report.summary.controls)) return 1;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await main(); }
  catch (error) {
    console.error(error.code === 'ERR_ASSERTION' ? error.message : 'Recall evaluation could not complete. Check corpus, benchmark and output options.');
    process.exitCode = 2;
  }
}
