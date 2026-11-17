import handler from "vinext/server/app-router-entry";
import { withRuntimeEnv } from "../lib/runtime-env.mjs";
import { withResponseSecurity } from "../lib/response-security";
import { withOperations, operationalMetrics } from "../lib/operations/control.mjs";
import { corpusGeneration } from '../lib/corpus';
const worker = {
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: {
      waitUntil(promise: Promise<unknown>): void;
      passThroughOnException(): void;
    },
  ): Promise<Response> {
    const runtime = process.env.NODE_ENV !== 'production' && env.TAMPABAYBOT_OPERATIONS_MODE === undefined
      ? { ...env, TAMPABAYBOT_OPERATIONS_MODE: 'local' } : env;
    const response = await withResponseSecurity(
      request,
      (securedRequest) => withRuntimeEnv(runtime, () => {
        if (new URL(securedRequest.url).pathname === '/api/operations')
          return operationalMetrics(securedRequest, runtime);
        return withOperations(securedRequest, runtime, ctx,
          (boundedRequest: Request) => handler.fetch(boundedRequest, env, ctx));
      }),
      process.env.NODE_ENV !== "production",
    );
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const headers = new Headers(response.headers);
      headers.set('X-TampaBayBot-Generation', corpusGeneration);
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    }
    return response;
  },
};

export default worker;
