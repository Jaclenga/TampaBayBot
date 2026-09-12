import type { ResidentAnswer } from "../core/answer.mjs";
export type GuardrailStage =
  | "question"
  | "evidence"
  | "before_model"
  | "after_model"
  | "response";
export type GuardrailAction = "allow" | "block" | "skip_model";
export type GuardrailData<T> = T extends readonly (infer U)[]
  ? readonly GuardrailData<U>[]
  : T extends object
    ? { readonly [K in keyof T]: GuardrailData<T[K]> }
    : T;
export interface GuardrailContext {
  readonly stage: GuardrailStage;
  readonly question: string;
  readonly baseline?: GuardrailData<ResidentAnswer>;
  readonly answer?: GuardrailData<ResidentAnswer>;
}
export interface Guardrail {
  id: string;
  stages: readonly GuardrailStage[];
  check(
    context: GuardrailContext,
    options: { signal: AbortSignal },
  ): { action: GuardrailAction } | Promise<{ action: GuardrailAction }>;
}
export const GUARDRAIL_STAGES: readonly GuardrailStage[];
export const GUARDRAIL_VERSION: "1";
export class GuardrailError extends Error {
  code: string;
  status: number;
  constructor(code?: string);
}
export function createGuardrailRunner(
  extraGuards?: readonly Guardrail[],
  options?: { timeoutMs?: number },
): {
  run(
    stage: GuardrailStage,
    context: Omit<GuardrailContext, "stage">,
    options?: { signal?: AbortSignal },
  ): Promise<{ action: GuardrailAction }>;
};
