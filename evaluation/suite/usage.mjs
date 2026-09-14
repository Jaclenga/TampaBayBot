const TOKEN_FIELDS = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
];
const CORE_TOKEN_FIELDS = TOKEN_FIELDS.slice(0, 3);

function rate(value, name) {
  const parsed = typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0)
    throw new TypeError(`${name} must be a finite, nonnegative USD rate per million tokens.`);
  return parsed;
}

/** Rates are explicit configuration, never inferred from a model or provider. */
export function normalizePricing(value = {}) {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Token pricing must be an object.");
  const input = value.inputUsdPerMillion;
  const output = value.outputUsdPerMillion;
  const cached = value.cachedInputUsdPerMillion;
  const present = (item) => item !== undefined && item !== null;
  if (![input, output, cached].some(present)) return null;
  if (!present(input) || !present(output))
    throw new TypeError("Token pricing requires both input and output USD rates per million tokens.");
  return {
    inputUsdPerMillion: rate(input, "inputUsdPerMillion"),
    outputUsdPerMillion: rate(output, "outputUsdPerMillion"),
    cachedInputUsdPerMillion: present(cached)
      ? rate(cached, "cachedInputUsdPerMillion")
      : null,
  };
}

function counts(call) {
  const result = Object.fromEntries(TOKEN_FIELDS.map((key) => [
    key,
    Number.isSafeInteger(call?.[key]) && call[key] >= 0 ? call[key] : null,
  ]));
  if (result.inputTokens !== null && result.cachedInputTokens > result.inputTokens)
    result.cachedInputTokens = null;
  if (result.inputTokens !== null && result.outputTokens !== null &&
      result.totalTokens !== null &&
      result.totalTokens !== result.inputTokens + result.outputTokens)
    result.totalTokens = null;
  return result;
}

function estimate(call, pricing) {
  if (!pricing || call.inputTokens === null || call.outputTokens === null)
    return null;
  const { inputUsdPerMillion: input, outputUsdPerMillion: output } = pricing;
  const cached = pricing.cachedInputUsdPerMillion ?? input;
  let cacheTokens = 0;
  if (cached !== input && call.inputTokens > 0) {
    if (call.cachedInputTokens === null) return null;
    cacheTokens = call.cachedInputTokens;
  }
  const charges = [
    [call.inputTokens - cacheTokens, input],
    [cacheTokens, cached],
    [call.outputTokens, output],
  ].filter(([tokens, price]) => tokens > 0 && price > 0);
  if (charges.length === 0) return 0;
  // Scale positive charges together so neither rate / 1e6 underflow nor
  // tokens * rate overflow destroys an otherwise representable final cost.
  const scale = Math.max(...charges.map(([, price]) => price));
  const cost = scale * charges.reduce(
    (sum, [tokens, price]) => sum + (tokens / 1e6) * (price / scale), 0,
  );
  // A positive charge that rounds below the smallest Number is unknown, not free.
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}

/**
 * One entry per actual provider call, including failed/rejected completions.
 * Null entries preserve calls with unavailable usage. Missing fields stay unknown;
 * known subtotals are explicitly separate from complete totals. Cached input is
 * charged at the ordinary input rate unless a separate cached rate is supplied.
 * Estimates cover token API charges only, not local compute or other provider fees.
 */
export function summarizeModelUsage(calls, pricing = null) {
  if (!Array.isArray(calls)) throw new TypeError("Model calls must be an array.");
  const normalizedPricing = normalizePricing(pricing);
  const records = calls.map(counts);
  const known = {};
  const totals = {};
  for (const key of TOKEN_FIELDS) {
    const subtotal = records.reduce((sum, call) => sum + (call[key] ?? 0), 0);
    known[key] = Number.isSafeInteger(subtotal) ? subtotal : null;
    totals[key] = records.every((call) => call[key] !== null) ? known[key] : null;
  }
  const reportedCalls = records.filter((call) => TOKEN_FIELDS.some((key) => call[key] !== null)).length;
  const coreComplete = CORE_TOKEN_FIELDS.every((key) => totals[key] !== null);
  const tokenStatus = calls.length === 0 ? "no_calls"
    : coreComplete ? "complete"
      : reportedCalls > 0 ? "partial" : "unavailable";

  const estimates = records.map((call) => estimate(call, normalizedPricing));
  const pricedCalls = estimates.filter((value) => value !== null).length;
  const subtotal = estimates.reduce((sum, value) => sum + (value ?? 0), 0);
  const knownEstimatedUsd = (pricedCalls > 0 || calls.length === 0) && Number.isFinite(subtotal)
    ? subtotal : null;
  const costStatus = calls.length === 0 ? "no_calls"
    : knownEstimatedUsd === null ? "unavailable"
      : pricedCalls === calls.length ? "estimated" : "partial";

  return {
    providerCalls: calls.length,
    tokens: {
      status: tokenStatus,
      ...totals,
      reportedCalls,
      unreportedCalls: calls.length - reportedCalls,
      known,
    },
    cost: {
      currency: "USD",
      status: costStatus,
      estimatedUsd: costStatus === "no_calls" || costStatus === "estimated" ? knownEstimatedUsd : null,
      knownEstimatedUsd,
      pricedCalls,
      unpricedCalls: calls.length - pricedCalls,
    },
  };
}
