import handler from "vinext/server/app-router-entry";
import { withRuntimeEnv } from "../lib/runtime-env.mjs";
import { withResponseSecurity } from "../lib/response-security";
const worker = {
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: {
      waitUntil(promise: Promise<unknown>): void;
      passThroughOnException(): void;
    },
  ): Promise<Response> {
    return withResponseSecurity(
      request,
      (securedRequest) => withRuntimeEnv(env, () =>
        handler.fetch(securedRequest, env, ctx),
      ),
      process.env.NODE_ENV !== "production",
    );
  },
};

export default worker;
