import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeReportValue } from "./sanitize-report.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_DIRS = ["app", "components", "lib", "scripts", "tests", "vendor", "build"];
const ROOT_FILES = ["package.json", "package-lock.json", "next.config.ts", "vite.config.ts", "tsconfig.json", "eslint.config.mjs", "postcss.config.mjs", "playwright.config.ts", ".gitignore", ".gitattributes", ".gitleaks.toml", ".gitleaksignore", ".env.example", "LICENSE", "NOTICE.md", "CONTRIBUTING.md", "SECURITY.md", "ACCESSIBILITY.md", "LIMITATIONS.md", "METHODOLOGY.md", "CHANGELOG.md"];
const GUIDE_FILES = ["DISTRIBUTION.md", "DEPLOYMENT.md", "LLM.md", "GUARDRAIL_INSERTS.md", "EVAL_SUITE.md", "GEOSPATIAL.md", "ASSETS.md", "RELEASE_READINESS.md", "OLLAMA_TESTING.md", "BUG_FIX_FOLLOWUP_2026-09-12.md", "SECRET_SCANNING.md", "ALPHA_VERIFICATION.json"];
const GENERATED_FIELDS = ["retrieval_date", "source_updated_date", "content_hash", "normalized_content_hash", "raw_path", "last_attempt", "last_error", "response_url", "content_type", "etag", "last_modified", "content_changed_at", "record_count", "searchable_point_count", "excluded_point_count"];
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
  const suites = Object.fromEntries(["navigation", "guardrails", "providers", "metamorphic"].map((name) => [name, { cases: 0, passed: 0, failed: 0, checks }]));
  return { schemaVersion: 1, suiteVersion: "1.0.0", mode: "not_run", status: "not_run", startedAt: null, completedAt: "", provenance: {}, summary: { cases: 0, passed: 0, failed: 0, checks, suites }, metrics: {}, humanEvaluation: { status: "not_run" }, limitations: [NOTICE], cases: [] };
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

const RELEASE_README = `# ParcelPrivateer source-only alpha

Independent, MIT-licensed Tampa housing-information software with optional local Ollama or API model assistance.

${NOTICE}

## Start locally

Use Node.js 24 LTS. The app needs no account, database or model credentials in its default mode.

\`\`\`sh
npm ci
npm run dev -- --port 3001
\`\`\`

The unpopulated app starts safely and exposes source links, but has no evidence to answer factual questions. Read [source distribution and publisher terms](docs/DISTRIBUTION.md), then download sources directly from their publishers:

\`\`\`sh
npm run ingest
npm run dev -- --port 3001
\`\`\`

An unavailable publisher causes ingestion to return an error and preserves an explicit unavailable state. Review the ingestion report and source content before serving residents. A fresh download is not the historical development corpus and is not guaranteed to pass its dated benchmark expectations unchanged.

## Validate your corpus

\`\`\`sh
npm run ingest -- --check
npm test
npm run evaluate
npm run eval:suite
npm run typecheck
npm run build
\`\`\`

Those complete regression commands require populated evidence; do not treat their failures on an empty corpus as passing checks. Evaluation commands regenerate local reports and preserve failures. Historical agent/human reviews are not recreated automatically. [Evaluation guide](docs/EVAL_SUITE.md).

For local Meta models, read [Ollama/provider setup](docs/LLM.md). For independent hosting, read [deployment](docs/DEPLOYMENT.md). A hosted server cannot reach a model on your computer through its own localhost.

## Release boundary

This is an alpha source distribution, not a validated public resident service. Independent human review, manual accessibility checks, operator abuse limits and hosted verification remain deployment requirements. The Windows local static-assets runtime has a known follow-up request failure after a rejected unread upload; deployment relevance requires verification. [Security](SECURITY.md), [limitations](LIMITATIONS.md), [contributions](CONTRIBUTING.md).

The manifest lists packaged file hashes. Downloaded HTML/PDF/JSON/CSV data, evidence chunks, screenshots, historical response packets, owner hosting identity, environment files and Git history are excluded. Tests and benchmark definitions are original software; fixture examples do not represent residents. [MIT license](LICENSE), [external-source notices](NOTICE.md).

See [release notes](CHANGELOG.md), [alpha verification](docs/ALPHA_VERIFICATION.json) and the [private security-reporting instructions](SECURITY.md#reporting-a-problem). The documented results identify the tested development tree or source-only package; they are not a claim that this newly populated corpus has passed those checks.
`;

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
  for (const name of ["evaluation/benchmarks.mjs", "evaluation/scenarios.mjs", "evaluation/benchmark.json", "evaluation/human-audit/RUBRIC.md", "evaluation/security/gitleaks-report.tmpl", "evaluation/security/SECRET_SCAN.md", "worker/index.ts", "data/gis-config.json", "data/development-config.json"]) inputs.add(name);
  // The release gets its own source-only CI workflow, if supplied by the maintainer.
  inputs.add(".github/workflows/source-release.yml");

  const payload = new Map();
  for (const name of [...inputs].sort()) {
    const contents = await optionalFile(path.join(root, name));
    if (contents !== null) payload.set(name, contents);
  }
  const sources = JSON.parse(await readFile(path.join(root, "data/sources.json"), "utf8"));
  const legacy = JSON.parse(await readFile(path.join(root, "evaluation/results/latest.json"), "utf8"));
  const generated = {
    "README.md": RELEASE_README,
    ".gitattributes": "* text=auto eol=lf\n",
    "public/.gitkeep": "",
    "data/sources.json": json(emptySourceRegistry(sources)),
    "data/chunks.json": "[]\n",
    "data/ingestion-report.json": json({ status: "not_run", sources: [], note: NOTICE }),
    "data/verification-report.json": json({ status: "not_run", sources: [], note: NOTICE }),
    "evaluation/results/latest.json": json(emptyLegacyReport(legacy)),
    "evaluation/results/responses.json": "[]\n",
    "evaluation/agent-audit/responses.json": "[]\n",
    "evaluation/human-audit/responses.json": "[]\n",
    "evaluation/suite/results/latest.json": json(emptySuiteReport()),
    "DATA_SOURCES.md": "# Source registry\n\n" + NOTICE + "\n\nPublisher URLs, source categories and fetch configuration are in `data/sources.json`; retrieval dates are unset until you fetch. See [distribution and terms](docs/DISTRIBUTION.md) and [geographic methods](docs/GEOSPATIAL.md).\n",
  };
  for (const [name, value] of Object.entries(generated)) payload.set(name, Buffer.from(value));
  const extraIgnores = "\n# Locally fetched external evidence and response artifacts are not source releases.\n/data/raw/\n/data/normalized/\n/data/chunks.json\n/data/ingestion-report.json\n/data/verification-report.json\n/evaluation/results/\n/evaluation/agent-audit/responses.json\n/evaluation/human-audit/responses.json\n/evaluation/suite/results/\n";
  payload.set(".gitignore", Buffer.from((payload.get(".gitignore")?.toString() ?? "") + extraIgnores));
  const availableFiles = new Set([...payload.keys(), "SOURCE_RELEASE_MANIFEST.json"]);
  for (const [name, bytes] of payload) if (name.endsWith(".md")) payload.set(name, Buffer.from(omitUnavailableMarkdownLinks(bytes.toString("utf8"), name, availableFiles)));
  // Every allowed payload is text. Normalize before hashing so Git's LF checkout policy
  // preserves both file bytes and manifest digests on Windows, macOS and Linux.
  for (const [name, bytes] of payload) payload.set(name, Buffer.from(bytes.toString("utf8").replace(/\r\n?/g, "\n")));
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
