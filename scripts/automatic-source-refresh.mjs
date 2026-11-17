import assert from 'node:assert/strict';
import { open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareAutomaticRefresh, validateAutomaticPolicy } from '../src/lib/ingestion/automatic-refresh.mjs';
import { applyRefresh, stageRefresh } from '../src/lib/ingestion/refresh.mjs';
import { json, workspacePath, writeAtomic } from '../src/lib/ingestion/generation.mjs';
import { buildReviewedCandidate, deployAppliedCandidate } from './build-source-refresh.mjs';

async function optionalJson(filename) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Pending deployments retry the exact verified artifact before fetching new data. */
export async function runAutomaticRefresh(root, { apply = false, deploy = false, prepareDeployment = false, resumeDeployment = false, workerName, category,
  stage = stageRefresh, build = buildReviewedCandidate, publish = applyRefresh, deployCandidate = deployAppliedCandidate } = {}) {
  // Serialize acquisition and pending-state updates as well as publication.
  const lockPath = await workspacePath(root, 'data/.source-automatic.lock');
  const lock = await open(lockPath, 'wx');
  try {
    await lock.writeFile(json({ pid: process.pid, started_at: new Date().toISOString() }));
    return await executeAutomaticRefresh(root, { apply, deploy, prepareDeployment, resumeDeployment, workerName, category, stage, build, publish, deployCandidate });
  } finally { await lock.close(); await unlink(lockPath); }
}

async function executeAutomaticRefresh(root, { apply, deploy, prepareDeployment, resumeDeployment, workerName, category, stage, build, publish, deployCandidate }) {
  assert.ok(!deploy || apply, '--deploy requires --apply');
  assert.ok(!prepareDeployment || apply && !deploy && !resumeDeployment, '--prepare-deploy requires --apply and a separate deployment step');
  assert.ok(!resumeDeployment || !apply && !deploy, '--resume-deployment is a separate operation');
  if (apply || resumeDeployment) assert.match(workerName ?? '', /^[a-z][a-z0-9-]{2,62}$/, 'Publication requires an explicit --worker-name');
  const stateFile = await workspacePath(root, 'work/source-refresh/automatic-state.json');
  const state = await optionalJson(stateFile);
  if ((apply || resumeDeployment) && state?.status === 'pending') {
    // Failed builds are restaged; a completed local application must be deployed
    // using its original receipt, never replaced with a newly acquired generation.
    const receipt = await optionalJson(await workspacePath(root, `${state.directory}/application.json`));
    if (receipt) {
      assert.equal(workerName, state.worker_name, 'Pending publication targets another Worker');
      if (prepareDeployment) return { status: 'pending_deployment', candidate: state };
      assert.equal(deploy || resumeDeployment, state.deploy, 'Finish the pending deployment using its original mode');
      if (state.deploy) await deployCandidate(root, { directory: state.directory, approve: state.candidate_sha256 });
      await writeAtomic(stateFile, json({ ...state, status: 'completed' }));
      if (resumeDeployment) return { status: 'deployed', candidate: state };
    }
    else if (resumeDeployment) throw new Error('Pending application has no receipt; rebuild it before deployment');
  }
  if (resumeDeployment) return { status: 'no_pending_deployment' };
  const policy = JSON.parse(await readFile(await workspacePath(root, 'data/automatic-refresh-policy.json'), 'utf8'));
  validateAutomaticPolicy(policy);
  const staged = await stage(root, { category });
  const prepared = await prepareAutomaticRefresh(root, { directory: staged.directory,
    output: `${staged.directory}-automatic`, policy });
  const decisionPath = `${staged.directory}/automatic-report.json`;
  await writeAtomic(await workspacePath(root, decisionPath), json(prepared.decision));
  if (apply && prepared.candidate) {
    const pending = { status: 'pending', ...prepared.candidate, worker_name: workerName, deploy: deploy || prepareDeployment };
    await writeAtomic(stateFile, json(pending));
    await publish(root, { ...prepared.candidate, approve: prepared.candidate.candidate_sha256,
      reviewer: `automation:policy:${prepared.decision.policy_sha256}`,
      validateAndBuild: candidate => build(root, candidate, { workerName, automatic: true }) });
    if (deploy) await deployCandidate(root, { directory: prepared.candidate.directory, approve: prepared.candidate.candidate_sha256 });
    if (!prepareDeployment) await writeAtomic(stateFile, json({ ...pending, status: 'completed' }));
  }
  return { status: apply && prepared.candidate ? prepareDeployment ? 'pending_deployment' : deploy ? 'deployed' : 'applied' : prepared.decision.status,
    report: decisionPath, candidate: prepared.candidate, sources: prepared.decision.sources,
    note: 'Automatic checks do not advance substantive verification dates. See the report for sources needing review.' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { apply: { type: 'boolean' }, deploy: { type: 'boolean' },
    'prepare-deploy': { type: 'boolean' }, 'resume-deployment': { type: 'boolean' },
    'worker-name': { type: 'string' }, category: { type: 'string' } }, strict: true });
  console.log(json(await runAutomaticRefresh(resolve(import.meta.dirname, '..'), {
    apply: values.apply, deploy: values.deploy, prepareDeployment: values['prepare-deploy'], resumeDeployment: values['resume-deployment'], workerName: values['worker-name'], category: values.category,
  })));
}
