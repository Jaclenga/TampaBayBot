/** Offline source regressions are explicit; historical corpus tests stay separate. */
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
const corpusDependent = new Set(['answers.test.mjs', 'coverage.test.mjs', 'evaluation-runner.test.mjs', 'evaluation-quality.test.mjs', 'evaluation-metamorphic.test.mjs', 'guardrails.test.mjs']);
const tests = (await readdir(new URL('../tests/', import.meta.url))).filter(name => name.endsWith('.test.mjs') && !corpusDependent.has(name)).sort().map(name => `tests/${name}`);
const ingestion = (await readdir(new URL('../src/lib/ingestion/', import.meta.url))).filter(name => name.endsWith('.test.mjs') && name !== 'normalize-corpus.test.mjs').sort().map(name => `src/lib/ingestion/${name}`);
const child = spawn(process.execPath, ['--test', '--test-isolation=none', ...tests, ...ingestion], { cwd: new URL('../', import.meta.url), windowsHide: true, stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
