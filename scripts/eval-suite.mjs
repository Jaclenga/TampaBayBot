import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { parseLlmConfig } from "../src/lib/llm/index.mjs";
import {
  runOfflineSuite,
  loadEvaluationContext,
  resolveOutput,
  writeReport,
  writeJsonArtifact,
  prepareOutputDirectory,
  PROJECT_ROOT,
  OFFLINE_SUITES,
} from "../evaluation/suite/runner.mjs";
import { makeReport, compareReports } from "../evaluation/suite/report.mjs";
import { normalizePricing } from "../evaluation/suite/usage.mjs";
import {
  runLiveSuite,
  liveConfigurationFingerprint,
  LIVE_CASE_IDS,
} from "../evaluation/suite/live.mjs";

const HELP = `TampaBayBot evaluation\n\nOffline (no model/network):\n  npm run eval:suite\n  npm run eval:suite -- --suite guardrails,providers --output work/evals/targeted\n\nExplicit live provider evaluation (uses local .env / process LLM_* settings):\n  npm run eval:live -- --allow-provider-call --limit 10 --repeats 1 --budget-ms 60000\n  Reports stay under ignored work/evals/live. No credentials, endpoints or raw responses are recorded.\n\nCompare two reports:\n  npm run eval:compare -- --baseline work/evals/before/latest.json --candidate work/evals/after/latest.json\n\nExit 0: all applicable checks pass. Exit 1: failed cases/regression. Exit 2: invalid configuration/report.\n`;

export function parseArguments(args) {
  const flags = {
    mode: "offline",
    suite: "all",
    limit: 10,
    repeats: 1,
    budgetMs: 60000,
  };
  const seen = new Set();
  const valued = {
    "--mode": "mode",
    "--suite": "suite",
    "--output": "output",
    "--baseline": "baseline",
    "--candidate": "candidate",
    "--limit": "limit",
    "--repeats": "repeats",
    "--budget-ms": "budgetMs",
    "--input-usd-per-million": "inputUsdPerMillion",
    "--output-usd-per-million": "outputUsdPerMillion",
    "--cached-input-usd-per-million": "cachedInputUsdPerMillion",
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error("Duplicate evaluation option.");
    seen.add(arg);
    if (arg === "--help") {
      flags.help = true;
      continue;
    }
    if (arg === "--allow-provider-call") {
      flags.authorized = true;
      continue;
    }
    if (arg === "--allow-changed-provenance") {
      flags.allowChangedProvenance = true;
      continue;
    }
    if (
      !Object.hasOwn(valued, arg) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Unknown evaluation option or missing value.");
    flags[valued[arg]] = args[++i];
  }
  if (!["offline", "live", "compare"].includes(flags.mode))
    throw new Error("Unknown evaluation mode.");
  if (
    flags.mode !== "live" &&
    (flags.authorized ||
      seen.has("--limit") ||
      seen.has("--repeats") ||
      seen.has("--budget-ms") ||
      seen.has("--input-usd-per-million") ||
      seen.has("--output-usd-per-million") ||
      seen.has("--cached-input-usd-per-million"))
  )
    throw new Error("Provider options are only valid in live mode.");
  if (
    flags.mode !== "compare" &&
    (flags.baseline || flags.candidate || flags.allowChangedProvenance)
  )
    throw new Error("Comparison options require compare mode.");
  if (flags.mode !== "offline" && seen.has("--suite"))
    throw new Error("Suite selection applies only to offline mode.");
  for (const [key, maximum, minimum] of [
    ["limit", LIVE_CASE_IDS.length, 1],
    ["repeats", 5, 1],
    ["budgetMs", 600000, 1000],
  ]) {
    if (
      !/^\d+$/.test(String(flags[key])) ||
      !Number.isSafeInteger(Number(flags[key])) ||
      Number(flags[key]) < minimum ||
      Number(flags[key]) > maximum
    )
      throw new Error("Invalid live evaluation limits.");
    flags[key] = Number(flags[key]);
  }
  try {
    flags.pricing = normalizePricing({
      inputUsdPerMillion: flags.inputUsdPerMillion,
      outputUsdPerMillion: flags.outputUsdPerMillion,
      cachedInputUsdPerMillion: flags.cachedInputUsdPerMillion,
    });
  } catch {
    throw new Error("Invalid token pricing. Supply both input and output USD rates per million tokens as finite, nonnegative numbers; the cached-input rate is optional.");
  }
  return flags;
}

async function localLlmEnvironment(root) {
  let local = {};
  try {
    local = parseEnv(await fs.readFile(path.join(root, ".env"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error("Unable to read the local model configuration.");
  }
  const keys = [
    "LLM_PROVIDER",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "LLM_API_KEY",
    "LLM_TIMEOUT_MS",
    "LLM_MAX_RESPONSE_BYTES",
    "LLM_ALLOW_PRIVATE_HTTP",
  ];
  return Object.fromEntries(
    keys.map((key) => [key, process.env[key] ?? local[key]]),
  );
}

export async function main(args = process.argv.slice(2)) {
  const flags = parseArguments(args);
  if (flags.help) {
    console.log(HELP + "\nOptional live cost estimates (operator-supplied USD per million tokens):\n  --input-usd-per-million <rate> --output-usd-per-million <rate>\n  --cached-input-usd-per-million <rate>  Optional; defaults to the input rate.\nMissing usage or pricing stays unknown. No model calls means zero API cost.\n");
    return 0;
  }
  if (flags.mode === "compare") {
    if (!flags.baseline || !flags.candidate)
      throw new Error(
        "Comparison requires --baseline and --candidate report paths.",
      );
    let baseline, candidate;
    try {
      baseline = JSON.parse(
        await fs.readFile(path.resolve(PROJECT_ROOT, flags.baseline), "utf8"),
      );
      candidate = JSON.parse(
        await fs.readFile(path.resolve(PROJECT_ROOT, flags.candidate), "utf8"),
      );
    } catch {
      throw new Error("Unable to read valid comparison reports.");
    }
    const comparison = compareReports(baseline, candidate, flags);
    const output = resolveOutput(flags.output ?? "work/evals/comparison");
    await writeJsonArtifact(comparison, "comparison.json", output);
    console.log(JSON.stringify(comparison, null, 2));
    return comparison.status === "passed" ? 0 : 1;
  }
  let report;
  let output;
  if (flags.mode === "live") {
    // Validate authorization and output destination before reading .env or calling a provider.
    if (!flags.authorized)
      throw new Error(
        "Live evaluation requires --allow-provider-call. It may send public test questions to the configured provider and incur costs.",
      );
    const liveRoot = resolveOutput("work/evals/live");
    output = resolveOutput(
      flags.output ??
        `work/evals/live/${new Date().toISOString().replaceAll(":", "-")}`,
    );
    const relative = path.relative(liveRoot, output);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error(
        "Live reports must remain under ignored work/evals/live.",
      );
    output = await prepareOutputDirectory(output);
    const actualLiveRoot = await fs.realpath(liveRoot);
    const expectedLiveRoot = path.join(
      await fs.realpath(PROJECT_ROOT),
      "work",
      "evals",
      "live",
    );
    if (path.relative(expectedLiveRoot, actualLiveRoot) !== "")
      throw new Error(
        "Live reports must remain under ignored work/evals/live.",
      );
    const actualRelative = path.relative(actualLiveRoot, output);
    if (actualRelative.startsWith("..") || path.isAbsolute(actualRelative))
      throw new Error(
        "Live reports must remain under ignored work/evals/live.",
      );
    const config = parseLlmConfig(await localLlmEnvironment(PROJECT_ROOT));
    if (!config.enabled || !config.valid)
      throw new Error(
        "Configure a valid enabled LLM provider in .env or process environment before live evaluation.",
      );
    const context = await loadEvaluationContext();
    const startedAt = new Date().toISOString();
    const limits = {
      limit: flags.limit,
      repeats: flags.repeats,
      budgetMs: flags.budgetMs,
    };
    const cases = await runLiveSuite({
      ...context,
      ...limits,
      config,
      authorized: true,
      pricing: flags.pricing,
    });
    report = makeReport(cases, {
      mode: "live",
      pricing: flags.pricing,
      startedAt,
      completedAt: new Date().toISOString(),
      provenance: {
        ...context.provenance,
        live: liveConfigurationFingerprint(config, { ...limits, pricing: flags.pricing }),
      },
    });
  } else {
    const selected =
      flags.suite === "all"
        ? Object.keys(OFFLINE_SUITES)
        : flags.suite.split(",");
    output = resolveOutput(flags.output ?? "evaluation/suite/results");
    report = await runOfflineSuite({ selected });
  }
  await writeReport(report, output);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        mode: report.mode,
        ...report.summary,
        output: path.relative(PROJECT_ROOT, output).split(path.sep).join("/"),
      },
      null,
      2,
    ),
  );
  return report.status === "passed" ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    // Diagnostics from known CLI checks are fixed messages. Do not dump stacks/config.
    const safe =
      error instanceof Error &&
      /^(Unknown|Duplicate|Invalid|Comparison|Unable to read valid|Live evaluation requires|Live reports must|Configure a valid|Reports must|Provider options|Suite selection|Evaluation provenance changed|Unsupported evaluation report|Offline and live|Comparison requires)/.test(
        error.message,
      );
    console.error(
      safe
        ? error.message
        : "Evaluation could not complete. Check the suite definitions and report configuration.",
    );
    process.exitCode = 2;
  }
}
