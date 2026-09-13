export const SUITE_VERSION = "1.2.0";
const kinds = new Set([
  "behavior",
  "integrity",
  "privacy",
  "robustness",
  "proxy",
  "accuracy",
  "citation",
]);
const suites = new Set([
  "navigation",
  "guardrails",
  "providers",
  "metamorphic",
  "jurisdiction",
  "quality",
  "live",
]);
const fixtures = new Set([
  "public_snapshot",
  "synthetic",
  "public_snapshot_with_synthetic_input",
]);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,150}$/;

const ownsSerializedFields = (value, fields) =>
  fields.every((field) => Object.prototype.propertyIsEnumerable.call(value, field));

// Expectations and observations are JSON data: serialization must not turn
// NaN into null, omit undefined children, or invoke a custom toJSON conversion.
function jsonData(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  const array = Array.isArray(value);
  if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  const keys = Object.keys(value);
  if (array && (keys.length !== value.length || !Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean))) return false;
  ancestors.add(value);
  const valid = keys.every((key) => jsonData(value[key], ancestors));
  ancestors.delete(value);
  return valid;
}

function equalJson(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]));
}

export function validateCases(cases) {
  if (!Array.isArray(cases) || !cases.length)
    throw new Error("Evaluation must contain cases.");
  const keys = new Set();
  for (const row of cases) {
    const key = `${row?.suite}/${row?.id}`;
    if (
      !row ||
      typeof row !== "object" || Array.isArray(row) ||
      !ownsSerializedFields(row, ["id", "suite", "title", "fixture", "durationMs", "checks"]) ||
      !suites.has(row.suite) ||
      typeof row.id !== "string" ||
      !identifier.test(row.id) ||
      keys.has(key) ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      !fixtures.has(row.fixture) ||
      !Number.isFinite(row.durationMs) ||
      row.durationMs < 0 ||
      !Array.isArray(row.checks) ||
      !row.checks.length
    )
      throw new Error("Invalid or duplicate evaluation case.");
    keys.add(key);
    const checkIds = new Set();
    for (const check of row.checks) {
      if (
        !check ||
        typeof check !== "object" || Array.isArray(check) ||
        !ownsSerializedFields(check, ["id", "kind", "passed"]) ||
        typeof check.id !== "string" ||
        !identifier.test(check.id) ||
        checkIds.has(check.id) ||
        !kinds.has(check.kind) ||
        (check.passed !== null && typeof check.passed !== "boolean")
      )
        throw new Error("Invalid or duplicate evaluation check.");
      for (const field of ["expected", "observed"]) {
        if (check[field] !== undefined && (!ownsSerializedFields(check, [field]) || !jsonData(check[field])))
          throw new Error("Invalid evaluation check JSON data.");
      }
      checkIds.add(check.id);
    }
    if (row.checks.every((check) => check.passed === null))
      throw new Error("A case with no applicable checks cannot pass.");
  }
  return cases;
}

function counts(checks) {
  const applicable = checks.filter((check) => check.passed !== null);
  const passed = applicable.filter((check) => check.passed).length;
  return {
    passed,
    failed: applicable.length - passed,
    applicable: applicable.length,
    notApplicable: checks.length - applicable.length,
    rate: applicable.length ? passed / applicable.length : null,
  };
}

function latency(cases) {
  const values = cases.map((row) => row.durationMs).sort((a, b) => a - b);
  const percentile = (p) =>
    values.length
      ? Math.round(
          values[Math.max(0, Math.ceil(values.length * p) - 1)] * 100,
        ) / 100
      : null;
  return {
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    note: "Whole-case wall time on this machine; offline cases are not model latency measurements.",
  };
}

export function makeReport(
  cases,
  { mode = "offline", startedAt, completedAt, provenance = {} } = {},
) {
  validateCases(cases);
  if (!["offline", "live"].includes(mode))
    throw new Error("Unknown evaluation mode.");
  const snapshots = structuredClone(cases);
  validateCases(snapshots);
  const rows = snapshots.map((row) => ({
    ...row,
    passed: row.checks.every((check) => check.passed !== false),
  }));
  const grouped = Object.fromEntries(
    [...new Set(rows.map((row) => row.suite))].map((name) => {
      const selected = rows.filter((row) => row.suite === name);
      return [
        name,
        {
          cases: selected.length,
          passed: selected.filter((row) => row.passed).length,
          failed: selected.filter((row) => !row.passed).length,
          checks: counts(selected.flatMap((row) => row.checks)),
          latency: latency(selected),
        },
      ];
    }),
  );
  const allChecks = rows.flatMap((row) => row.checks);
  const qualityChecks = rows
    .filter((row) => row.suite === "quality")
    .flatMap((row) => row.checks);
  const qualityMetric = (id) =>
    counts(qualityChecks.filter((check) => check.id === id));
  const metrics = {};
  for (const row of rows)
    for (const check of row.checks) {
      const key = `${row.suite}/${check.id}`;
      (metrics[key] ??= { kind: check.kind, values: [] }).values.push(check);
    }
  return {
    schemaVersion: 1,
    suiteVersion: SUITE_VERSION,
    mode,
    startedAt,
    completedAt,
    provenance: structuredClone(provenance),
    status: rows.every((row) => row.passed) ? "passed" : "failed",
    summary: {
      cases: rows.length,
      passed: rows.filter((row) => row.passed).length,
      failed: rows.filter((row) => !row.passed).length,
      checks: counts(allChecks),
      suites: grouped,
    },
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([key, value]) => [
        key,
        { kind: value.kind, ...counts(value.values) },
      ]),
    ),
    automatedQuality: qualityChecks.length
      ? {
          scope: "Exact authored claims in the fixed extractive answer format against the retained dated snapshots.",
          factualAccuracy: qualityMetric("factual_accuracy"),
          citationCorrectness: qualityMetric("citation_correctness"),
          citationCompleteness: qualityMetric("citation_completeness"),
        }
      : null,
    humanEvaluation: {
      factualCorrectness: null,
      residentUsefulness: null,
      completeness: null,
      status: "pending_independent_human_review",
    },
    limitations: [
      "Hand-authored development cases and seeded variants are not an independent holdout.",
      "Automated accuracy and citation scores cover exact authored claims in fixed extractive answers; they do not measure open-ended semantic correctness or whether a source remains true today.",
      "Offline provider responses are synthetic. Live results apply only to the tested model and configuration.",
      "These reports do not score geographic accuracy or replace the separate GIS, browser, accessibility or human audits.",
      "Prompt and identifier-pattern checks do not establish universal attack resistance or complete personal-data detection.",
    ],
    cases: rows,
  };
}

const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
const markdown = (value) =>
  String(value)
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ");

export function reportMarkdown(report) {
  const lines = [
    `# TampaBayBot evaluation — ${report.status}`,
    "",
    `${report.summary.passed}/${report.summary.cases} cases passed in ${report.mode} mode. Suite ${report.suiteVersion}.`,
    "",
    "| Suite | Passed | Failed | Applicable checks |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const [name, value] of Object.entries(report.summary.suites))
    lines.push(
      `| ${markdown(name)} | ${value.passed} | ${value.failed} | ${value.checks.applicable} |`,
    );
  if (report.automatedQuality) {
    lines.push(
      "",
      "## Scoped answer-quality metrics",
      "",
      "| Metric | Passed | Failed | Not applicable |",
      "| --- | ---: | ---: | ---: |",
    );
    const qualityLabels = {
      factualAccuracy: "Factual accuracy",
      citationCorrectness: "Citation correctness",
      citationCompleteness: "Citation completeness",
    };
    for (const [name, value] of Object.entries(report.automatedQuality)) {
      if (name === "scope") continue;
      lines.push(
        `| ${qualityLabels[name] ?? markdown(name)} | ${value.passed} | ${value.failed} | ${value.notApplicable} |`,
      );
    }
    lines.push("", report.automatedQuality.scope);
  }
  lines.push("", "## Failed checks", "");
  const failures = report.cases.flatMap((row) =>
    row.checks
      .filter((check) => check.passed === false)
      .map(
        (check) =>
          `- ${markdown(row.suite)}/${markdown(row.id)}: ${markdown(check.id)}`,
      ),
  );
  lines.push(
    ...(failures.length ? failures : ["None."]),
    "",
    "## Interpretation",
    "",
    ...report.limitations.map((value) => `- ${value}`),
    "",
    "Independent human correctness, completeness and usefulness scores remain unscored.",
    "",
    "Machine-readable provenance and individual checks are in `latest.json`.",
    "",
  );
  return lines.join("\n");
}

export function reportJUnit(report) {
  const totalTime = report.cases.reduce(
    (sum, row) => sum + row.durationMs / 1000,
    0,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="TampaBayBot ${xml(report.mode)}" tests="${report.summary.cases}" failures="${report.summary.failed}" time="${totalTime.toFixed(3)}">`,
    ...report.cases.map((row) => {
      const failures = row.checks
        .filter((check) => check.passed === false)
        .map((check) => check.id)
        .join(", ");
      return `  <testcase classname="${xml(row.suite)}" name="${xml(row.id)}: ${xml(row.title)}" time="${(row.durationMs / 1000).toFixed(3)}">${failures ? `<failure message="${xml(failures)}">Failed checks: ${xml(failures)}</failure>` : ""}</testcase>`;
    }),
    "</testsuite>",
    "",
  ].join("\n");
}

/** Compare checks, never infer success from an aggregate pass rate alone. */
export function compareReports(
  baseline,
  candidate,
  { allowChangedProvenance = false } = {},
) {
  if (baseline?.schemaVersion !== 1 || candidate?.schemaVersion !== 1)
    throw new Error("Unsupported evaluation report schema.");
  validateCases(baseline.cases);
  validateCases(candidate.cases);
  if (
    !["offline", "live"].includes(baseline.mode) ||
    !["offline", "live"].includes(candidate.mode)
  )
    throw new Error("Unknown evaluation report mode.");
  if (baseline.mode !== candidate.mode)
    throw new Error(
      "Offline and live results cannot be compared as the same run type.",
    );
  const significant = [
    "evaluatedAsOf",
    "sourcesHash",
    "chunksHash",
    "suiteDefinitionHash",
    "benchmarkHash",
    "scenarioHash",
    "qualityBenchmarkHash",
  ];
  if (
    [baseline, candidate].some((report) =>
      significant.some(
        (key) =>
          typeof report.provenance?.[key] !== "string" ||
          !report.provenance[key],
      ),
    )
  )
    throw new Error("Comparison requires complete evaluation provenance.");
  const provenanceChanges = significant.filter(
    (key) => baseline.provenance?.[key] !== candidate.provenance?.[key],
  );
  if (provenanceChanges.length && !allowChangedProvenance)
    throw new Error(
      "Evaluation provenance changed; review it and use --allow-changed-provenance to compare deliberately.",
    );
  const candidateRows = new Map(
    candidate.cases.map((row) => [`${row.suite}/${row.id}`, row]),
  );
  const regressions = [];
  for (const before of baseline.cases) {
    const key = `${before.suite}/${before.id}`;
    const after = candidateRows.get(key);
    if (!after) {
      regressions.push({ case: key, check: "case_removed" });
      continue;
    }
    const checks = new Map(after.checks.map((check) => [check.id, check]));
    for (const check of before.checks) {
      const current = checks.get(check.id);
      if (!current)
        regressions.push({ case: key, check: `${check.id}:removed` });
      else if (
        !equalJson(check.expected, current.expected) ||
        check.kind !== current.kind
      )
        regressions.push({
          case: key,
          check: `${check.id}:expectation_changed`,
        });
      else if (check.passed === true && current.passed !== true)
        regressions.push({ case: key, check: `${check.id}:regressed` });
      else if (check.passed !== null && current.passed === null)
        regressions.push({
          case: key,
          check: `${check.id}:became_inapplicable`,
        });
    }
  }
  const failing = candidate.cases.filter((row) =>
    row.checks.some((check) => check.passed === false),
  );
  return {
    schemaVersion: 1,
    status: regressions.length || failing.length ? "failed" : "passed",
    regressions,
    candidateFailingCases: failing.map((row) => `${row.suite}/${row.id}`),
    provenanceChanges,
    addedCases: candidate.cases
      .filter(
        (row) =>
          !baseline.cases.some(
            (before) => before.suite === row.suite && before.id === row.id,
          ),
      )
      .map((row) => `${row.suite}/${row.id}`),
    note: "A passing comparison means no checked regression in the selected suites. Scoped quality cases do not establish general model correctness or usefulness.",
  };
}
