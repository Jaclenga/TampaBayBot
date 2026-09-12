import type { ResidentAnswer, Source, Chunk } from "../core/answer.mjs";
import type { LlmConfig, LlmProvider } from "../llm/index.mjs";
import type { Guardrail } from "./index.mjs";
import type { JurisdictionId } from "../coverage.mjs";
export function answerWithGuardrails(
  question: string,
  options?: {
    sources?: Source[];
    chunks?: Chunk[];
    now?: Date | string | number;
    jurisdictionId?: JurisdictionId;
    config?: LlmConfig;
    fetchImpl?: typeof fetch;
    provider?: LlmProvider;
    signal?: AbortSignal;
    extraGuards?: readonly Guardrail[];
    guardTimeoutMs?: number;
  },
): Promise<
  ResidentAnswer & {
    guardrails: { version: "1"; status: "passed" | "model_skipped" };
  }
>;
