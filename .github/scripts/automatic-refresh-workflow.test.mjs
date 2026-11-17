import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('hosted automation only uploads encrypted checkpoints and saves them before deployment', async () => {
  const workflow = await readFile(new URL('../workflows/source-auto-refresh.yml', import.meta.url), 'utf8');
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(workflow, /self-hosted|clean: false|pull_request/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /--apply --prepare-deploy --worker-name/);
  assert.match(workflow, /--resume-deployment --worker-name/);
  assert.match(workflow, /steps.checkpoint.outcome == 'success'/);
  assert.match(workflow, /steps.restore.outcome == 'success'/);
  assert.match(workflow, /TAMPABAYBOT_SOURCE_STATE_KEY/);
  const uploads = [...workflow.matchAll(/path: (work\/source-state\/[^\n]+)/g)].map(match => match[1].trim());
  assert.deepEqual(uploads, ['work/source-state/input', 'work/source-state/checkpoint/source-state.enc', 'work/source-state/final/source-state.enc']);
  assert.ok(workflow.indexOf('Persist the checkpoint before deploying') < workflow.indexOf('Publish the checkpointed artifact'));
});
