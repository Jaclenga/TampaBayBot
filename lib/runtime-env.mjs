import { AsyncLocalStorage } from "node:async_hooks";

// Bind credentials to this request, never a mutable process-wide variable.
// Cloudflare's nodejs_compat supports AsyncLocalStorage; Node hosts can use env.
const runtimeEnvironment = new AsyncLocalStorage();

export function withRuntimeEnv(env, callback) {
  return runtimeEnvironment.run(env, callback);
}

export function getRuntimeEnv() {
  return runtimeEnvironment.getStore() ?? process.env;
}
