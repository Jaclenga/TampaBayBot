import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { stageRefresh, verifyPreservedSources } from '../src/lib/ingestion/refresh.mjs';
import { json, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' }, offline: { type: 'boolean' }, check: { type: 'boolean' } }, strict: true });
if (values.check) {
  const report = await verifyPreservedSources(root, values.source);
  await writeAtomic(await workspacePath(root, 'data/verification-report.json'), json(report));
  console.log(json(report)); if (report.status !== 'passed') process.exitCode = 1;
} else {
  const result = await stageRefresh(root, { sourceId: values.source, output: values.output, offline: values.offline });
  console.log(json({ candidate: result.directory, candidate_sha256: result.candidate_sha256,
    status: result.report.status, failures: result.report.failures, next: `npm run source:review -- --candidate ${result.directory}` }));
  if (result.report.failures) process.exitCode = 1;
}
