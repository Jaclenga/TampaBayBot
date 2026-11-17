import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..', 'work/source-refresh');
const reports = [];
try {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const report = JSON.parse(await readFile(resolve(root, entry.name, 'automatic-report.json'), 'utf8'));
      if (report.schema_version === 1 && Array.isArray(report.sources)) reports.push(report);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const report = reports.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
console.log('### Automatic source checks\n');
if (!report) console.log('No completed policy report. Inspect the failed acquisition/validation step; no successful publication is implied.');
else {
  console.log('These decisions describe acquisition policy, not factual verification or deployment success.\n');
  console.log('| Source | Action | Reason |\n| --- | --- | --- |');
  for (const item of report.sources) {
    if (![item.source_id, item.action, item.reason].every(value => typeof value === 'string' && /^[a-z0-9_-]+$/.test(value))) throw new Error('Unsafe automatic summary metadata');
    console.log(`| ${item.source_id} | ${item.action} | ${item.reason} |`);
  }
}
