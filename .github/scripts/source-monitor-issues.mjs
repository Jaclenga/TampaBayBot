import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const ISSUE_LABEL = 'source-monitor';
const markerPrefix = 'tampabaybot-source-monitor';
const fingerprintPattern = /^[A-Za-z0-9_.:/-]{1,200}$/;
const idPattern = /^[a-z0-9][a-z0-9-]{0,100}$/;
const codePattern = /^[a-z][a-z0-9_]{0,100}$/;
const rolePattern = /^[a-z0-9_:+-]{1,100}$/;

function plainText(value) {
  return value.replace(/https?:\/\/\S+/gi, '[URL in report]')
    .replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateActionableReport(report) {
  if (!report || report.schema_version !== 2 || !Array.isArray(report.actionable))
    throw new Error('Expected a version 2 resource freshness report with actionable findings.');
  const seen = new Set();
  for (const entry of report.actionable) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.fingerprint !== 'string' || !fingerprintPattern.test(entry.fingerprint) ||
        seen.has(entry.fingerprint) || !['housing', 'rag', 'operational'].includes(entry.catalog) ||
        typeof entry.resource_id !== 'string' || !idPattern.test(entry.resource_id) ||
        typeof entry.code !== 'string' || !codePattern.test(entry.code) ||
        !(entry.role === null || entry.role === undefined ||
          typeof entry.role === 'string' && rolePattern.test(entry.role)) ||
        typeof entry.severity !== 'string' || !codePattern.test(entry.severity) ||
        typeof entry.summary !== 'string' || !entry.summary.trim() ||
        entry.summary.length > 1000) {
      throw new Error('Invalid actionable resource finding.');
    }
    seen.add(entry.fingerprint);
  }
  return report.actionable;
}

function startMarker(fingerprint) {
  return `<!-- ${markerPrefix}:${fingerprint}:begin -->`;
}
function endMarker(fingerprint) {
  return `<!-- ${markerPrefix}:${fingerprint}:end -->`;
}

function managedBlock(entry) {
  return [
    startMarker(entry.fingerprint),
    'An automated weekly check found a public resource that needs review.',
    '',
    `- Catalog: ${entry.catalog}`,
    `- Resource ID: ${entry.resource_id}`,
    `- Finding: ${entry.code}`,
    `- Link role: ${entry.role ?? 'resource'}`,
    `- Severity: ${entry.severity}`,
    `- Summary: ${plainText(entry.summary)}`,
    '',
    'Review the metadata-only `resource-freshness-attention` artifact from the Source refresh review workflow, then verify the original official source. A link check or content fingerprint does not establish eligibility, available funding, a shelter bed, or a current deadline.',
    endMarker(entry.fingerprint),
  ].join('\n');
}

function fingerprintInIssue(issue) {
  const match = typeof issue?.body === 'string' && issue.body.match(
    /<!-- tampabaybot-source-monitor:([A-Za-z0-9_.:/-]{1,200}):begin -->/);
  return match?.[1] ?? null;
}

function replaceManagedBlock(body, entry) {
  const start = startMarker(entry.fingerprint);
  const end = endMarker(entry.fingerprint);
  const first = body.indexOf(start);
  const last = body.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error('An existing monitor issue has malformed markers.');
  return body.slice(0, first) + managedBlock(entry) + body.slice(last + end.length);
}

export async function syncActionableIssues(report, api) {
  const entries = validateActionableReport(report);
  if (!entries.length) return { created: 0, updated: 0, unchanged: 0, actionable: 0 };
  await api.ensureLabel(ISSUE_LABEL);
  const openIssues = await api.listOpenIssues(ISSUE_LABEL);
  if (!Array.isArray(openIssues)) throw new Error('Unable to list open monitor issues.');
  const existing = new Map();
  for (const issue of openIssues) {
    if (issue.pull_request) continue;
    const fingerprint = fingerprintInIssue(issue);
    if (fingerprint && !existing.has(fingerprint)) existing.set(fingerprint, issue);
  }
  const totals = { created: 0, updated: 0, unchanged: 0, actionable: entries.length };
  for (const entry of entries) {
    const issue = existing.get(entry.fingerprint);
    if (!issue) {
      await api.createIssue({
        title: `[Source monitor] ${entry.catalog}/${entry.resource_id}: ${entry.code}`,
        body: managedBlock(entry), labels: [ISSUE_LABEL],
      });
      totals.created++;
      continue;
    }
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 ||
        typeof issue.body !== 'string') throw new Error('Invalid existing monitor issue.');
    const body = replaceManagedBlock(issue.body, entry);
    if (body === issue.body) totals.unchanged++;
    else {
      await api.updateIssue(issue.number, { body });
      totals.updated++;
    }
  }
  return totals;
}

export function githubIssueApi({ repository, token, fetchImpl = fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') ||
      typeof token !== 'string' || !token)
    throw new Error('GitHub repository and token are required for issue sync.');
  const base = `https://api.github.com/repos/${repository}`;
  async function request(method, endpoint, body, allowNotFound = false) {
    let response;
    try {
      response = await fetchImpl(`${base}${endpoint}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TampaBayBot-source-monitor',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new Error('GitHub issue API request failed.'); }
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub issue API returned status ${response.status}.`);
    try { return await response.json(); }
    catch { throw new Error('GitHub issue API returned invalid JSON.'); }
  }
  return {
    async ensureLabel(name) {
      if (await request('GET', `/labels/${encodeURIComponent(name)}`, undefined, true)) return;
      try {
        await request('POST', '/labels', { name, color: 'B14ED5',
          description: 'Automated official-resource review findings' });
      } catch (error) {
        // Another run or a maintainer may have created the label meanwhile.
        if (!(await request('GET', `/labels/${encodeURIComponent(name)}`, undefined, true)))
          throw error;
      }
    },
    async listOpenIssues(name) {
      const issues = [];
      for (let page = 1; page <= 20; page++) {
        const rows = await request('GET', `/issues?state=open&labels=${encodeURIComponent(name)}&per_page=100&page=${page}`);
        if (!Array.isArray(rows)) throw new Error('GitHub issue API returned invalid issues.');
        issues.push(...rows);
        if (rows.length < 100) return issues;
      }
      throw new Error('Too many open monitor issues to deduplicate safely.');
    },
    createIssue: issue => request('POST', '/issues', issue),
    updateIssue: (number, changes) => request('PATCH', `/issues/${number}`, changes),
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1) throw new Error('Pass one resource freshness report JSON path.');
  const report = JSON.parse(await readFile(args[0], 'utf8'));
  const entries = validateActionableReport(report);
  if (!entries.length) {
    console.log('Source monitor: no actionable findings; no issue changes.');
    return;
  }
  const api = githubIssueApi({ repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN });
  const result = await syncActionableIssues(report, api);
  console.log(`Source monitor: ${result.actionable} actionable; ${result.created} issues created, ${result.updated} updated, ${result.unchanged} unchanged.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(`Source monitor issue sync failed: ${error.message}`);
    process.exitCode = 1;
  });
