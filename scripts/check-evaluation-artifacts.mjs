/** Prevent private evaluation packets from entering a normal source commit. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
export const PRIVATE_EVALUATION_FILES = [
  'evaluation/results/responses.json',
  'evaluation/agent-audit/responses.json',
  'evaluation/human-audit/responses.json',
];

function assertEmptyArray(bytes, name, location) {
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`${name} must be an empty JSON array in the ${location}.`); }
  assert.ok(Array.isArray(value) && value.length === 0,
    `${name} must be an empty JSON array in the ${location}.`);
}

export async function checkEvaluationArtifacts(root) {
  for (const name of PRIVATE_EVALUATION_FILES) {
    let working;
    try { working = await readFile(resolve(root, name)); }
    catch { throw new Error(`${name} is missing from the working tree.`); }
    assertEmptyArray(working, name, 'working tree');

    let staged;
    try {
      ({ stdout: staged } = await run('git', ['show', `:${name}`], {
        cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024,
      }));
    } catch {
      throw new Error(`${name} is missing or unreadable in the Git index.`);
    }
    assertEmptyArray(staged, name, 'Git index');
  }
  return { status: 'passed', checked: PRIVATE_EVALUATION_FILES.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkEvaluationArtifacts(resolve('.'));
  console.log(`Evaluation response artifact check passed (${result.checked} files).`);
}
