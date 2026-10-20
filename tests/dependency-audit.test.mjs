import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessAudits, summarizeAudit } from '../scripts/audit-dependencies.mjs';

function audit(entries) {
  const vulnerabilities = Object.fromEntries(entries.map(([name, severity]) => [name, {
    name,
    severity,
    isDirect: name === 'direct-package',
    fixAvailable: false,
  }]));
  const counts = Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical'].map(severity => [severity, entries.filter(([, level]) => level === severity).length]));
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { ...counts, total: entries.length } } };
}

test('production high and critical findings block the gate', () => {
  const production = summarizeAudit(audit([['direct-package', 'high'], ['transitive-package', 'low']]));
  const all = summarizeAudit(audit([['direct-package', 'high'], ['transitive-package', 'low'], ['build-tool', 'critical']]));
  const result = assessAudits(production, all);
  assert.equal(result.gate, 'failed');
  assert.deepEqual(result.blocking.map(item => item.package), ['direct-package']);
  assert.deepEqual(result.developmentOnly.map(item => item.package), ['build-tool']);
});

test('development-only findings are reported without masking a clean production gate', () => {
  const production = summarizeAudit(audit([]));
  const all = summarizeAudit(audit([['build-tool', 'high']]));
  const result = assessAudits(production, all);
  assert.equal(result.gate, 'passed');
  assert.equal(result.developmentOnly[0].severity, 'high');
  assert.equal(all.counts.total, 1);
});

test('incomplete or inconsistent npm reports fail closed', () => {
  assert.throws(() => summarizeAudit({ error: { code: 'ENOAUDIT' } }));
  assert.throws(() => summarizeAudit({ ...audit([]), auditReportVersion: 1 }));
  const inconsistent = audit([['package', 'high']]);
  inconsistent.metadata.vulnerabilities.total = 0;
  assert.throws(() => summarizeAudit(inconsistent));
  const invalid = audit([['package', 'high']]);
  invalid.vulnerabilities.package.severity = 'unknown';
  assert.throws(() => summarizeAudit(invalid));
});

test('reports only public advisory URLs, never arbitrary registry supplied links', () => {
  const input = audit([['package', 'high']]);
  input.vulnerabilities.package.via = [
    { url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' },
    { url: 'https://private.example.test/token?key=secret' },
    { url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm?token=secret' },
    { url: 'https://github.com@private.example.test/advisories/GHSA-vfj7-8cjw-p6xm' },
  ];
  assert.deepEqual(summarizeAudit(input).findings[0].advisoryUrls, ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm']);
});
