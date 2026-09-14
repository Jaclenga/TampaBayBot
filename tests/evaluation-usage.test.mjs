import test from "node:test";
import assert from "node:assert/strict";
import { normalizePricing, summarizeModelUsage } from "../evaluation/suite/usage.mjs";

const rates = { inputUsdPerMillion: 2, outputUsdPerMillion: 8 };
const call = (inputTokens = 1000, outputTokens = 200, cachedInputTokens = 0) => ({
  inputTokens, outputTokens, cachedInputTokens, totalTokens: inputTokens + outputTokens,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("pricing is absent by default and accepts explicit zero and CLI decimal rates", () => {
  assert.equal(normalizePricing(), null);
  assert.equal(normalizePricing(null), null);
  assert.deepEqual(normalizePricing({ inputUsdPerMillion: "0", outputUsdPerMillion: "8.25" }), {
    inputUsdPerMillion: 0, outputUsdPerMillion: 8.25, cachedInputUsdPerMillion: null,
  });
  assert.deepEqual(normalizePricing({ ...rates, cachedInputUsdPerMillion: "0.25" }), {
    ...rates, cachedInputUsdPerMillion: 0.25,
  });
});

test("invalid, incomplete and nonfinite pricing fails before any totals are produced", () => {
  for (const invalid of ["", " ", "NaN", "Infinity", -1, "-1", Infinity, NaN, true, [], {}]) {
    assert.throws(() => normalizePricing({ ...rates, inputUsdPerMillion: invalid }), /finite, nonnegative/);
    assert.throws(() => normalizePricing({ ...rates, outputUsdPerMillion: invalid }), /finite, nonnegative/);
    assert.throws(() => normalizePricing({ ...rates, cachedInputUsdPerMillion: invalid }), /finite, nonnegative/);
  }
  for (const incomplete of [{ inputUsdPerMillion: 1 }, { outputUsdPerMillion: 1 }, { cachedInputUsdPerMillion: 0 }])
    assert.throws(() => normalizePricing(incomplete), /both input and output/);
  assert.throws(() => normalizePricing("2,8"), /object/);
  assert.throws(() => normalizePricing([]), /object/);
  assert.throws(() => summarizeModelUsage(null), /array/);
});

test("zero provider calls records zero API tokens and cost without configured pricing", () => {
  const usage = summarizeModelUsage([]);
  assert.equal(usage.providerCalls, 0);
  assert.deepEqual(usage.tokens, {
    status: "no_calls", inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0,
    reportedCalls: 0, unreportedCalls: 0,
    known: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
  });
  assert.deepEqual(usage.cost, {
    currency: "USD", status: "no_calls", estimatedUsd: 0, knownEstimatedUsd: 0, pricedCalls: 0, unpricedCalls: 0,
  });
});

test("complete calls sum input, output, total and cache tokens separately", () => {
  const usage = summarizeModelUsage([call(), call(2000, 300, 500)], rates);
  assert.equal(usage.providerCalls, 2);
  assert.equal(usage.tokens.status, "complete");
  assert.equal(usage.tokens.inputTokens, 3000);
  assert.equal(usage.tokens.outputTokens, 500);
  assert.equal(usage.tokens.totalTokens, 3500);
  assert.equal(usage.tokens.cachedInputTokens, 500);
  assert.equal(usage.tokens.reportedCalls, 2);
  assert.equal(usage.cost.status, "estimated");
  near(usage.cost.estimatedUsd, 0.01);
});

test("cached input is a subset, with its own rate only when explicitly configured", () => {
  const usage = summarizeModelUsage([call(1000, 200, 400)], { ...rates, cachedInputUsdPerMillion: 0.5 });
  near(usage.cost.estimatedUsd, 0.003);
  near(summarizeModelUsage([call(1000, 200, 400)], rates).cost.estimatedUsd, 0.0036);
});

test("missing cache details preserve core completeness and ordinary-rate estimates", () => {
  const record = call();
  delete record.cachedInputTokens;
  const withoutCache = summarizeModelUsage([record], rates);
  assert.equal(withoutCache.tokens.status, "complete");
  assert.equal(withoutCache.tokens.cachedInputTokens, null);
  near(withoutCache.cost.estimatedUsd, 0.0036);
  const discounted = summarizeModelUsage([record], { ...rates, cachedInputUsdPerMillion: 0.5 });
  assert.equal(discounted.cost.status, "unavailable");
  assert.equal(discounted.cost.estimatedUsd, null);
  assert.equal(discounted.cost.knownEstimatedUsd, null);
  near(summarizeModelUsage([record], { ...rates, cachedInputUsdPerMillion: 2 }).cost.estimatedUsd, 0.0036);
});

test("zero input does not require cache counts, and explicit zero rates price reported usage at zero", () => {
  const record = call(0, 200);
  delete record.cachedInputTokens;
  near(summarizeModelUsage([record], { ...rates, cachedInputUsdPerMillion: 0.5 }).cost.estimatedUsd, 0.0016);
  const freeRate = summarizeModelUsage([call()], { inputUsdPerMillion: 0, outputUsdPerMillion: 0 });
  assert.equal(freeRate.cost.status, "estimated");
  assert.equal(freeRate.cost.estimatedUsd, 0);
  assert.equal(summarizeModelUsage([null], { inputUsdPerMillion: 0, outputUsdPerMillion: 0 }).cost.status, "unavailable");
});

test("observed provider calls with no pricing are not assumed free, including local models", () => {
  const usage = summarizeModelUsage([call()]);
  assert.equal(usage.tokens.status, "complete");
  assert.equal(usage.cost.status, "unavailable");
  assert.equal(usage.cost.estimatedUsd, null);
  assert.equal(usage.cost.knownEstimatedUsd, null);
  assert.equal(usage.cost.unpricedCalls, 1);
});

test("missing usage and failed calls remain counted without inventing zero totals", () => {
  const usage = summarizeModelUsage([null, {}, undefined], rates);
  assert.equal(usage.providerCalls, 3);
  assert.equal(usage.tokens.status, "unavailable");
  assert.equal(usage.tokens.inputTokens, null);
  assert.equal(usage.tokens.outputTokens, null);
  assert.equal(usage.tokens.totalTokens, null);
  assert.equal(usage.tokens.reportedCalls, 0);
  assert.equal(usage.tokens.unreportedCalls, 3);
  assert.equal(usage.cost.status, "unavailable");
  assert.equal(usage.cost.pricedCalls, 0);
  assert.equal(usage.cost.unpricedCalls, 3);
});

test("mixed successes, rejected completions and unknown failures retain known subtotals", () => {
  // Both reported calls count even if the second completion was rejected afterward.
  const usage = summarizeModelUsage([call(), call(500, 100), null], rates);
  assert.equal(usage.providerCalls, 3);
  assert.equal(usage.tokens.status, "partial");
  assert.equal(usage.tokens.inputTokens, null);
  assert.equal(usage.tokens.outputTokens, null);
  assert.equal(usage.tokens.totalTokens, null);
  assert.equal(usage.tokens.known.inputTokens, 1500);
  assert.equal(usage.tokens.known.outputTokens, 300);
  assert.equal(usage.tokens.known.totalTokens, 1800);
  assert.equal(usage.tokens.reportedCalls, 2);
  assert.equal(usage.tokens.unreportedCalls, 1);
  assert.equal(usage.cost.status, "partial");
  assert.equal(usage.cost.estimatedUsd, null);
  near(usage.cost.knownEstimatedUsd, 0.0054);
  assert.equal(usage.cost.pricedCalls, 2);
  assert.equal(usage.cost.unpricedCalls, 1);
});

test("partially reported fields have independent completeness and do not fabricate totals", () => {
  const usage = summarizeModelUsage([call(), { inputTokens: 500 }], rates);
  assert.equal(usage.tokens.status, "partial");
  assert.equal(usage.tokens.inputTokens, 1500);
  assert.equal(usage.tokens.outputTokens, null);
  assert.equal(usage.tokens.totalTokens, null);
  assert.equal(usage.tokens.cachedInputTokens, null);
  assert.equal(usage.tokens.known.outputTokens, 200);
  assert.equal(usage.tokens.reportedCalls, 2);
  assert.equal(usage.cost.status, "partial");
  assert.equal(usage.cost.unpricedCalls, 1);
  const noTotal = summarizeModelUsage([{ inputTokens: 10, outputTokens: 2 }], rates);
  assert.equal(noTotal.tokens.totalTokens, null);
  assert.equal(noTotal.cost.status, "estimated");
});

test("malformed and inconsistent token counts stay unknown and cannot inflate an estimate", () => {
  for (const invalid of [-1, 0.5, "100", Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const usage = summarizeModelUsage([{ ...call(), inputTokens: invalid }], rates);
    assert.equal(usage.tokens.inputTokens, null);
    assert.equal(usage.cost.estimatedUsd, null);
  }
  const badCache = summarizeModelUsage([call(100, 20, 101)], { ...rates, cachedInputUsdPerMillion: 1 });
  assert.equal(badCache.tokens.cachedInputTokens, null);
  assert.equal(badCache.cost.status, "unavailable");
  const badTotal = summarizeModelUsage([{ ...call(), totalTokens: 99999 }], rates);
  assert.equal(badTotal.tokens.totalTokens, null);
  assert.equal(badTotal.tokens.status, "partial");
  near(badTotal.cost.estimatedUsd, 0.0036);
});

test("unsafe token sums and unrepresentable costs become unknown instead of rounded or infinite", () => {
  const tokenOverflow = summarizeModelUsage([call(Number.MAX_SAFE_INTEGER, 0), call(1, 0)], rates);
  assert.equal(tokenOverflow.tokens.inputTokens, null);
  assert.equal(tokenOverflow.tokens.known.inputTokens, null);
  assert.equal(tokenOverflow.tokens.totalTokens, null);
  assert.equal(tokenOverflow.tokens.status, "partial");
  const costOverflow = summarizeModelUsage([call(Number.MAX_SAFE_INTEGER, 0)], {
    inputUsdPerMillion: Number.MAX_VALUE, outputUsdPerMillion: 0,
  });
  assert.equal(costOverflow.cost.status, "unavailable");
  assert.equal(costOverflow.cost.estimatedUsd, null);
  assert.equal(costOverflow.cost.knownEstimatedUsd, null);
  assert.equal(costOverflow.cost.unpricedCalls, 1);
  const sumOverflow = summarizeModelUsage([call(1e6, 0), call(1e6, 0)], {
    inputUsdPerMillion: Number.MAX_VALUE, outputUsdPerMillion: 0,
  });
  assert.equal(sumOverflow.cost.status, "unavailable");
  assert.equal(sumOverflow.cost.estimatedUsd, null);
  assert.equal(sumOverflow.cost.knownEstimatedUsd, null);
});

test("cost arithmetic retains a finite answer despite intermediate multiplication overflow", () => {
  const usage = summarizeModelUsage([call(1e6, 0)], {
    inputUsdPerMillion: Number.MAX_VALUE / 2, outputUsdPerMillion: 0,
  });
  assert.equal(usage.cost.status, "estimated");
  assert.ok(Number.isFinite(usage.cost.estimatedUsd));
  assert.ok(Math.abs(usage.cost.estimatedUsd / (Number.MAX_VALUE / 2) - 1) <= Number.EPSILON);
});

test("representable subnormal costs survive rate division and individually underflowing charges", () => {
  const tinyRates = { inputUsdPerMillion: Number.MIN_VALUE, outputUsdPerMillion: 0 };
  const usage = summarizeModelUsage([call(1e6, 0)], tinyRates);
  assert.equal(usage.cost.status, "estimated");
  assert.equal(usage.cost.estimatedUsd, Number.MIN_VALUE);
  const combined = summarizeModelUsage([call(500000, 500000)], {
    ...tinyRates, outputUsdPerMillion: Number.MIN_VALUE,
  });
  assert.equal(combined.cost.status, "estimated");
  assert.equal(combined.cost.estimatedUsd, Number.MIN_VALUE);
  const unusedLargeRate = summarizeModelUsage([call(1e6, 0)], {
    ...tinyRates, outputUsdPerMillion: Number.MAX_VALUE,
  });
  assert.equal(unusedLargeRate.cost.estimatedUsd, Number.MIN_VALUE);
});

test("positive costs below numeric representability remain unknown instead of appearing free", () => {
  const usage = summarizeModelUsage([call(1, 0)], {
    inputUsdPerMillion: Number.MIN_VALUE, outputUsdPerMillion: 0,
  });
  assert.equal(usage.cost.status, "unavailable");
  assert.equal(usage.cost.estimatedUsd, null);
  assert.equal(usage.cost.knownEstimatedUsd, null);
  assert.equal(usage.cost.pricedCalls, 0);
  assert.equal(usage.cost.unpricedCalls, 1);
});
