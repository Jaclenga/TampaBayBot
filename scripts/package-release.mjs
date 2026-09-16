import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeReportValue } from "./sanitize-report.mjs";
import { SUITE_VERSION } from "../evaluation/suite/report.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_DIRS = ["src", "scripts", "tests", "vendor"];
const ROOT_FILES = ["README.md", "package.json", "package-lock.json", "next.config.ts", "vite.config.ts", "tsconfig.json", "eslint.config.mjs", "postcss.config.mjs", "playwright.config.ts", "playwright.source.config.ts", ".gitignore", ".gitattributes", ".gitleaks.toml", ".gitleaksignore", ".env.example", "LICENSE", "NOTICE.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md"];
const GUIDE_FILES = ["README.md", "ACCESSIBILITY.md", "DATA_SOURCES.md", "DEVELOPMENT.md", "EVALUATION.md", "PROGRAM_RECALL.md", "DISTRIBUTION.md", "DEPLOYMENT.md", "LIMITATIONS.md", "LLM.md", "METHODOLOGY.md", "GUARDRAIL_INSERTS.md", "EVAL_SUITE.md", "GEOSPATIAL.md", "HISTORY.md", "RELEASE_READINESS.md", "SECRET_SCANNING.md", "SOURCE_UPDATES.md", "DEMO.md"];
const GENERATED_FIELDS = ["retrieval_date", "source_updated_date", "content_hash", "normalized_content_hash", "raw_path", "normalized_path", "last_attempt", "last_error", "response_url", "content_type", "etag", "last_modified", "content_changed_at", "record_count", "searchable_point_count", "excluded_point_count"];
const NOTICE = "This source-only distribution contains no downloaded evidence or historical response packets. Fetch and review sources locally before expecting cited answers. Evaluation has not run for this copy.";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function optionalFile(filename) {
  try {
    if ((await lstat(filename)).isSymbolicLink()) throw new Error("Release inputs cannot contain symlinked files.");
    if (await realpath(filename) !== path.resolve(filename)) throw new Error("Release input ancestors must not redirect through a symlink or junction.");
    return await readFile(filename);
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function requiredJson(filename) {
  const bytes = await optionalFile(filename);
  if (bytes === null) throw new Error(`Required release input is missing: ${path.basename(filename)}`);
  return JSON.parse(bytes.toString("utf8"));
}

async function sourceFiles(root, relative) {
  const directory = path.join(root, relative);
  const information = await lstat(directory);
  if (information.isSymbolicLink()) throw new Error(`Release inputs cannot contain symlinks: ${relative}`);
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Release inputs cannot contain symlinks: ${name}`);
    if (/^\.(?:env|dev\.vars)(?:\.|$)/.test(entry.name)) continue;
    if (entry.isDirectory()) {
      if (!["node_modules", ".git", ".openai", ".wrangler", "results", "raw", "normalized"].includes(entry.name)) files.push(...await sourceFiles(root, name));
    } else if (/\.(?:mjs|js|cjs|ts|tsx|mts|css|md)$/.test(name) || (relative.startsWith("vendor/") && ["LICENSE", "package.json"].includes(entry.name))) {
      files.push(name);
    }
  }
  return files;
}

export function emptySourceRegistry(sources) {
  return sources.map((source) => {
    const clean = structuredClone(source);
    for (const field of GENERATED_FIELDS) delete clean[field];
    return { ...clean, retrieval_date: null, source_updated_date: null, status: "unavailable", last_error: "Not fetched in this source-only distribution." };
  });
}

function emptyLegacyReport(template) {
  const metrics = Object.fromEntries(Object.entries(template.metrics).map(([key, metric]) => [key,
    Object.hasOwn(metric, "passed") ? { passed: 0, total: 0, rate: null } : { score: null, status: "not_run", note: NOTICE },
  ]));
  return { schema_version: 1, status: "not_run", evaluated_as_of: null, benchmark_count: 0, baseline_count: 0, synthetic_scenario_count: 0, metrics, known_limitations: [NOTICE], failures: [] };
}

function emptySuiteReport() {
  const checks = { passed: 0, failed: 0, applicable: 0, notApplicable: 0, rate: null };
  const suites = Object.fromEntries(["navigation", "guardrails", "providers", "metamorphic", "jurisdiction", "quality"].map((name) => [name, { cases: 0, passed: 0, failed: 0, checks }]));
  return { schemaVersion: 1, suiteVersion: SUITE_VERSION, mode: "not_run", status: "not_run", startedAt: null, completedAt: "", provenance: {}, summary: { cases: 0, passed: 0, failed: 0, checks, suites }, metrics: {}, automatedQuality: null, humanEvaluation: { status: "not_run" }, limitations: [NOTICE], cases: [] };
}

export function omitUnavailableMarkdownLinks(markdown, filename, availableFiles) {
  return markdown.replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, (original, label, rawTarget) => {
    const target = rawTarget.trim().replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target)) return original;
    let reference;
    try { reference = decodeURIComponent(target.split(/[?#]/)[0]); } catch { return `${label} (development artifact omitted from source-only release)`; }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), reference));
    return availableFiles.has(resolved) ? original : `${label} (development artifact omitted from source-only release)`;
  });
}

const RELEASE_README = "# TampaBayBot\n\n" + NOTICE + "\n\nSee [distribution and source setup](docs/DISTRIBUTION.md).\n";

export async function createSourceRelease({ root = ROOT, output }) {
  root = await realpath(root);
  if (typeof output !== "string" || !output.trim()) throw new Error("Provide a new output directory beneath work/releases/.");
  const outputPath = path.resolve(root, output);
  const releaseRoot = path.join(root, "work", "releases");
  const relativeOutput = path.relative(releaseRoot, outputPath);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) throw new Error("Output must be a new child directory beneath work/releases/.");
  // Check every existing ancestor before mkdir; a junction must not redirect writes outside the workspace.
  let ancestor = path.dirname(outputPath);
  while (ancestor !== root) {
    try { if ((await lstat(ancestor)).isSymbolicLink() || await realpath(ancestor) !== ancestor) throw new Error("Output ancestors must not redirect through a symlink or junction."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    ancestor = path.dirname(ancestor);
  }
  try { await lstat(outputPath); throw new Error("Output already exists; choose a new directory. Existing files are never replaced."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }

  const inputs = new Set(ROOT_FILES);
  for (const directory of SOURCE_DIRS) for (const name of await sourceFiles(root, directory)) inputs.add(name);
  for (const guide of GUIDE_FILES) inputs.add(`docs/${guide}`);
  for (const name of await sourceFiles(root, "evaluation/suite")) inputs.add(name);
  for (const name of ["evaluation/benchmarks.mjs", "evaluation/scenarios.mjs", "evaluation/recall.mjs", "evaluation/datasets/README.md", "evaluation/datasets/benchmark.json", "evaluation/datasets/quality-benchmark.json", "evaluation/datasets/program-recall-benchmark.json", "evaluation/datasets/ground_truth_questions.json", "evaluation/human-audit/RUBRIC.md", "evaluation/security/gitleaks-report.tmpl", "evaluation/security/SECRET_SCAN.md", "src/worker/index.ts", "data/gis-config.json", "data/development-config.json"]) inputs.add(name);
  // The release gets its own source-only CI workflow, if supplied by the maintainer.
  inputs.add(".github/workflows/source-release.yml");
  inputs.add(".github/workflows/source-refresh.yml");
  inputs.add(".github/workflows/operations-monitor.yml");
  inputs.add("docs/OPERATIONS.md");
  inputs.add("db/schema.ts");
  inputs.add("drizzle/0000_operations.sql");
  inputs.add(".github/PULL_REQUEST_TEMPLATE.md");
  inputs.add(".github/ISSUE_TEMPLATE/bug.yml");
  inputs.add("docs/images/demo.png");

  const payload = new Map();
  for (const name of [...inputs].sort()) {
    const contents = await optionalFile(path.join(root, name));
    if (contents !== null) payload.set(name, contents);
  }
  const sources = await requiredJson(path.join(root, "data/sources.json"));
  const emptySources = emptySourceRegistry(sources);
  const emptyCorpus = { schema_version: 1, generation: digest(JSON.stringify({ sources: emptySources, chunks: [] })), sources: emptySources, chunks: [] };
  const legacy = await requiredJson(path.join(root, "evaluation/results/latest.json"));
  const generated = {
    "README.md": payload.get("README.md")?.toString("utf8") ?? RELEASE_README,
    ".gitattributes": "* text=auto eol=lf\n",
    "public/.gitkeep": "",
    "data/sources.json": json(emptySources),
    "data/corpus.json": json(emptyCorpus),
    "data/chunks.json": "[]\n",
    "data/ingestion-report.json": json({ status: "not_run", sources: [], note: NOTICE }),
    "data/verification-report.json": json({ status: "not_run", sources: [], note: NOTICE }),
    "evaluation/results/latest.json": json(emptyLegacyReport(legacy)),
    "evaluation/results/responses.json": "[]\n",
    "evaluation/agent-audit/responses.json": "[]\n",
    "evaluation/human-audit/responses.json": "[]\n",
    "evaluation/suite/results/latest.json": json(emptySuiteReport()),
    "docs/DATA_SOURCES.md": "# Source registry\n\n" + NOTICE + "\n\nPublisher URLs, source categories and fetch configuration are in [`data/sources.json`](../data/sources.json); retrieval dates are unset until you fetch. See [distribution and terms](DISTRIBUTION.md) and [geographic methods](GEOSPATIAL.md).\n",
  };
  for (const [name, value] of Object.entries(generated)) payload.set(name, Buffer.from(value));
  const extraIgnores = ["/data/raw/", "/data/normalized/", "/data/chunks.json", "/data/corpus.json", "/data/generations/", "/data/ingestion-report.json", "/data/verification-report.json", "/evaluation/results/", "/evaluation/agent-audit/responses.json", "/evaluation/human-audit/responses.json", "/evaluation/suite/results/"];
  const existingIgnores = payload.get(".gitignore")?.toString() ?? "";
  const missingIgnores = extraIgnores.filter((entry) => !existingIgnores.split(/\r?\n/).includes(entry));
  payload.set(".gitignore", Buffer.from(existingIgnores + (missingIgnores.length ? `\n# Locally fetched evidence and response artifacts are not source releases.\n${missingIgnores.join("\n")}\n` : "")));
  const availableFiles = new Set([...payload.keys(), "SOURCE_RELEASE_MANIFEST.json"]);
  for (const [name, bytes] of payload) if (name.endsWith(".md")) payload.set(name, Buffer.from(omitUnavailableMarkdownLinks(bytes.toString("utf8"), name, availableFiles)));
  // Normalize text before hashing so Git's LF checkout policy
  // preserves both file bytes and manifest digests on Windows, macOS and Linux.
  for (const [name, bytes] of payload) if (!name.endsWith('.png')) payload.set(name, Buffer.from(bytes.toString("utf8").replace(/\r\n?/g, "\n")));
  const files = [...payload].map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: digest(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { schema_version: 1, distribution: "source-only-alpha", content_sha256: digest(json(files)), external_snapshots_included: false, git_history_included: false, owner_hosting_config_included: false, initial_evidence_chunks: 0, note: NOTICE, excluded: ["data/raw/**", "data/normalized/**", "historical data/chunks.json", "historical derived evaluation/report artifacts", "docs/screenshots/**", ".openai/**", ".env and .dev.vars files", ".git/**", "node_modules/**", "work/**"], files };
  await mkdir(outputPath, { recursive: true });
  for (const [name, bytes] of payload) {
    const filename = path.join(outputPath, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes, { flag: "wx" });
  }
  await writeFile(path.join(outputPath, "SOURCE_RELEASE_MANIFEST.json"), json(sanitizeReportValue(manifest, root)), { flag: "wx" });
  return { output: path.relative(root, outputPath).split(path.sep).join("/"), files: files.length, content_sha256: manifest.content_sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--output") throw new Error("Usage: node scripts/package-release.mjs --output work/releases/<new-name>");
  console.log(JSON.stringify(await createSourceRelease({ output: args[1] }), null, 2));
}
