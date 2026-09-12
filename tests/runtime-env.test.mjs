import test from "node:test";
import assert from "node:assert/strict";
import { getRuntimeEnv, withRuntimeEnv } from "../src/lib/runtime-env.mjs";

test("overlapping requests retain their own runtime credentials across awaits", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = withRuntimeEnv({ LLM_API_KEY: "fixture-one" }, async () => {
    await gate;
    return getRuntimeEnv().LLM_API_KEY;
  });
  const second = withRuntimeEnv({ LLM_API_KEY: "fixture-two" }, async () => {
    release();
    await Promise.resolve();
    return getRuntimeEnv().LLM_API_KEY;
  });
  assert.deepEqual(await Promise.all([first, second]), [
    "fixture-one",
    "fixture-two",
  ]);
  assert.equal(getRuntimeEnv(), process.env);
});

test("an empty Worker binding set does not fall through to host credentials", () => {
  withRuntimeEnv({}, () => assert.deepEqual(getRuntimeEnv(), {}));
});
