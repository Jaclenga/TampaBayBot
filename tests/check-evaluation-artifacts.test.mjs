import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { checkEvaluationArtifacts, PRIVATE_EVALUATION_FILES } from '../scripts/check-evaluation-artifacts.mjs';

const run = promisify(execFile);

test('private evaluation packets are rejected from the working tree and Git index', async () => {
  const work = path.resolve('work');
  await mkdir(work, { recursive: true });
  const root = await mkdtemp(path.join(work, 'artifact-check-'));
  try {
    await run('git', ['init', '-q'], { cwd: root });
    for (const name of PRIVATE_EVALUATION_FILES) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), '[]\n');
    }
    await assert.rejects(checkEvaluationArtifacts(root), /Git index/);
    await run('git', ['add', '--', ...PRIVATE_EVALUATION_FILES], { cwd: root });
    assert.deepEqual(await checkEvaluationArtifacts(root), { status: 'passed', checked: 3 });

    const target = path.join(root, PRIVATE_EVALUATION_FILES[1]);
    await writeFile(target, JSON.stringify([{ question: 'private fixture' }]));
    await assert.rejects(checkEvaluationArtifacts(root), /working tree/);
    await run('git', ['add', '--', PRIVATE_EVALUATION_FILES[1]], { cwd: root });
    await writeFile(target, '[]\n');
    await assert.rejects(checkEvaluationArtifacts(root), /Git index/);
    await run('git', ['add', '--', PRIVATE_EVALUATION_FILES[1]], { cwd: root });

    await writeFile(target, '{broken');
    await assert.rejects(checkEvaluationArtifacts(root), /working tree/);
    await writeFile(target, '[]\n');
    assert.deepEqual(await checkEvaluationArtifacts(root), { status: 'passed', checked: 3 });
    assert.equal(await readFile(target, 'utf8'), '[]\n');
  } finally {
    assert.ok(root.startsWith(work + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
