import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditResourceFreshness, freshnessMarkdown } from '../src/lib/ingestion/resource-freshness.mjs';
import { json, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function options(args) {
  const result = { live: false, allowNetwork: false, output: 'work/resource-freshness/latest', sourceStageReport: null };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--live') result.live = true;
    else if (arg === '--allow-network') result.allowNetwork = true;
    else if (arg === '--output' && args[index + 1]) result.output = args[++index];
    else if (arg === '--source-stage-report' && args[index + 1]) result.sourceStageReport = args[++index];
    else if (arg === '--help') { result.help = true; }
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  if (!result.help && result.live !== result.allowNetwork) throw new Error('Live checks require both --live and --allow-network');
  return result;
}

async function main() {
  const choice = options(process.argv.slice(2));
  if (choice.help) {
    process.stdout.write('Usage: npm run resource:freshness -- [--live --allow-network] [--source-stage-report work/source-refresh/<run>/report.json] [--output work/resource-freshness/<run>]\n');
    return;
  }
  const output = await workspacePath(root, choice.output);
  if (!output.startsWith(`${resolve(root, 'work/resource-freshness')}${sep}`)) throw new Error('Output must stay under work/resource-freshness/');
  let sourceStageReport = null;
  let missingStageReport = false;
  if (choice.sourceStageReport) {
    const stagePath = await workspacePath(root, choice.sourceStageReport);
    if (!stagePath.startsWith(`${resolve(root, 'work/source-refresh')}${sep}`) || !stagePath.endsWith(`${sep}report.json`)) {
      throw new Error('Stage report must be a report.json under work/source-refresh/');
    }
    try { sourceStageReport = JSON.parse(await readFile(stagePath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') missingStageReport = true; else throw error; }
    if (sourceStageReport && (sourceStageReport.schema_version !== 1 || !Array.isArray(sourceStageReport.sources))) throw new Error('Invalid source stage report');
  }
  const directory = JSON.parse(await readFile(await workspacePath(root, 'pages-demo/src/housing-resources.json'), 'utf8'));
  const sources = JSON.parse(await readFile(await workspacePath(root, 'data/sources.json'), 'utf8'));
  const report = await auditResourceFreshness({ directory, sources, sourceStageReport, live: choice.live });
  if (missingStageReport) report.limitations.push('Source stage report was unavailable; RAG content-change comparison did not run.');
  await writeAtomic(resolve(output, 'report.json'), json(report));
  await writeAtomic(resolve(output, 'report.md'), freshnessMarkdown(report));
  process.stdout.write(`Resource freshness: ${report.summary.resources_needing_attention}/${report.summary.resources} need attention; ${report.summary.unique_links_checked} unique links checked.\n`);
  process.stdout.write(`Report: ${choice.output}/report.md\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
