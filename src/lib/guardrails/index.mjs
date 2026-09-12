import { containsSensitiveIdentifier } from "./privacy.mjs";
import { isInstructionText } from "../retrieval/search.mjs";

export const GUARDRAIL_STAGES = Object.freeze([
  "question",
  "evidence",
  "before_model",
  "after_model",
  "response",
]);
export const GUARDRAIL_VERSION = "1";

export class GuardrailError extends Error {
  constructor(code = "guard_blocked") {
    const messages = {
      sensitive_input:
        "Remove Social Security numbers, payment or bank account details, and access keys, then ask again. A street address is okay.",
      guard_blocked:
        "This question could not pass the service checks. Rephrase it without private identifiers, or use the official source library.",
      guard_unavailable:
        "The service checks could not finish. Try again or use the official source library.",
    };
    const safeCode = Object.hasOwn(messages, code) ? code : "guard_unavailable";
    super(messages[safeCode]);
    this.name = "GuardrailError";
    this.code = safeCode;
    this.status = safeCode === "guard_unavailable" ? 503 : 422;
  }
}

function freeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const item of Object.values(value)) freeze(item, visited);
  return Object.freeze(value);
}

function builtInCheck(stage, context) {
  if (stage === "question") {
    if (containsSensitiveIdentifier(context.question))
      throw new GuardrailError("sensitive_input");
    if (isInstructionText(context.question)) return { action: "skip_model" };
  }
  if (stage === "evidence") {
    const excerpts = (context.baseline?.evidence ?? []).map(
      (item) => `${item.title}\n${item.quote}`,
    );
    if (excerpts.some(containsSensitiveIdentifier))
      throw new GuardrailError("guard_blocked");
    if (excerpts.some(isInstructionText)) return { action: "skip_model" };
  }
  if (stage === "response") {
    const answer = context.answer;
    const displayed = [
      answer?.answer,
      answer?.meaning,
      ...(answer?.evidence ?? []).map((item) => `${item.title}\n${item.quote}`),
    ].join("\n");
    if (containsSensitiveIdentifier(displayed))
      throw new GuardrailError("guard_blocked");
  }
  return { action: "allow" };
}

/** Additive, server-owned checks. No hook can replace input, evidence or output. */
export function createGuardrailRunner(
  extraGuards = [],
  { timeoutMs = 1000 } = {},
) {
  if (
    !Array.isArray(extraGuards) ||
    extraGuards.length > 8 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 10 ||
    timeoutMs > 5000
  )
    throw new GuardrailError("guard_unavailable");
  const ids = new Set();
  const guards = extraGuards.map((guard) => {
    if (
      !guard ||
      typeof guard.id !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(guard.id) ||
      ids.has(guard.id) ||
      !Array.isArray(guard.stages) ||
      !guard.stages.length ||
      guard.stages.some((stage) => !GUARDRAIL_STAGES.includes(stage)) ||
      typeof guard.check !== "function"
    )
      throw new GuardrailError("guard_unavailable");
    ids.add(guard.id);
    return Object.freeze({
      id: guard.id,
      stages: Object.freeze([...guard.stages]),
      check: guard.check,
    });
  });
  return Object.freeze({
    async run(stage, context, { signal } = {}) {
      if (!GUARDRAIL_STAGES.includes(stage) || signal?.aborted)
        throw new GuardrailError("guard_unavailable");
      const initial = builtInCheck(stage, context);
      const checks = guards.filter((guard) => guard.stages.includes(stage));
      if (!checks.length) return initial;
      const controller = new AbortController();
      let timer;
      let cancel;
      const failure = new Promise((_, reject) => {
        cancel = () => {
          reject(new GuardrailError("guard_unavailable"));
          controller.abort();
        };
        timer = setTimeout(cancel, timeoutMs);
        signal?.addEventListener("abort", cancel, { once: true });
      });
      let action = initial.action;
      try {
        // A fresh frozen copy per check prevents hooks from sharing mutable data.
        await Promise.race([
          failure,
          (async () => {
            for (const guard of checks) {
              if (controller.signal.aborted)
                throw new GuardrailError("guard_unavailable");
              const snapshot = freeze(structuredClone({ ...context, stage }));
              const result = await guard.check(snapshot, {
                signal: controller.signal,
              });
              if (
                !result ||
                typeof result !== "object" ||
                Array.isArray(result) ||
                Object.keys(result).length !== 1 ||
                !Object.hasOwn(result, "action") ||
                !["allow", "block", "skip_model"].includes(result.action)
              )
                throw new GuardrailError("guard_unavailable");
              if (result.action === "block")
                throw new GuardrailError("guard_blocked");
              if (result.action === "skip_model") action = "skip_model";
            }
          })(),
        ]);
        return { action };
      } catch (error) {
        // A trusted hook may accidentally attach a private message to this class.
        // Reconstruct even known errors rather than forwarding their text/status.
        throw new GuardrailError(
          error instanceof GuardrailError ? error.code : "guard_unavailable",
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        controller.abort();
      }
    },
  });
}
