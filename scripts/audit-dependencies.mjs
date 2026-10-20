import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const gateSeverity = 'high';

function publicAdvisoryUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return null;
    if (url.hostname === 'github.com' && /^\/advisories\/GHSA-[a-z0-9-]+\/?$/i.test(url.pathname)) return url.href;
    if (url.hostname === 'www.npmjs.com' && /^\/advisories\/[0-9]+\/?$/.test(url.pathname)) return url.href;
  } catch { /* The audit result may omit a URL. */ }
  return null;
}

export function summarizeAudit(body) {
  assert.ok(body && typeof body === 'object' && !Array.isArray(body), 'npm audit did not return an object');
  assert.ok(!body.error, 'npm audit returned an error');
  assert.ok(body.auditReportVersion === 2, 'Unsupported npm audit report version');
  assert.ok(body.vulnerabilities && typeof body.vulnerabilities === 'object' && !Array.isArray(body.vulnerabilities), 'npm audit omitted vulnerabilities');
  const counts = body.metadata?.vulnerabilities;
  assert.ok(counts && typeof counts === 'object', 'npm audit omitted vulnerability counts');

  const findings = Object.entries(body.vulnerabilities).map(([name, item]) => {
    assert.ok(name && item && typeof item === 'object' && item.name === name, 'Invalid npm audit package entry');
    assert.ok(severities.includes(item.severity), 'Invalid npm audit severity');
    return {
      package: name,
      severity: item.severity,
      direct: item.isDirect === true,
      fixAvailable: item.fixAvailable !== false && item.fixAvailable != null,
      advisoryUrls: [...new Set((Array.isArray(item.via) ? item.via : []).map(via => publicAdvisoryUrl(via?.url)).filter(Boolean))].sort(),
    };
  }).sort((a, b) => a.package.localeCompare(b.package));

  const actual = Object.fromEntries(severities.map(severity => [severity, findings.filter(item => item.severity === severity).length]));
  for (const severity of severities) assert.equal(counts[severity], actual[severity], `npm audit ${severity} count is inconsistent`);
  assert.equal(counts.total, findings.length, 'npm audit total count is inconsistent');
  return { counts: { ...actual, total: findings.length }, findings };
}

export function assessAudits(production, all) {
  const deployedPackages = new Set(production.findings.map(item => item.package));
  const developmentOnly = all.findings.filter(item => !deployedPackages.has(item.package));
  const blocking = production.findings.filter(item => severities.indexOf(item.severity) >= severities.indexOf(gateSeverity));
  return {
    gate: blocking.length ? 'failed' : 'passed',
    blocking,
    developmentOnly,
  };
}

function runNpmAudit(scope, auditDirectory, emptyConfig) {
  const args = ['audit', '--json', '--registry=https://registry.npmjs.org/', `--userconfig=${emptyConfig}`];
  if (scope === 'production') args.push('--omit=dev');
  // The public advisory request needs no application credentials. Exclude
  // credential-like and npm config environment variables; use empty user and
  // project/user config files and an explicit public registry.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:TOKEN|SECRET|PASSWORD|AUTH|API_KEY|_KEY$)|^npm_config_/i.test(key)));
  const npmCli = process.env.npm_execpath;
  const useNodeCli = typeof npmCli === 'string' && /npm-cli\.m?js$/i.test(npmCli);
  const command = useNodeCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = useNodeCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: auditDirectory,
    env,
    encoding: 'utf8',
    windowsHide: true,
    shell: !useNodeCli && process.platform === 'win32',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw new Error(`npm audit ${scope} failed to start (${result.error.code ?? 'unknown'})`);
  if (![0, 1].includes(result.status)) throw new Error(`npm audit ${scope} exited without a report (${result.status ?? 'unknown'})`);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error(`npm audit ${scope} returned invalid JSON`); }
  return summarizeAudit(parsed);
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const output = resolve(root, 'work/security/dependency-audit');
  const [packageBytes, lockBytes] = await Promise.all([
    readFile(resolve(root, 'package.json')),
    readFile(resolve(root, 'package-lock.json')),
  ]);
  const report = {
    completedAt: new Date().toISOString(),
    scanner: 'npm audit',
    packageSha256: sha256(packageBytes),
    lockfileSha256: sha256(lockBytes),
    gate: { scope: 'production dependencies', minimumSeverity: gateSeverity, status: 'incomplete' },
    production: null,
    allDependencies: null,
    developmentOnly: [],
    limitations: [
      'The audit depends on the npm advisory service at scan time; a completed scan cannot prove the absence of undisclosed vulnerabilities.',
      'Development and build dependencies are reported for review but do not block this production dependency gate.',
      'Secret scanning is a separate check and does not inspect installed dependencies or ignored local files.',
    ],
  };
  let exitCode = 2;
  const tempBase = await realpath(tmpdir());
  const auditDirectory = await mkdtemp(join(tempBase, 'tampabaybot-audit-'));
  try {
    const emptyConfig = join(auditDirectory, '.npmrc');
    // Audit only the public dependency manifests. No application files,
    // resident content, project npm config, or installed modules are needed.
    await Promise.all([
      writeFile(join(auditDirectory, 'package.json'), packageBytes),
      writeFile(join(auditDirectory, 'package-lock.json'), lockBytes),
      writeFile(emptyConfig, ''),
    ]);
    // Run independently so an incomplete scope never appears as a clean scan.
    const production = runNpmAudit('production', auditDirectory, emptyConfig);
    const all = runNpmAudit('all', auditDirectory, emptyConfig);
    const assessment = assessAudits(production, all);
    report.production = production;
    report.allDependencies = all;
    report.developmentOnly = assessment.developmentOnly;
    report.gate.status = assessment.gate;
    report.gate.blockingPackages = assessment.blocking.map(item => item.package);
    exitCode = assessment.gate === 'passed' ? 0 : 1;
  } catch (error) {
    // Only locally authored validation messages are exposed. npm stdout and
    // stderr can contain registry diagnostics and stay out of artifacts.
    report.error = error instanceof Error ? error.message : 'npm audit did not complete';
  } finally {
    const actual = await realpath(auditDirectory);
    assert.ok(actual.startsWith(`${tempBase}${sep}`) && actual.includes('tampabaybot-audit-'), 'Audit temporary directory escaped the system temporary root');
    await rm(actual, { recursive: true, force: true });
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const counts = scope => scope ? `${scope.counts.total} affected packages (${scope.counts.high} high, ${scope.counts.critical} critical)` : 'incomplete';
  const markdown = [
    '# Dependency audit',
    '',
    `- Completed: ${report.completedAt}`,
    `- Production dependency gate (${gateSeverity} and critical): **${report.gate.status}**`,
    `- Production scan: ${counts(report.production)}`,
    `- Full dependency scan: ${counts(report.allDependencies)}`,
    `- Development/build-only affected packages: ${report.developmentOnly.length}`,
    '',
    'The production gate and full dependency scan are separate. Review every full-scan finding, including build tools.',
    '',
    '## Findings',
    '',
    '| Scope | Package | Severity | Direct | Fix available | Advisory |',
    '| --- | --- | --- | --- | --- | --- |',
    ...[...(report.production?.findings ?? []).map(item => ['production', item]), ...(report.developmentOnly ?? []).map(item => ['development/build only', item])].map(([scope, item]) => `| ${scope} | ${item.package} | ${item.severity} | ${item.direct ? 'yes' : 'no'} | ${item.fixAvailable ? 'yes' : 'no'} | ${item.advisoryUrls.map(url => `[public advisory](${url})`).join(', ') || 'See transitive dependency'} |`),
    '',
    ...(report.error ? [`Scan error: ${report.error}`, ''] : []),
    'A clean audit does not establish complete security. Results depend on advisory coverage at the time of the run.',
    '',
  ].join('\n');
  await writeFile(`${output}.md`, markdown);
  console.log(JSON.stringify({ gate: report.gate.status, productionAffected: report.production?.counts.total ?? null, allAffected: report.allDependencies?.counts.total ?? null, report: 'work/security/dependency-audit.json' }));
  process.exitCode = exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
