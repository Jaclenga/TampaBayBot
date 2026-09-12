import { parseLlmConfig, publicLlmInfo } from "./llm/index.mjs";
import { getRuntimeEnv } from "./runtime-env.mjs";
import { en } from "./i18n/en";

// Call only on the server. The client receives disclosure text, never config.
export function getModelNotice() {
  const info = publicLlmInfo(parseLlmConfig(getRuntimeEnv()));
  return info.enabled ? en.modelPrivacy.enabled : en.modelPrivacy.disabled;
}
