import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runNavigationSuite } from "./navigation.mjs";
import { runGuardrailSuite } from "./guardrails.mjs";
import { runProviderSuite } from "./providers.mjs";
import { runMetamorphicSuite } from "./metamorphic.mjs";
import { runJurisdictionSuite } from "./jurisdiction.mjs";
import { runQualitySuite } from "./quality.mjs";
import {
  makeReport,
  reportMarkdown,
  reportJUnit,
  validateCases,
} from "./report.mjs";
import { EVALUATION_DATE } from "../scenarios.mjs";
import { readCorpus, json } from "../../src/lib/ingestion/generation.mjs";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const OFFLINE_SUITES = Object.freeze({
  navigation: runNavigationSuite,
  guardrails: runGuardrailSuite,
  providers: runProviderSuite,
  metamorphic: runMetamorphicSuite,
  jurisdiction: runJurisdictionSuite,
  quality: runQualitySuite,
});
const sha = (text) => createHash("sha256").update(text).digest("hex");

async function hashTree(directory, suffixes = [".mjs", ".ts", ".json"]) {
  const parts = [];
  async function walk(relative) {
    for (const entry of (
      await fs.readdir(path.join(directory, relative), { withFileTypes: true })
    ).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (["results", "node_modules"].includes(entry.name)) continue;
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (suffixes.some((suffix) => entry.name.endsWith(suffix)))
        parts.push(
          `${name.split(path.sep).join("/")}\0${sha(await fs.readFile(path.join(directory, name)))}`,
        );
    }
  }
  await walk("");
  return sha(parts.join("\n"));
}

export async function loadEvaluationContext(root = PROJECT_ROOT) {
  const corpus = await readCorpus(root);
  const sourceText = json(corpus.sources);
  const chunkText = json(corpus.chunks);
  const qualityBenchmarkText = await fs.readFile(
    path.join(root, "evaluation/quality-benchmark.json"),
  );
  let commit = null,
    dirty = null;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirty = Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
        timeout: 2000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    /* Source-file hashes remain usable outside a Git checkout/sandbox. */
  }
  return {
    sources: corpus.sources,
    chunks: corpus.chunks,
    now: EVALUATION_DATE,
    provenance: {
      evaluatedAsOf: EVALUATION_DATE,
      sourcesHash: sha(sourceText),
      chunksHash: sha(chunkText),
      suiteDefinitionHash: await hashTree(path.join(root, "evaluation/suite")),
      implementationHash: await hashTree(path.join(root, "src", "lib")),
      promptHash: sha(
        await fs.readFile(path.join(root, "src/lib/guardrails/prompts.mjs")),
      ),
      benchmarkHash: sha(
        await fs.readFile(path.join(root, "evaluation/benchmarks.mjs")),
      ),
      scenarioHash: sha(
        await fs.readFile(path.join(root, "evaluation/scenarios.mjs")),
      ),
      qualityBenchmarkHash: sha(qualityBenchmarkText),
      gitCommit: commit,
      workingTreeDirty: dirty,
      nodeVersion: process.version,
    },
  };
}

async function executeOfflineSuite({
  selected = Object.keys(OFFLINE_SUITES),
  context,
} = {}) {
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((name) => !Object.hasOwn(OFFLINE_SUITES, name))
  )
    throw new Error("Unknown, duplicate or empty evaluation suite selection.");
  context ??= await loadEvaluationContext();
  const startedAt = new Date().toISOString();
  const cases = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Outbound fetch is disabled in offline evaluation.");
  };
  try {
    for (const name of selected) {
      try {
        const rows = await OFFLINE_SUITES[name](context);
        validateCases(rows);
        if (rows.some((row) => row.suite !== name))
          throw new Error("Mismatched suite result.");
        cases.push(...rows);
      } catch {
        cases.push({
          id: "suite-execution",
          suite: name,
          title: "Suite execution completed",
          fixture: "synthetic",
          durationMs: 0,
          checks: [
            {
              id: "suite_execution",
              kind: "robustness",
              passed: false,
              expected: "completed",
              observed: "execution_failed",
            },
          ],
        });
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  return makeReport(cases, {
    mode: "offline",
    startedAt,
    completedAt: new Date().toISOString(),
    provenance: {
      ...context.provenance,
      selectedSuites: selected,
      outboundFetch: "disabled",
    },
  });
}

// The temporary fetch prohibition is process-wide; serialize library callers.
let pendingOffline = Promise.resolve();
export function runOfflineSuite(options) {
  const job = pendingOffline.then(() => executeOfflineSuite(options));
  pendingOffline = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

export function resolveOutput(directory, root = PROJECT_ROOT) {
  const output = path.resolve(root, directory);
  const relative = path.relative(root, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(
      "Reports must be written to a subdirectory inside this checkout.",
    );
  return output;
}

export async function prepareOutputDirectory(directory, root = PROJECT_ROOT) {
  const actualRoot = await fs.realpath(root);
  const inside = (target) => {
    const relative = path.relative(actualRoot, target);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  let ancestor = directory;
  while (true) {
    try {
      if (!inside(await fs.realpath(ancestor)))
        throw new Error(
          "Reports must stay inside the checkout; external links are not allowed.",
        );
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor)
        throw new Error("Unable to resolve the report destination.");
      ancestor = parent;
    }
  }
  await fs.mkdir(directory, { recursive: true });
  const actual = await fs.realpath(directory);
  if (!inside(actual))
    throw new Error("Reports must stay inside the checkout.");
  return actual;
}

export async function writeJsonArtifact(value, name, directory) {
  if (!/^[a-z][a-z-]*\.json$/.test(name))
    throw new Error("Invalid report filename.");
  directory = await prepareOutputDirectory(directory);
  const temporary = path.join(directory, `${name}.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, path.join(directory, name));
}

export async function writeReport(report, directory) {
  directory = await prepareOutputDirectory(directory);
  const files = {
    "latest.json": JSON.stringify(report, null, 2) + "\n",
    "latest.md": reportMarkdown(report),
    "junit.xml": reportJUnit(report),
  };
  for (const [name, content] of Object.entries(files)) {
    const temporary = path.join(directory, `${name}.${randomUUID()}.tmp`);
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, path.join(directory, name));
  }
}
