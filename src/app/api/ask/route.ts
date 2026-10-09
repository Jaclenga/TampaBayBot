import { sources, chunks } from "@/lib/corpus";
import { readInput, inputText, inputJurisdiction, json, inputErrorJson, RequestInputError } from "@/lib/http";
import { createWorkersAiProvider, parseLlmConfig } from "@/lib/llm/index.mjs";
import { getRuntimeEnv } from "@/lib/runtime-env.mjs";
import { answerResidentQuestion } from "@/lib/core/resident.mjs";
import { GuardrailError } from "@/lib/guardrails/index.mjs";
import { siteGuards } from "@/lib/guardrails/site.mjs";
import { aiUsage } from "@/lib/operations/control.mjs";
export async function POST(request: Request) {
  let question: string;
  let jurisdictionId: ReturnType<typeof inputJurisdiction>;
  let input: Record<string, unknown>;
  try {
    input = await readInput(request);
    question = inputText(input.question);
    jurisdictionId = inputJurisdiction(input.jurisdictionId);
  } catch (error) {
    if (error instanceof RequestInputError || error instanceof Error && new Set([
      "Send a JSON request.", "Use this service from its own website.", "The request is too long.",
      "The request is empty.", "The request is not valid JSON.", "Provide a JSON object.",
      "Enter a valid question or address.", "Choose a supported Tampa Bay area.",
    ]).has(error.message)) return inputErrorJson(error, "Send a valid JSON request.");
    return json({ error: "Send a valid JSON request.", code: "invalid_input" }, 400);
  }
  try {
    const env = getRuntimeEnv();
    const config = parseLlmConfig(env);
    const answer = await answerResidentQuestion(question, {
        sources,
        chunks,
        jurisdictionId,
        conversation: input.conversation,
        ...(input.locale !== undefined ? { locale: input.locale as 'en' | 'es' } : {}),
        extraGuards: siteGuards,
        config,
        ...(config.provider === 'workers-ai' ? { provider: createWorkersAiProvider(env.AI, config) } : {}),
        signal: request.signal,
      });
    let currentAiUsage = null;
    try {
      currentAiUsage = await aiUsage({ configured: config.valid && config.enabled, provider: config.provider, locality: config.locality });
    } catch { console.error('ai_usage_read_failed'); }
    return json({ ...answer, aiUsage: currentAiUsage });
  } catch (error) {
    if (error instanceof GuardrailError)
      return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof TypeError && ["Invalid temporary question context.", "Unsupported interface language."].includes(error.message))
      return inputErrorJson(error, "Enter a valid question.");
    return json({ error: "TampaBayBot's AI chat is temporarily unavailable. You can still browse verified housing assistance resources.",
      code: "service_unavailable" }, 503);
  }
}
