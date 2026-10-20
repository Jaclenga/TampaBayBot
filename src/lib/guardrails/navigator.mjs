import { answerQuestion } from "../core/answer.mjs";
import { createQueryPlan } from "../core/query-plan.mjs";
import { scopeAnswerCorpus } from "../core/answer/coverage.mjs";
import { nextSteps } from "../core/answer/next-steps.mjs";
import { validateCitationIntegrity } from "../citations/evidence.mjs";
import {
  synthesizeAnswer,
  parseLlmConfig,
  publicLlmInfo,
} from "../llm/index.mjs";
import {
  createGuardrailRunner,
  GuardrailError,
  GUARDRAIL_VERSION,
} from "./index.mjs";

function containsCredential(value, credential, visited = new WeakSet()) {
  if (!credential) return false;
  if (typeof value === "string") return value.includes(credential);
  if (!value || typeof value !== "object" || visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((item) =>
    containsCredential(item, credential, visited),
  );
}

function unverifiedCitationResponse(answer, scoped) {
  // A broken reference must not leave a plausible but unsupported claim on
  // screen. Offer only safe official links from this request's scoped registry.
  const safe = { ...answer };
  delete safe.requiredEvidenceIds;
  safe.status = "insufficient_evidence";
  safe.answer = "I could not determine this reliably from the available public information.";
  safe.meaning = null;
  safe.evidence = [];
  safe.warnings = [];
  safe.nextSteps = nextSteps(scoped.sources.filter((source) =>
    source.categories?.includes(answer.category),
  ));
  if (safe.coverage) safe.coverage = { ...safe.coverage, citedSourceCount: 0 };
  return safe;
}

/** Guarded application entrypoint; the pure deterministic engine stays reusable. */
export async function answerWithGuardrails(
  question,
  {
    sources = [],
    chunks = [],
    now,
    jurisdictionId = "tampa-bay",
    config = parseLlmConfig(),
    fetchImpl,
    provider,
    signal,
    extraGuards = [],
    guardTimeoutMs = 1000,
  } = {},
) {
  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > 1000
  )
    throw new GuardrailError("guard_blocked");
  const guards = createGuardrailRunner(extraGuards, {
    timeoutMs: guardTimeoutMs,
  });
  // Never hand a configured credential to any custom guard or include it in output.
  const credential = typeof config?.apiKey === "string" ? config.apiKey : null;
  if (containsCredential(question, credential))
    throw new GuardrailError("sensitive_input");
  let skipModel =
    (await guards.run("question", { question }, { signal })).action ===
    "skip_model";
  const verificationDate = now === undefined ? new Date() : new Date(now);
  const generatedBaseline = answerQuestion(question, {
    sources,
    chunks,
    jurisdictionId,
    now: verificationDate,
  });
  const scoped = scopeAnswerCorpus(sources, chunks,
    createQueryPlan(generatedBaseline.query, { jurisdictionId, sources }));
  const citationContext = { ...scoped, now: verificationDate };
  const baselineIsVerified = validateCitationIntegrity(generatedBaseline, citationContext).valid;
  const baseline = baselineIsVerified
    ? generatedBaseline
    : unverifiedCitationResponse(generatedBaseline, scoped);
  const check = async (stage, answer) => {
    // Inspect string values, not serialized JSON: credentials may contain quotes
    // or backslashes. Source labels, URLs and next steps reach hooks/output too.
    // No configured credential is passed to a hook through its context.
    if (
      containsCredential(baseline, credential) ||
      containsCredential(answer, credential)
    )
      throw new GuardrailError("guard_blocked");
    const result = await guards.run(
      stage,
      { question, baseline, ...(answer ? { answer } : {}) },
      { signal },
    );
    if (result.action === "skip_model") skipModel = true;
  };
  await check("evidence");
  const info = publicLlmInfo(config);
  const skipped = () => ({
    ...baseline,
    generation: {
      mode: "extractive",
      provider: info.provider,
      status: info.enabled ? "skipped" : "disabled",
      ...(info.enabled ? { reason: "guardrail_skip" } : {}),
    },
  });
  // Hooks around inference run only when inference is actually eligible.
  if (info.enabled && baseline.status === "answered" && !skipModel)
    await check("before_model");
  let answer = skipModel
    ? skipped()
    : await synthesizeAnswer(baseline, { config, fetchImpl, provider, signal });
  if (answer.generation.status === "used") {
    await check("after_model", answer);
    if (skipModel) answer = skipped();
  }
  const beforeResponse = skipModel;
  await check("response", answer);
  if (skipModel && !beforeResponse) {
    answer = skipped();
    // A response veto of model output must also check the replacement baseline.
    await check("response", answer);
  }
  if (!validateCitationIntegrity(answer, citationContext).valid) {
    answer = baselineIsVerified ? { ...baseline } : unverifiedCitationResponse(answer, scoped);
    answer.generation = {
      mode: "extractive",
      provider: info.provider,
      status: "fallback",
      reason: "invalid_evidence",
    };
  } else if (!baselineIsVerified) {
    answer.generation = {
      mode: "extractive",
      provider: info.provider,
      status: "fallback",
      reason: "invalid_evidence",
    };
  }
  return {
    ...answer,
    guardrails: {
      version: GUARDRAIL_VERSION,
      status: skipModel ? "model_skipped" : "passed",
    },
  };
}
