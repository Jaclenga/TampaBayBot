export function withRuntimeEnv<T>(
  env: Record<string, unknown>,
  callback: () => T,
): T;
export function getRuntimeEnv(): Record<string, unknown>;
