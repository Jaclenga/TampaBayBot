import { createHash } from "node:crypto";
import { benchmarks } from "../benchmarks.mjs";
import { EVALUATION_DATE } from "../scenarios.mjs";
import { answerQuestion } from "../../lib/core/answer.mjs";
import { answerWithGuardrails } from "../../lib/guardrails/navigator.mjs";
import { siteGuards } from "../../lib/guardrails/site.mjs";
import { publicLlmInfo } from "../../lib/llm/index.mjs";
import { scoreNavigationAnswer } from "./scoring.mjs";

export const LIVE_CASE_IDS = Object.freeze([
  "h01",
  "h04",
  "h19",
  "z01",
  "z02",
  "z05",
  "p01",
  "p06",
  "d01",
  "d06",
  "n01",
  "n08",
]);

const GENERATION_STATUSES = new Set(["used", "fallback", "skipped", "disabled"]);
const GENERATION_REASONS = new Set([
  "provider_failure",
  "invalid_output",
  "response_too_large",
  "timeout",
  "cancelled",
  "invalid_evidence",
  "input_too_large",
  "invalid_config",
  "non_answered_status",
  "guardrail_skip",
]);

/** Diagnostics contain only known enums, never arbitrary model/provider text. */
export function summarizeLiveGeneration(generation) {
  return {
    status:
      generation?.status == null
        ? "missing"
        : GENERATION_STATUSES.has(generation.status)
          ? generation.status
          : "unexpected_value",
    reason:
      generation?.reason == null
        ? null
        : GENERATION_REASONS.has(generation.reason)
          ? generation.reason
          : "unexpected_value",
  };
}

/** Explicit opt-in only. Inputs are checked-in public development questions,
 * never resident traffic or an external arbitrary prompt file. */
export async function runLiveSuite({
  authorized = false,
  config,
  sources,
  chunks,
  now = EVALUATION_DATE,
  limit = 10,
  repeats = 1,
  budgetMs = 60000,
  fetchImpl,
  signal,
} = {}) {
  if (authorized !== true)
    throw new Error("Live evaluation requires --allow-provider-call.");
  if (!publicLlmInfo(config).enabled)
    throw new Error(
      "Live evaluation requires a valid enabled LLM provider configuration.",
    );
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > LIVE_CASE_IDS.length ||
    !Number.isInteger(repeats) ||
    repeats < 1 ||
    repeats > 5 ||
    !Number.isInteger(budgetMs) ||
    budgetMs < 1000 ||
    budgetMs > 600000
  )
    throw new Error("Invalid live evaluation limits.");
  const templates = LIVE_CASE_IDS.slice(0, limit).map((id) =>
    benchmarks.find((row) => row.id === id),
  );
  if (templates.some((row) => !row || row.scenario !== "baseline"))
    throw new Error(
      "Live evaluation requires checked-in public baseline cases.",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  const combined = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  const rows = [];
  try {
    for (let repeat = 1; repeat <= repeats; repeat++)
      for (const benchmark of templates) {
        const start = performance.now();
        const row = {
          id: `${benchmark.id}-r${repeat}`,
          suite: "live",
          title: `Public navigation case ${benchmark.id}, repetition ${repeat}`,
          fixture: "public_snapshot",
          checks: [],
          durationMs: 0,
          details: { category: benchmark.category, scenario: "baseline" },
        };
        if (combined.aborted) {
          row.checks.push({
            id: "run_budget_available",
            passed: false,
            kind: "robustness",
            expected: true,
            observed: false,
          });
          rows.push(row);
          continue;
        }
        let providerCalls = 0;
        try {
          const baseline = answerQuestion(benchmark.question, {
            sources,
            chunks,
            now,
          });
          const answer = await answerWithGuardrails(benchmark.question, {
            sources,
            chunks,
            now,
            config,
            fetchImpl: (...args) => {
              providerCalls++;
              return (fetchImpl ?? globalThis.fetch)(...args);
            },
            signal: combined,
            extraGuards: siteGuards,
          });
          const generation = summarizeLiveGeneration(answer.generation);
          row.details.generation = generation;
          row.checks.push(
            ...scoreNavigationAnswer({
              benchmark,
              answer,
              sources,
              chunks,
              now,
              baseline,
            }),
          );
          row.checks.push({
            id: "model_output_accepted",
            kind: "robustness",
            passed:
              baseline.status === "answered"
                ? answer.generation?.status === "used"
                : null,
            expected:
              baseline.status === "answered" ? "used" : "not_applicable",
            observed: generation.status,
          });
          row.checks.push({
            id: "non_answered_skips_inference",
            kind: "integrity",
            passed:
              baseline.status !== "answered"
                ? generation.status === "skipped" && providerCalls === 0
                : null,
            expected:
              baseline.status !== "answered"
                ? { status: "skipped", providerCalls: 0 }
                : "not_applicable",
            observed:
              baseline.status !== "answered"
                ? { status: generation.status, providerCalls }
                : "not_applicable",
          });
          row.checks.push({
            id: "guarded_application_path",
            kind: "integrity",
            passed: answer.guardrails?.version === "1",
            expected: "1",
            observed: answer.guardrails?.version ?? "missing",
          });
        } catch {
          row.checks.push({
            id: "case_execution",
            kind: "robustness",
            passed: false,
            expected: "completed",
            observed: "failed_or_cancelled",
          });
        }
        row.details.providerCalls = providerCalls;
        row.durationMs = Math.round((performance.now() - start) * 100) / 100;
        rows.push(row);
      }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return rows;
}

export function liveConfigurationFingerprint(config, limits) {
  return {
    provider: publicLlmInfo(config).provider,
    modelHash: createHash("sha256")
      .update(config.model ?? "")
      .digest("hex"),
    locality: publicLlmInfo(config).locality,
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    ...limits,
    note: "Model identity is hashed. Endpoints, credentials, request text, raw responses and raw provider errors are not recorded.",
  };
}
