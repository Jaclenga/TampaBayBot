import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, realpath, link } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setupGitleaks, assertWorkspaceOutput } from "./setup-gitleaks.mjs";

const project = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  assert.ok(["--root", "--report"].includes(args[index]) && args[index + 1] && !options[args[index]], "Usage: node scripts/scan-secrets.mjs [--root workspace/subdirectory] [--report workspace/report.json]");
  options[args[index]] = args[index + 1];
}
const scanRoot = await realpath(resolve(project, options["--root"] ?? "."));
assert.ok(scanRoot === project || scanRoot.startsWith(`${project}${sep}`), "Scan target must stay in this workspace");
const config = resolve(project, ".gitleaks.toml");
const template = resolve(project, "evaluation/security/gitleaks-report.tmpl");
const reportPath = resolve(project, options["--report"] ?? "evaluation/security/release-secret-scan.json");
assert.ok(reportPath.startsWith(`${project}${sep}`) && reportPath.endsWith(".json"), "Scan report must be a JSON file in this workspace");
await assertWorkspaceOutput(reportPath);
const reportName = relative(scanRoot, reportPath).replaceAll("\\", "/");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const git = args => {
  const result = spawnSync("git", args, { cwd: scanRoot, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, "Git metadata command failed; no scan completion claimed");
  return result.stdout;
};
const head = git(["rev-parse", "HEAD"]).trim();
assert.equal(await realpath(git(["rev-parse", "--show-toplevel"]).trim()), scanRoot, "Scan target must be its own initialized Git repository");
assert.equal(git(["rev-parse", "--is-shallow-repository"]).trim(), "false", "Fetch full history before scanning (CI checkout fetch-depth: 0)");
const readRefs = () => git(["for-each-ref", "--format=%(refname) %(objectname)"]).trim().split(/\r?\n/).filter(Boolean).map(line => {
  const [ref, commit] = line.split(" ");
  return { ref, commit };
});
const refs = readRefs();
const commits = Number(git(["rev-list", "--all", "--count"]).trim());
const tool = await setupGitleaks();
const runDirectory = resolve(project, "work", "secret-scan", randomUUID());
const snapshot = resolve(runDirectory, "source");
await assertWorkspaceOutput(snapshot, "directory");
await mkdir(snapshot, { recursive: true });
const emptyIgnore = resolve(runDirectory, "empty.gitleaksignore");
await writeFile(emptyIgnore, "");

// Only release-source candidates: tracked files and untracked, nonignored files.
// A hard-linked snapshot avoids logging source text or persisting raw findings.
// The generated sanitized report is the one explicit self-reference exclusion.
const paths = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))].sort();
const deleted = [];
const files = [];
for (const path of paths) {
  if (path === reportName) continue;
  const source = resolve(scanRoot, path);
  assert.ok(source.startsWith(`${scanRoot}${sep}`), "Source path escapes the project");
  let stat;
  try { stat = await lstat(source); } catch (error) { if (error.code === "ENOENT") { deleted.push(path); continue; } throw error; }
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), "Release source scan requires regular files; review symbolic links/submodules separately");
  assert.ok((await realpath(source)).startsWith(`${scanRoot}${sep}`), "Source resolves outside the project");
  const destination = resolve(snapshot, path);
  await mkdir(dirname(destination), { recursive: true });
  await link(source, destination);
  files.push({ path: path.replaceAll("\\", "/"), sha256: sha256(await readFile(source)), bytes: stat.size });
}
const common = ["--config", config, "--redact=100", "--no-banner", "--no-color", "--log-level=error", "--ignore-gitleaks-allow", "--gitleaks-ignore-path", emptyIgnore, "--max-decode-depth=5", "--max-archive-depth=2", "--timeout=180", "--report-format=template", "--report-template", template];
// Prove detection and metadata-only reporting using an unissued random token
// generated solely in memory. Never print it, persist it, or contact a provider.
const syntheticSecret = "ghp_" + randomBytes(27).toString("base64url").replaceAll("-", "A").replaceAll("_", "B");
const selfTestReport = resolve(runDirectory, "report-self-test.json");
const selfTest = spawnSync(tool.executable, ["stdin", ...common, "--report-path", selfTestReport], { cwd: project, input: `github_token=${syntheticSecret}\n`, encoding: "utf8", windowsHide: true, timeout: 30_000 });
assert.equal(selfTest.status, 1, "Scanner self-test must detect the unissued synthetic token");
const selfTestText = await readFile(selfTestReport, "utf8");
assert.ok(!selfTestText.includes(syntheticSecret), "Scanner report must not contain secret values");
assert.ok(JSON.parse(selfTestText).some(finding => finding.rule === "github-pat"), "Scanner self-test did not use the expected detection rule");
const scans = [];
for (const [scope, args, cwd] of [
  ["all_reachable_git_history", ["git", scanRoot, "--log-opts=--all --full-history --root --text"], scanRoot],
  ["working_source_tree", ["dir", "."], snapshot],
]) {
  const output = resolve(runDirectory, `${scope}.json`);
  const result = spawnSync(tool.executable, [...args, ...common, "--report-path", output], { cwd, encoding: "utf8", windowsHide: true, timeout: 190_000, maxBuffer: 16 * 1024 * 1024 });
  // Tool logs are intentionally not echoed or persisted: even diagnostic
  // contexts can contain unrelated source data. The template emits metadata only.
  assert.ok(!result.error && (result.status === 0 || result.status === 1), `Gitleaks ${scope} failed to complete; inspect locally with full redaction`);
  const findings = JSON.parse(await readFile(output, "utf8"));
  assert.ok(Array.isArray(findings), "Invalid sanitized scanner output");
  scans.push({ scope, exitCode: result.status, findings: findings.map(finding => ({ rule: finding.rule, file: finding.file.replaceAll("\\", "/"), line: finding.line, commit: finding.commit })), findingCount: findings.length });
}
const changed = [];
for (const file of files) {
  try { if (sha256(await readFile(resolve(scanRoot, file.path))) !== file.sha256) changed.push(file.path); } catch { changed.push(file.path); }
}
if (git(["rev-parse", "HEAD"]).trim() !== head) changed.push("HEAD");
if (JSON.stringify(readRefs()) !== JSON.stringify(refs)) changed.push("Git refs");
const currentPaths = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))].filter(path => path !== reportName).sort();
if (JSON.stringify(currentPaths) !== JSON.stringify(paths.filter(path => path !== reportName))) changed.push("release source file list");
const report = {
  completedAt: new Date().toISOString(),
  sourceRoot: relative(project, scanRoot).replaceAll("\\", "/") || ".",
  status: changed.length ? "candidate_changed_during_scan" : scans.some(scan => scan.findingCount) ? "findings_require_review" : "passed",
  tool: { name: "Gitleaks", version: tool.version, platform: `${process.platform}-${process.arch}`, archive: tool.archive, archiveSha256: tool.archiveSha256, binarySha256: tool.binarySha256, releaseUrl: tool.release, checksumUrl: tool.checksumSource, checksumFileSha256: tool.checksumsSha256 },
  head, refs, reachableCommitCount: commits,
  configSha256: sha256(await readFile(config)),
  reportTemplateSha256: sha256(await readFile(template)),
  workingTree: { fileCount: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), manifestSha256: sha256(JSON.stringify(files)), deletedTrackedPaths: deleted, changedDuringScan: changed, files },
  scans,
  scannerSelfTest: "passed: detected an unissued random in-memory token and emitted no secret value",
  redaction: "Full Gitleaks redaction; custom report contains rule/file/line/commit metadata only, never match text, secret values, author details, or commit messages.",
  suppression: "No baseline and no .gitleaksignore; inline allow comments are disabled. Repository configuration extends the default rules.",
  scopeLimits: ["History includes every commit reachable from local refs and HEAD, not unfetched remote refs, unreachable objects, or reflogs.", "Working tree includes tracked and untracked nonignored source files. Ignored runtime secrets, dependency caches, and generated build output are outside release-source scope.", "The generated sanitized report is excluded only from the working-tree snapshot to avoid self-reference; historical report versions remain in the git-history scan.", "Gitleaks default upstream rules and allowlists apply, including default exclusions for dependency lockfiles and certain static/binary file types; this repository adds no allowlists.", "Archive traversal is bounded to depth 2 and decoding to depth 5. Binary formats and unknown secret patterns may evade detection. No credential validity checks or external secret submission occur.", "A zero-finding result is not a guarantee that no secrets exist."]
};
await assertWorkspaceOutput(reportPath);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, version: tool.version, reachableCommits: commits, sourceFiles: files.length, scans: scans.map(({ scope, findingCount }) => ({ scope, findingCount })), changedDuringScan: changed, report: relative(project, reportPath).replaceAll("\\", "/") }, null, 2));
if (report.status !== "passed") process.exitCode = 1;
