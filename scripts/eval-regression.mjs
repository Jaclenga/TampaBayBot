import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolveOutput, prepareOutputDirectory } from '../evaluation/suite/runner.mjs';
import { regressionDataset, runRegression, buildRegressionReport, regressionMarkdown,
  REGRESSION_CATEGORIES } from '../evaluation/regression.mjs';

const parseRate = value => {
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(String(value)))
    throw new Error('Thresholds must be numbers between 0 and 1.');
  return Number(value);
};

export function parseRegressionArguments(args) {
  const options = { minimumOverall: 1, minimumCategories: {},
    output: 'work/evals/regression' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') { options.help = true; continue; }
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    if (flag === '--min-overall') {
      if (seen.has(flag)) throw new Error('Duplicate overall threshold.');
      options.minimumOverall = parseRate(value);
    } else if (flag === '--min-category') {
      const match = /^([a-z_]+)=(.+)$/.exec(value);
      if (!match || !REGRESSION_CATEGORIES.includes(match[1]) ||
          Object.hasOwn(options.minimumCategories, match[1]))
        throw new Error('Invalid or duplicate category threshold.');
      options.minimumCategories[match[1]] = parseRate(match[2]);
    } else if (flag === '--output') {
      if (seen.has(flag)) throw new Error('Duplicate output directory.');
      options.output = value;
    } else throw new Error(`Unknown evaluation option: ${flag}.`);
    seen.add(flag);
  }
  return options;
}

async function atomicWrite(destination, text) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, text);
  await fs.rename(temporary, destination);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseRegressionArguments(args);
  if (options.help) {
    console.log('Offline regression: npm run eval:regression -- [--min-overall 0..1] [--min-category category=0..1] [--output work/evals/name]');
    return 0;
  }
  const destination = await prepareOutputDirectory(resolveOutput(options.output));
  const rows = await runRegression({ dataset: regressionDataset });
  const report = buildRegressionReport(rows, { dataset: regressionDataset,
    minimumOverall: options.minimumOverall,
    minimumCategories: options.minimumCategories });
  await atomicWrite(path.join(destination, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  await atomicWrite(path.join(destination, 'latest.md'), regressionMarkdown(report));
  console.log(JSON.stringify({ status: report.status, ...report.summary,
    output: options.output }, null, 2));
  return report.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Evaluation configuration error: ${error.message}`);
    process.exitCode = 2;
  });
