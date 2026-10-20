import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditResourceFreshness, freshnessMarkdown, resourceRecords } from '../src/lib/ingestion/resource-freshness.mjs';
import { operationalResourceRecords } from '../src/lib/ingestion/external-resource-registry.mjs';
import { json, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function options(args) {
  const result = { live: false, allowNetwork: false, failOnActionable: false,
    output: 'work/resource-freshness/latest', sourceStageReport: null,
    concurrency: 4, hostIntervalMs: 1000, reviewGraceDays: 7,
    maxAttempts: 3, timeoutMs: 8000, totalTimeoutMs: 30000 };
  const integers = new Map([['--concurrency', 'concurrency'], ['--host-interval-ms', 'hostIntervalMs'],
    ['--review-grace-days', 'reviewGraceDays'], ['--max-attempts', 'maxAttempts'],
    ['--timeout-ms', 'timeoutMs'], ['--total-timeout-ms', 'totalTimeoutMs']]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--live') result.live = true;
    else if (arg === '--allow-network') result.allowNetwork = true;
    else if (arg === '--fail-on-actionable') result.failOnActionable = true;
    else if (arg === '--output' && args[index + 1]) result.output = args[++index];
    else if (arg === '--source-stage-report' && args[index + 1]) result.sourceStageReport = args[++index];
    else if (integers.has(arg) && args[index + 1] && /^\d+$/.test(args[index + 1])) {
      result[integers.get(arg)] = Number(args[++index]);
    }
    else if (arg === '--help') { result.help = true; }
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  if (!result.help && result.live !== result.allowNetwork) throw new Error('Live checks require both --live and --allow-network');
  if (!result.help && result.failOnActionable && !result.live) throw new Error('--fail-on-actionable requires live checks');
  return result;
}

async function main() {
  const choice = options(process.argv.slice(2));
  if (choice.help) {
    process.stdout.write('Usage: npm run resource:freshness -- [--live --allow-network] [--source-stage-report work/source-refresh/<run>/report.json] [--output work/resource-freshness/<run>] [--concurrency 4] [--host-interval-ms 1000] [--max-attempts 3] [--timeout-ms 8000] [--total-timeout-ms 30000] [--review-grace-days 7] [--fail-on-actionable]\n');
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
  const gisConfig = JSON.parse(await readFile(await workspacePath(root, 'data/gis-config.json'), 'utf8'));
  const developmentConfig = JSON.parse(await readFile(await workspacePath(root, 'data/development-config.json'), 'utf8'));
  const existingUrls = resourceRecords(directory, sources).flatMap(record => record.links.map(link => link.url));
  const operationalRecords = operationalResourceRecords({ gisConfig, developmentConfig, existingUrls });
  const report = await auditResourceFreshness({ directory, sources, operationalRecords,
    sourceStageReport, live: choice.live, concurrency: choice.concurrency,
    hostIntervalMs: choice.hostIntervalMs, reviewGraceDays: choice.reviewGraceDays,
    checkOptions: { maxAttempts: choice.maxAttempts, timeoutMs: choice.timeoutMs,
      totalTimeoutMs: choice.totalTimeoutMs } });
  if (missingStageReport) report.limitations.push('Source stage report was unavailable; RAG content-change comparison did not run.');
  await writeAtomic(resolve(output, 'report.json'), json(report));
  await writeAtomic(resolve(output, 'report.md'), freshnessMarkdown(report));
  process.stdout.write(`Resource freshness: ${report.summary.resources_needing_attention}/${report.summary.resources} need attention; ${report.summary.unique_links_checked} unique links checked.\n`);
  process.stdout.write(`Actionable findings: ${report.summary.actionable_findings}.\n`);
  process.stdout.write(`Report: ${choice.output}/report.md\n`);
  if (choice.failOnActionable && report.actionable.length) process.exitCode = 2;
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
