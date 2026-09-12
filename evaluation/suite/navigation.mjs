import { performance } from "node:perf_hooks";
import { answerWithGuardrails } from "../../lib/guardrails/navigator.mjs";
import { parseLlmConfig } from "../../lib/llm/index.mjs";
import { benchmarks } from "../benchmarks.mjs";
import { EVALUATION_DATE, prepareScenario } from "../scenarios.mjs";
import { scoreNavigationAnswer } from "./scoring.mjs";

/** All authored resident cases use the guarded entrypoint and explicitly disable
 * inference. Existing benchmark and audit artifacts are never rewritten here.
 */
export async function runNavigationSuite({
  sources = [],
  chunks = [],
  now = EVALUATION_DATE,
  answer = answerWithGuardrails,
} = {}) {
  const results = [];
  for (const benchmark of benchmarks) {
    const started = performance.now();
    let checks;
    try {
      const corpus = prepareScenario(benchmark.scenario, sources, chunks);
      // The implementation under evaluation cannot edit its provenance oracle
      // or contaminate the corpus used by a later case.
      const output = await answer(benchmark.question, {
        ...structuredClone(corpus),
        now,
        jurisdictionId: benchmark.jurisdictionId,
        config: parseLlmConfig({ LLM_PROVIDER: "none" }),
      });
      checks = [
        { id: "execution", passed: true, kind: "robustness" },
        ...scoreNavigationAnswer({ benchmark, answer: output, ...corpus, now }),
      ];
    } catch {
      // Provider/plugin messages can contain credentials or resident input.
      // Record a fixed failure and continue, without serializing the exception.
      checks = [{ id: "execution", passed: false, kind: "robustness" }];
    }
    results.push({
      id: benchmark.id,
      suite: "navigation",
      title: benchmark.question,
      fixture:
        benchmark.scenario === "baseline" ? "public_snapshot" : "synthetic",
      checks,
      durationMs: Number((performance.now() - started).toFixed(3)),
      details: {
        category: benchmark.category,
        scenario: benchmark.scenario,
        challenge: benchmark.challenge,
      },
    });
  }
  return results;
}
