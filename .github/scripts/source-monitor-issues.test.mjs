import assert from 'node:assert/strict';
import test from 'node:test';
import { ISSUE_LABEL, syncActionableIssues, validateActionableReport } from './source-monitor-issues.mjs';

const finding = {
  fingerprint: 'housing:public-help:link_broken:official_source',
  catalog: 'housing', resource_id: 'public-help', code: 'link_broken',
  role: 'official_source', severity: 'high',
  summary: 'The official source returned 404.',
};
const report = actionable => ({ schema_version: 2, actionable });

function mockApi() {
  const issues = [];
  const calls = { ensured: [], created: [], updated: [] };
  return {
    calls, issues,
    async ensureLabel(label) { calls.ensured.push(label); },
    async listOpenIssues() { return structuredClone(issues); },
    async createIssue(issue) {
      calls.created.push(issue);
      issues.push({ ...issue, number: issues.length + 1 });
    },
    async updateIssue(number, changes) {
      calls.updated.push({ number, changes });
      Object.assign(issues.find(issue => issue.number === number), changes);
    },
  };
}

test('no actionable findings make no issue API calls', async () => {
  const api = mockApi();
  assert.deepEqual(await syncActionableIssues(report([]), api),
    { created: 0, updated: 0, unchanged: 0, actionable: 0 });
  assert.deepEqual(api.calls, { ensured: [], created: [], updated: [] });
});

test('same fingerprint creates once, leaves unchanged issue alone, and updates managed block', async () => {
  const api = mockApi();
  assert.equal((await syncActionableIssues(report([finding]), api)).created, 1);
  assert.deepEqual(api.calls.ensured, [ISSUE_LABEL]);
  assert.deepEqual(api.issues[0].labels, [ISSUE_LABEL]);
  api.issues[0].body += '\n\nMaintainer note: checking with publisher.';
  assert.equal((await syncActionableIssues(report([finding]), api)).unchanged, 1);
  assert.equal(api.calls.created.length, 1);
  assert.equal(api.calls.updated.length, 0);
  const changed = { ...finding, summary: 'The official source now returns 410.' };
  assert.equal((await syncActionableIssues(report([changed]), api)).updated, 1);
  assert.equal(api.calls.created.length, 1);
  assert.match(api.issues[0].body, /now returns 410/);
  assert.match(api.issues[0].body, /Maintainer note: checking with publisher/);
});

test('invalid and duplicate actionable entries fail before calling the issue API', async () => {
  const api = mockApi();
  assert.throws(() => validateActionableReport(report([finding, finding])), /Invalid actionable/);
  await assert.rejects(syncActionableIssues(report([{
    ...finding, fingerprint: 'unsafe --> marker',
  }]), api), /Invalid actionable/);
  assert.deepEqual(api.calls.ensured, []);
});

test('issue body strips URLs with query data from summaries', async () => {
  const api = mockApi();
  await syncActionableIssues(report([{ ...finding,
    summary: 'The link https://example.org/path?private=value#fragment returned 404.',
  }]), api);
  assert.doesNotMatch(api.issues[0].body, /private=value|#fragment|https:\/\//);
  assert.match(api.issues[0].body, /\[URL in report\]/);
});

test('operational endpoint findings can open link review issues', async () => {
  const api = mockApi();
  const operational = { ...finding,
    fingerprint: 'operational:gis-service:link_broken:official_source',
    catalog: 'operational', resource_id: 'gis-service',
  };
  const result = await syncActionableIssues(report([operational]), api);
  assert.equal(result.created, 1);
  assert.match(api.issues[0].title, /operational\/gis-service/);
});
