import { json } from "@/lib/http";
import { parseLlmConfig } from "@/lib/llm/index.mjs";
import { aiUsage } from "@/lib/operations/control.mjs";
import { getRuntimeEnv } from "@/lib/runtime-env.mjs";

export async function GET() {
  const env = getRuntimeEnv();
  const config = parseLlmConfig(env);
  return json({ ai: await aiUsage({ configured: config.valid && config.enabled, provider: config.provider, locality: config.locality }) });
}
