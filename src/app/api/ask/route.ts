import sources from "@/data/sources.json";
import chunks from "@/data/chunks.json";
import { readInput, inputText, inputJurisdiction, json, inputErrorJson } from "@/lib/http";
import { parseLlmConfig } from "@/lib/llm/index.mjs";
import { getRuntimeEnv } from "@/lib/runtime-env.mjs";
import { answerWithGuardrails } from "@/lib/guardrails/navigator.mjs";
import { GuardrailError } from "@/lib/guardrails/index.mjs";
import { siteGuards } from "@/lib/guardrails/site.mjs";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    const question = inputText(input.question);
    return json(
      await answerWithGuardrails(question, {
        sources,
        chunks,
        jurisdictionId: inputJurisdiction(input.jurisdictionId),
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
