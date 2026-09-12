import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  makeReport,
  compareReports,
  reportJUnit,
} from "../evaluation/suite/report.mjs";
import {
  runOfflineSuite,
  resolveOutput,
  PROJECT_ROOT,
} from "../evaluation/suite/runner.mjs";
import {
  runLiveSuite,
  liveConfigurationFingerprint,
  summarizeLiveGeneration,
} from "../evaluation/suite/live.mjs";
import { parseArguments, main } from "../scripts/eval-suite.mjs";
import { parseLlmConfig } from "../src/lib/llm/index.mjs";
import { EVALUATION_DATE } from "../evaluation/scenarios.mjs";

const sources = JSON.parse(
  await fs.readFile(new URL("../data/sources.json", import.meta.url), "utf8"),
);
const chunks = JSON.parse(
  await fs.readFile(new URL("../data/chunks.json", import.meta.url), "utf8"),
);
const provenance = {
  evaluatedAsOf: EVALUATION_DATE,
  sourcesHash: "fixture-sources-hash",
  chunksHash: "fixture-chunks-hash",
  suiteDefinitionHash: "fixture-suite-hash",
  benchmarkHash: "fixture-benchmark-hash",
  scenarioHash: "fixture-scenario-hash",
  qualityBenchmarkHash: "fixture-quality-benchmark-hash",
};
const fixtureCheck = (id = "decision", passed = true, extra = {}) => ({
  id,
  kind: "behavior",
  passed,
  expected: "retained",
  observed: passed ? "retained" : "rejected",
  ...extra,
});
const fixtureCase = (
  id = "fixture-case",
  checks = [fixtureCheck()],
  extra = {},
) => ({
  id,
  suite: "guardrails",
  title: "Synthetic report fixture",
  fixture: "synthetic",
  durationMs: 1,
  checks,
  ...extra,
});
const report = (cases = [fixtureCase()], extra = {}) =>
  makeReport(cases, {
    mode: "offline",
    startedAt: EVALUATION_DATE,
    completedAt: EVALUATION_DATE,
    provenance: { ...provenance },
    ...extra,
  });
const privateFixture = "evaluation-private-fixture-credential";
const liveConfig = parseLlmConfig({
  LLM_PROVIDER: "ollama",
  LLM_BASE_URL: "http://127.0.0.1:11434",
  LLM_MODEL: "synthetic-evaluation-test-model",
  LLM_API_KEY: privateFixture,
});
const liveOptions = {
  authorized: true,
  config: liveConfig,
  sources,
  chunks,
  now: EVALUATION_DATE,
  limit: 1,
  repeats: 1,
  budgetMs: 1000,
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

async function rejectRedirectedLiveOutput(
  t,
  { actualLiveRoot, actualOutput, expectedMessage, expectedMkdirCalls },
) {
  const lexicalLiveRoot = path.join(PROJECT_ROOT, "work/evals/live");
  const lexicalOutput = path.join(lexicalLiveRoot, "synthetic-output-fixture");
  let reads = 0;
  let calls = 0;
  let mkdirCalls = 0;
  t.mock.method(fs, "realpath", async (value) => {
    const location = path.resolve(String(value));
    if (location === PROJECT_ROOT) return PROJECT_ROOT;
    if (location === lexicalLiveRoot) return actualLiveRoot;
    if (location === lexicalOutput) return actualOutput;
    throw new Error("Unexpected synthetic path lookup.");
  });
  t.mock.method(fs, "mkdir", async () => {
    mkdirCalls++;
  });
  // These mocks prohibit actual configuration reads, filesystem mutations or model calls.
  t.mock.method(fs, "readFile", async () => {
    reads++;
    throw new Error("Synthetic path test forbids reading configuration.");
  });
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Synthetic path test forbids provider calls.");
  });
  await assert.rejects(
    main([
      "--mode",
      "live",
      "--allow-provider-call",
      "--output",
      path.relative(PROJECT_ROOT, lexicalOutput),
    ]),
    expectedMessage,
  );
  assert.equal(reads, 0);
  assert.equal(calls, 0);
  if (expectedMkdirCalls !== undefined)
    assert.equal(mkdirCalls, expectedMkdirCalls);
}

test("report totals exclude inapplicable checks and retain genuine case failures", () => {
  const result = report([
    fixtureCase("passing", [
      fixtureCheck("applicable"),
      fixtureCheck("inapplicable", null),
    ]),
    fixtureCase("failing", [fixtureCheck("rejected", false)]),
  ]);
  assert.equal(result.status, "failed");
  assert.equal(result.summary.cases, 2);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.summary.checks, {
    passed: 1,
    failed: 1,
    applicable: 2,
    notApplicable: 1,
    rate: 0.5,
  });
  assert.equal(result.metrics["guardrails/inapplicable"].rate, null);
  assert.equal(result.humanEvaluation.factualCorrectness, null);
  assert.equal(
    result.humanEvaluation.status,
    "pending_independent_human_review",
  );
});

test("empty runs, empty checks and wholly inapplicable cases cannot pass", () => {
  for (const cases of [
    null,
    [],
    [fixtureCase("empty", [])],
    [fixtureCase("null-only", [fixtureCheck("not-applicable", null)])],
  ]) {
    assert.throws(() => report(cases));
  }
  assert.throws(() => report([fixtureCase()], { mode: "invented-mode" }));
});

test("case and check identifiers must be explicit strings and all required fields are validated", () => {
  for (const change of [
    (row) => {
      delete row.id;
    },
    (row) => {
      row.id = 42;
    },
    (row) => {
      row.id = "";
    },
    (row) => {
      delete row.checks[0].id;
    },
    (row) => {
      row.checks[0].id = 42;
    },
    (row) => {
      row.checks[0].kind = "unscored";
    },
    (row) => {
      row.checks[0].passed = "true";
    },
    (row) => {
      delete row.checks[0].passed;
    },
    (row) => {
      row.durationMs = Infinity;
    },
    (row) => {
      row.durationMs = -1;
    },
    (row) => {
      row.suite = "unknown";
    },
    (row) => {
      row.fixture = "resident-traffic";
    },
    (row) => {
      row.title = " ";
    },
  ]) {
    const row = fixtureCase();
    change(row);
    assert.throws(() => report([row]));
  }
});

test("duplicate cases and check IDs are rejected while IDs remain scoped to their suite", () => {
  assert.throws(() => report([fixtureCase("same"), fixtureCase("same")]));
  assert.throws(() =>
    report([
      fixtureCase("duplicate-checks", [
        fixtureCheck("same"),
        fixtureCheck("same"),
      ]),
    ]),
  );
  const result = report([
    fixtureCase("same"),
    fixtureCase("same", [fixtureCheck()], { suite: "providers" }),
  ]);
  assert.equal(result.summary.cases, 2);
  assert.equal(result.summary.suites.guardrails.passed, 1);
  assert.equal(result.summary.suites.providers.passed, 1);
});

test("report and comparator derive failures from checks, ignoring fabricated pass summaries", () => {
  const baseline = report();
  const candidate = report([
    fixtureCase("fixture-case", [fixtureCheck("decision", false)], {
      passed: true,
    }),
  ]);
  assert.equal(candidate.cases[0].passed, false);
  candidate.status = "passed";
  candidate.summary = { cases: 100000, passed: 100000, failed: 0 };
  candidate.cases[0].passed = true;
  const result = compareReports(baseline, candidate);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.candidateFailingCases, ["guardrails/fixture-case"]);
  assert.ok(
    result.regressions.some((item) => item.check === "decision:regressed"),
  );
});

test("new failing cases and newly introduced failing checks fail comparison", () => {
  const baseline = report();
  for (const candidate of [
    report([
      fixtureCase(),
      fixtureCase("new-case", [fixtureCheck("new-check", false)]),
    ]),
    report([
      fixtureCase("fixture-case", [
        fixtureCheck(),
        fixtureCheck("new-check", false),
      ]),
    ]),
  ])
    assert.equal(compareReports(baseline, candidate).status, "failed");
  const addedPassing = compareReports(
    baseline,
    report([fixtureCase(), fixtureCase("new-passing-case")]),
  );
  assert.equal(addedPassing.status, "passed");
  assert.deepEqual(addedPassing.addedCases, ["guardrails/new-passing-case"]);
});

test("removing a case or an existing check is an explicit regression", () => {
  const baseline = report([
    fixtureCase("first", [fixtureCheck("kept"), fixtureCheck("removed")]),
    fixtureCase("second"),
  ]);
  const candidate = report([fixtureCase("first", [fixtureCheck("kept")])]);
  const result = compareReports(baseline, candidate);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.regressions, [
    { case: "guardrails/first", check: "removed:removed" },
    { case: "guardrails/second", check: "case_removed" },
  ]);
});

test("turning applicable checks into null cannot conceal regressions or existing failures", () => {
  for (const previous of [true, false]) {
    const baseline = report([
      fixtureCase("case", [
        fixtureCheck("decision", previous),
        fixtureCheck("anchor"),
      ]),
    ]);
    const candidate = report([
      fixtureCase("case", [
        fixtureCheck("decision", null),
        fixtureCheck("anchor"),
      ]),
    ]);
    const result = compareReports(baseline, candidate);
    assert.equal(result.status, "failed");
    assert.equal(result.regressions.length, 1);
    assert.match(
      result.regressions[0].check,
      /decision:(regressed|became_inapplicable)/,
    );
  }
});

test("weakened expectations and changes in check kind require review even if checks still pass", () => {
  const baseline = report([
    fixtureCase("case", [
      fixtureCheck("decision", true, { expected: { minimum: 2 } }),
    ]),
  ]);
  for (const changed of [
    fixtureCheck("decision", true, { expected: { minimum: 1 } }),
    fixtureCheck("decision", true, { expected: { minimum: 2 }, kind: "proxy" }),
  ]) {
    const result = compareReports(
      baseline,
      report([fixtureCase("case", [changed])]),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.regressions[0].check, "decision:expectation_changed");
  }
});

test("comparison requires complete matching corpus, question, scenario and quality provenance unless explicitly reviewed", () => {
  const baseline = report();
  for (const key of Object.keys(provenance)) {
    const candidate = report();
    delete candidate.provenance[key];
    assert.throws(() => compareReports(baseline, candidate), /provenance/);
    candidate.provenance[key] = "changed-fixture-provenance";
    assert.throws(
      () => compareReports(baseline, candidate),
      /provenance changed/,
    );
    const allowed = compareReports(baseline, candidate, {
      allowChangedProvenance: true,
    });
    assert.equal(allowed.status, "passed");
    assert.deepEqual(allowed.provenanceChanges, [key]);
  }
  const failed = report([
    fixtureCase("fixture-case", [fixtureCheck("decision", false)]),
  ]);
  failed.provenance.sourcesHash = "changed-fixture-provenance";
  assert.equal(
    compareReports(baseline, failed, { allowChangedProvenance: true }).status,
    "failed",
  );
});

test("structurally identical JSON expectations survive object-key reordering", () => {
  const before = { minimum: 1, nested: { allowed: ["first", "second"], maximum: 2 } };
  const after = { nested: { maximum: 2, allowed: ["first", "second"] }, minimum: 1 };
  const baseline = report([fixtureCase("json-order", [fixtureCheck("decision", true, { expected: before })])]);
  const candidate = report([fixtureCase("json-order", [fixtureCheck("decision", true, { expected: after })])]);
  assert.equal(compareReports(baseline, candidate).status, "passed");
  candidate.cases[0].checks[0].expected.nested.allowed.reverse();
  assert.equal(compareReports(baseline, candidate).status, "failed");
});

test("non-JSON check data cannot collapse into null or omitted expectations", () => {
  const circular = {};
  circular.self = circular;
  for (const field of ["expected", "observed"]) {
    for (const value of [NaN, Infinity, -Infinity, { nested: undefined }, { nested: () => true }, 1n, new Date(), Array(1), circular]) {
      assert.throws(() => report([fixtureCase("invalid-json", [fixtureCheck("decision", true, { [field]: value })])]), /JSON data/);
    }
  }
  const baseline = report([fixtureCase("null-data", [fixtureCheck("decision", true, { expected: null })])]);
  const candidate = structuredClone(baseline);
  candidate.cases[0].checks[0].expected = NaN;
  assert.throws(() => compareReports(baseline, candidate), /JSON data/);
});

test("required case and check fields must be owned and serialized", () => {
  for (const inherited of [true, false]) {
    const row = fixtureCase();
    const original = row.checks[0];
    if (inherited) {
      row.checks[0] = Object.assign(Object.create({ passed: true }), original);
      delete row.checks[0].passed;
    } else {
      Object.defineProperty(row.checks[0], "passed", { value: true, enumerable: false });
    }
    assert.throws(() => report([row]), /evaluation check/);
  }
  const row = Object.assign(Object.create({ id: "inherited-case" }), fixtureCase());
  delete row.id;
  assert.throws(() => report([row]), /evaluation case/);
  const arrayCheck = fixtureCase();
  arrayCheck.checks[0] = Object.assign([], arrayCheck.checks[0]);
  assert.throws(() => report([arrayCheck]), /evaluation check/);
});

test("report snapshots detach nested checks and provenance from caller mutations", () => {
  const row = fixtureCase("snapshot", [fixtureCheck("decision", true, { expected: { minimum: 2 } })]);
  const inputProvenance = { ...provenance, selectedSuites: ["guardrails"] };
  const captured = report([row], { provenance: inputProvenance });
  row.checks[0].passed = false;
  row.checks[0].expected.minimum = 0;
  inputProvenance.sourcesHash = "changed-after-report";
  inputProvenance.selectedSuites.push("providers");
  assert.equal(captured.status, "passed");
  assert.equal(captured.cases[0].checks[0].passed, true);
  assert.deepEqual(captured.cases[0].checks[0].expected, { minimum: 2 });
  assert.equal(captured.provenance.sourcesHash, provenance.sourcesHash);
  assert.deepEqual(captured.provenance.selectedSuites, ["guardrails"]);
  assert.equal(JSON.parse(JSON.stringify(captured)).summary.failed, 0);
});

test("incompatible schemas and offline/live modes cannot be compared", () => {
  const baseline = report();
  assert.throws(
    () => compareReports({ ...baseline, schemaVersion: 999 }, report()),
    /schema/,
  );
  assert.throws(
    () => compareReports(baseline, report(undefined, { mode: "live" })),
    /Offline and live/,
  );
  assert.throws(
    () => compareReports(baseline, { ...report(), mode: "invented-mode" }),
    /mode/,
  );
});

test("JUnit output escapes source-controlled titles and strips illegal XML control characters", () => {
  const output = reportJUnit(
    report([
      fixtureCase("xml-title", [fixtureCheck("failed-check", false)], {
        title: "A <tag> & \"quoted\" 'label'\u0001",
      }),
    ]),
  );
  assert.match(
    output,
    /A &lt;tag&gt; &amp; &quot;quoted&quot; &apos;label&apos;/,
  );
  assert.ok(!output.includes("\u0001"));
  assert.ok(!output.includes("<tag>"));
  assert.match(output, /tests="1" failures="1"/);
  assert.match(
    output,
    /<failure message="failed-check">Failed checks: failed-check<\/failure>/,
  );
});

test("CLI parsing rejects unknown, repeated, missing and mode-incompatible options", () => {
  for (const args of [
    ["--unknown"],
    ["--output"],
    ["--mode", "--help"],
    ["--mode", "offline", "--mode", "offline"],
    ["--mode", "unrecognized"],
    ["--allow-provider-call"],
    ["--limit", "1"],
    ["--baseline", "fixture.json"],
    ["--mode", "live", "--suite", "guardrails"],
    ["--mode", "live", "--limit", "0"],
    ["--mode", "live", "--limit", "13"],
    ["--mode", "live", "--repeats", "1.5"],
    ["--mode", "live", "--budget-ms", "999"],
  ])
    assert.throws(() => parseArguments(args));
  const flags = parseArguments([
    "--mode",
    "live",
    "--allow-provider-call",
    "--limit",
    "2",
    "--repeats",
    "3",
    "--budget-ms",
    "1000",
  ]);
  assert.equal(flags.authorized, true);
  assert.equal(flags.limit, 2);
  assert.equal(flags.repeats, 3);
  assert.equal(flags.budgetMs, 1000);
  assert.equal(parseArguments([]).mode, "offline");
});

test("CLI live mode requires opt-in before any filesystem configuration access", async (t) => {
  let fileReads = 0;
  // Block every read: this test cannot open the actual .env even if the gate regresses.
  t.mock.method(fs, "readFile", async () => {
    fileReads++;
    throw new Error("Fixture forbids all CLI file access.");
  });
  await assert.rejects(main(["--mode", "live"]), /--allow-provider-call/);
  assert.equal(fileReads, 0);
});

test("live output root redirected to a tracked checkout directory is rejected before configuration access", async (t) => {
  const redirectedRoot = path.join(PROJECT_ROOT, "evaluation/suite/results");
  await rejectRedirectedLiveOutput(t, {
    actualLiveRoot: redirectedRoot,
    actualOutput: path.join(redirectedRoot, "synthetic-output-fixture"),
    expectedMessage: /Live reports must/,
  });
});

test("a redirected child of the legitimate live output root cannot escape into tracked directories", async (t) => {
  await rejectRedirectedLiveOutput(t, {
    actualLiveRoot: path.join(PROJECT_ROOT, "work/evals/live"),
    actualOutput: path.join(
      PROJECT_ROOT,
      "evaluation/suite/results/synthetic-output-fixture",
    ),
    expectedMessage: /Live reports must/,
  });
});

test("live output resolving outside the checkout is rejected before directory creation or configuration access", async (t) => {
  await rejectRedirectedLiveOutput(t, {
    actualLiveRoot: path.join(PROJECT_ROOT, "work/evals/live"),
    actualOutput: path.resolve(PROJECT_ROOT, "../synthetic-outside-fixture"),
    expectedMessage: /Reports must stay inside the checkout/,
    expectedMkdirCalls: 0,
  });
});

test("an unchanged physical live directory passes containment and reaches only the mocked configuration boundary", async (t) => {
  let reads = 0;
  let calls = 0;
  t.mock.method(fs, "realpath", async (value) => path.resolve(String(value)));
  t.mock.method(fs, "mkdir", async () => {});
  // A positive containment case must not be satisfied by rejecting every path.
  // Stop at this mocked read; no actual .env content can be accessed.
  t.mock.method(fs, "readFile", async (value) => {
    reads++;
    assert.equal(path.resolve(String(value)), path.join(PROJECT_ROOT, ".env"));
    throw new Error("Synthetic configuration boundary reached.");
  });
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Synthetic containment test must not call a provider.");
  });
  await assert.rejects(
    main([
      "--mode",
      "live",
      "--allow-provider-call",
      "--output",
      "work/evals/live/synthetic-output-fixture",
    ]),
    /Unable to read the local model configuration/,
  );
  assert.equal(reads, 1);
  assert.equal(calls, 0);
});

test("offline runner validates suite selection, confines output paths and restores its fetch override", async () => {
  for (const selected of [[], ["unknown"], ["guardrails", "guardrails"]]) {
    await assert.rejects(
      runOfflineSuite({ selected, context: {} }),
      /selection/,
    );
  }
  assert.throws(() => resolveOutput("."), /subdirectory/);
  assert.throws(() => resolveOutput("../outside-checkout"), /subdirectory/);
  assert.equal(
    resolveOutput("work/evals/fixture"),
    path.join(PROJECT_ROOT, "work/evals/fixture"),
  );
  const originalFetch = globalThis.fetch;
  try {
    const result = await runOfflineSuite({
      selected: ["guardrails"],
      context: { sources, chunks, now: EVALUATION_DATE, provenance },
    });
    assert.equal(result.status, "passed");
    assert.deepEqual(Object.keys(result.summary.suites), ["guardrails"]);
    assert.equal(result.provenance.outboundFetch, "disabled");
    assert.equal(globalThis.fetch, originalFetch);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unauthorized, unconfigured and invalid-limit live runs make zero provider calls", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    throw new Error("A rejected run must never call a provider.");
  };
  for (const authorized of [
    false,
    undefined,
    null,
    "false",
    "true",
    1,
    {},
    [],
  ]) {
    await assert.rejects(
      runLiveSuite({ ...liveOptions, authorized, fetchImpl }),
      /--allow-provider-call/,
    );
  }
  await assert.rejects(
    runLiveSuite({ ...liveOptions, config: parseLlmConfig(), fetchImpl }),
    /enabled/,
  );
  for (const limits of [
    { limit: 0 },
    { limit: 13 },
    { repeats: 6 },
    { repeats: 0 },
    { budgetMs: 999 },
  ]) {
    await assert.rejects(
      runLiveSuite({ ...liveOptions, ...limits, fetchImpl }),
      /limits/,
    );
  }
  assert.equal(calls, 0);
});

test("a valid mocked live response must be accepted by the actual guarded model path", async () => {
  let calls = 0;
  const rows = await runLiveSuite({
    ...liveOptions,
    fetchImpl: async (_, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.ok(!init.body.includes(privateFixture));
      const evidence = JSON.parse(
        body.messages.find((message) => message.role === "user").content,
      ).evidence;
      return json({
        done: true,
        message: {
          content: JSON.stringify({
            selections: evidence
              .slice(0, 2)
              .map(({ id, quote }) => ({ id, quote })),
          }),
        },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].details.generation, { status: "used", reason: null });
  assert.equal(rows[0].details.providerCalls, 1);
  assert.equal(
    rows[0].checks.find((check) => check.id === "non_answered_skips_inference")
      .passed,
    null,
  );
  assert.equal(
    rows[0].checks.find((check) => check.id === "model_output_accepted").passed,
    true,
  );
  assert.equal(
    rows[0].checks.find((check) => check.id === "guarded_application_path")
      .passed,
    true,
  );
  assert.equal(
    rows[0].checks.some((check) => check.passed === false),
    false,
  );
  assert.ok(!JSON.stringify(rows).includes(privateFixture));
});

test("provider failure cannot pass live model evaluation merely because fallback citations remain valid", async () => {
  let calls = 0;
  const rows = await runLiveSuite({
    ...liveOptions,
    fetchImpl: async () => {
      calls++;
      return json({ error: privateFixture }, 503);
    },
  });
  assert.equal(calls, 1);
  const acceptance = rows[0].checks.find(
    (check) => check.id === "model_output_accepted",
  );
  assert.equal(acceptance.passed, false);
  assert.equal(acceptance.observed, "fallback");
  assert.deepEqual(rows[0].details.generation, {
    status: "fallback",
    reason: "provider_failure",
  });
  assert.equal(rows[0].details.providerCalls, 1);
  assert.equal(
    rows[0].checks.find((check) => check.id === "citation_quote_exact").passed,
    true,
  );
  assert.equal(makeReport(rows, { mode: "live", provenance }).status, "failed");
  assert.ok(!JSON.stringify(rows).includes(privateFixture));
});

test("live diagnostics retain safe failure reasons and exclude arbitrary provider output", async () => {
  const rows = await runLiveSuite({
    ...liveOptions,
    fetchImpl: async () =>
      json({ done: true, message: { content: privateFixture } }),
  });
  assert.deepEqual(rows[0].details.generation, {
    status: "fallback",
    reason: "invalid_output",
  });
  assert.equal(rows[0].details.providerCalls, 1);
  assert.ok(!JSON.stringify(rows).includes(privateFixture));

  const sanitized = summarizeLiveGeneration({
    status: privateFixture,
    reason: liveConfig.endpoint,
    rawResponse: privateFixture,
    model: liveConfig.model,
  });
  assert.deepEqual(sanitized, {
    status: "unexpected_value",
    reason: "unexpected_value",
  });
  assert.deepEqual(summarizeLiveGeneration(), { status: "missing", reason: null });
  assert.deepEqual(summarizeLiveGeneration({ status: "fallback", reason: "timeout" }), {
    status: "fallback",
    reason: "timeout",
  });
});

test("non-answered live cases explicitly verify inference is skipped with zero provider calls", async () => {
  let calls = 0;
  const rows = await runLiveSuite({
    ...liveOptions,
    limit: 12,
    budgetMs: 10000,
    fetchImpl: async (_, init) => {
      calls++;
      const body = JSON.parse(init.body);
      const evidence = JSON.parse(
        body.messages.find((message) => message.role === "user").content,
      ).evidence;
      return json({
        done: true,
        message: {
          content: JSON.stringify({
            selections: evidence.slice(0, 1).map(({ id, quote }) => ({ id, quote })),
          }),
        },
      });
    },
  });
  const skipped = rows.filter((row) =>
    row.checks.some(
      (check) => check.id === "non_answered_skips_inference" && check.passed === true,
    ),
  );
  assert.deepEqual(skipped.map((row) => row.id), [
    "z02-r1", "z05-r1", "p06-r1", "d01-r1", "d06-r1", "n08-r1",
  ]);
  assert.equal(calls, 6);
  for (const row of skipped) {
    assert.deepEqual(row.details.generation, {
      status: "skipped",
      reason: "non_answered_status",
    });
    assert.equal(row.details.providerCalls, 0);
    assert.equal(
      row.checks.find((check) => check.id === "model_output_accepted").passed,
      null,
    );
  }
  assert.equal(makeReport(rows, { mode: "live", provenance }).status, "passed");
});

test("aborted live runs make zero calls and record each unexecuted case as a failure", async () => {
  let calls = 0;
  const rows = await runLiveSuite({
    ...liveOptions,
    limit: 2,
    repeats: 2,
    signal: AbortSignal.abort(),
    fetchImpl: () => {
      calls++;
      throw new Error("Aborted fixture must not fetch.");
    },
  });
  assert.equal(calls, 0);
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((row) => row.id)).size, 4);
  assert.ok(
    rows.every((row) =>
      row.checks.some(
        (check) =>
          check.id === "run_budget_available" && check.passed === false,
      ),
    ),
  );
  assert.equal(
    makeReport(rows, { mode: "live", provenance }).summary.failed,
    4,
  );
});

test("live configuration provenance hashes model identity without retaining endpoint or credentials", () => {
  const first = liveConfigurationFingerprint(liveConfig, {
    limit: 1,
    repeats: 1,
    budgetMs: 1000,
  });
  const second = liveConfigurationFingerprint(liveConfig, {
    limit: 1,
    repeats: 1,
    budgetMs: 1000,
  });
  assert.deepEqual(first, second);
  assert.match(first.modelHash, /^[a-f0-9]{64}$/);
  for (const sensitive of [
    privateFixture,
    liveConfig.model,
    liveConfig.endpoint,
  ])
    assert.ok(!JSON.stringify(first).includes(sensitive));
});
