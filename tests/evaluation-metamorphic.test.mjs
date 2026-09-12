import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  METAMORPHIC_SEED,
  runMetamorphicSuite,
} from "../evaluation/suite/metamorphic.mjs";

const sources = JSON.parse(
  readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"),
);
const chunks = JSON.parse(
  readFileSync(new URL("../data/chunks.json", import.meta.url), "utf8"),
);
const now = "2026-09-12T12:00:00Z";
const options = { sources, chunks, now };
const outcomes = runMetamorphicSuite(options);

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test("public snapshots satisfy all authored formatting, corpus, injection and provider invariants", async () => {
  const results = await outcomes;
  assert.equal(results.length, 28);
  assert.equal(
    new Set(results.map((result) => result.id)).size,
    results.length,
  );
  assert.deepEqual(
    [...new Set(results.map((result) => result.details.scenario))].sort(),
    [
      "corpus-order-and-duplicates",
      "question-formatting",
      "synthetic-provider-selection",
      "untrusted-question-instruction",
    ],
  );
  const failures = results.flatMap((result) =>
    result.checks
      .filter((check) => check.passed === false)
      .map((check) => ({ id: result.id, check })),
  );
  assert.deepEqual(failures, []);
  assert.ok(
    results.every((result) =>
      result.checks.some((check) => check.kind === "integrity"),
    ),
  );
});

test("fixed seed makes results repeatable without mutating supplied sources and chunks", async () => {
  assert.equal(METAMORPHIC_SEED, 0x50504d31);
  const before = JSON.stringify(options);
  const first = await outcomes;
  const second = await runMetamorphicSuite(freeze(structuredClone(options)));
  const withoutTiming = (results) =>
    results.map((result) => {
      const copy = { ...result };
      delete copy.durationMs;
      return copy;
    });
  assert.deepEqual(withoutTiming(second), withoutTiming(first));
  assert.equal(JSON.stringify(options), before);
  assert.ok(
    second.every(
      (result) => Number.isFinite(result.durationMs) && result.durationMs >= 0,
    ),
  );
});

test("suite independently detects corrupt content hashes instead of copying current output as truth", async () => {
  const corrupt = chunks.map((chunk) => ({
    ...chunk,
    content_hash: "0".repeat(64),
  }));
  const results = await runMetamorphicSuite({ sources, chunks: corrupt, now });
  assert.equal(results.length, 28);
  assert.ok(
    results.every((result) =>
      result.checks.some(
        (check) =>
          check.id === "verified-content-hashes" && check.passed === false,
      ),
    ),
  );
  assert.ok(
    results.every(
      (result) =>
        result.checks.find((check) => check.id === "no-network-attempts")
          .passed,
    ),
  );
});

test("each execution failure is sanitized and later cases still run", async () => {
  const results = await runMetamorphicSuite({
    sources: [{ get jurisdiction_ids() { throw new Error("private synthetic evaluation failure"); } }],
    chunks: [],
    now,
  });
  assert.equal(results.length, 28);
  assert.ok(
    results.every((result) =>
      result.checks.some(
        (check) => check.id === "execution" && check.passed === false,
      ),
    ),
  );
  assert.ok(
    results.every((result) =>
      result.checks.every((check) =>
        ["behavior", "integrity", "privacy", "robustness", "proxy"].includes(
          check.kind,
        ),
      ),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(results),
    /TypeError|Cannot read|stack|315 E Kennedy|Am I eligible|Approved\./,
  );
});
