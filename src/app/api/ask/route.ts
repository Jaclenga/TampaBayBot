import { sources, chunks } from "@/lib/corpus";
import { readInput, inputText, inputJurisdiction, json, inputErrorJson } from "@/lib/http";
import { parseLlmConfig } from "@/lib/llm/index.mjs";
import { getRuntimeEnv } from "@/lib/runtime-env.mjs";
import { answerResidentQuestion } from "@/lib/core/resident.mjs";
import { GuardrailError } from "@/lib/guardrails/index.mjs";
import { siteGuards } from "@/lib/guardrails/site.mjs";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    const question = inputText(input.question);
    return json(
      await answerResidentQuestion(question, {
        sources,
        chunks,
        jurisdictionId: inputJurisdiction(input.jurisdictionId),
        conversation: input.conversation,
        ...(input.locale !== undefined ? { locale: input.locale as 'en' | 'es' } : {}),
        extraGuards: siteGuards,
        config: parseLlmConfig(getRuntimeEnv()),
        signal: request.signal,
      }),
    );
  } catch (error) {
    if (error instanceof GuardrailError)
      return json({ error: error.message, code: error.code }, error.status);
    return inputErrorJson(error, "Unable to answer this question.");
  }
}
