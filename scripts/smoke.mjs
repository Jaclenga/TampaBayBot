import fs from "node:fs/promises";
const base = process.env.PARCELPRIVATEER_SMOKE_URL || "http://localhost:3001";
const output =
  process.env.PARCELPRIVATEER_SMOKE_OUTPUT || "docs/local-api-validation.json";
async function request(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
const health = await request("/api/health");
const answer = await request("/api/ask", {
  question: "Where can I find help paying for housing?",
});
const sources = await request("/api/sources");
const evaluation = await request("/api/evaluation");
if (
  health.status !== "ready" ||
  !answer.evidence?.length ||
  sources.length < 12 ||
  evaluation.benchmark_count < 50
)
  throw new Error("Incomplete evidence or evaluation response.");
const location = await request("/api/location", {
  address: "315 E Kennedy Blvd, Tampa",
});
const candidate = location.candidates.find((item) =>
  /315.*KENNEDY/i.test(item.address),
);
if (!candidate)
  throw new Error("Known public City Hall address candidate not returned.");
// Explicitly choose the returned candidate for this documented operator smoke test.
const [property, development] = await Promise.all([
  request("/api/property", candidate),
  request("/api/development", { ...candidate, radiusMeters: 1000 }),
]);
const report = {
  observed_at: new Date().toISOString(),
  base_url: base,
  scope:
    "Live API smoke test at public Tampa City Hall; not a human geographic or accessibility audit.",
  health,
  source_count: sources.length,
  benchmark_count: evaluation.benchmark_count,
  answer: {
    status: answer.status,
    source_ids: answer.evidence.map((item) => item.source_id),
  },
  location,
  property,
  development,
};
await fs.mkdir(new URL("../docs/", import.meta.url), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      output,
      status: property.status,
      parcels: property.parcel?.records.map((item) => item.label),
      zoning: property.zoning?.records.map((item) => item.label),
      futureLandUse: property.futureLandUse?.records.map((item) => item.label),
      nearbyStatus: development.status,
      totalMatches: development.totalMatches,
    },
    null,
    2,
  ),
);
if (
  !["found", "partial", "ambiguous_parcel"].includes(property.status) ||
  !["found", "potentially_outdated"].includes(development.status)
)
  process.exitCode = 1;
