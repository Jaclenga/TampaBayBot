import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { EVALUATION_DATE } from "../scenarios.mjs";

const CATEGORIES = new Set([
  "housing",
  "zoning",
  "permitting",
  "development",
  "navigation",
]);
const STATUSES = new Set([
  "answered",
  "insufficient_evidence",
  "conflicting_evidence",
  "potentially_outdated",
  "needs_location",
  "official_judgment",
  "out_of_scope",
  "unavailable_source",
  "missing_geographic_coverage",
]);
// Deliberately explicit: substring tests would incorrectly classify "unofficial".
const OFFICIAL_CLASSIFICATIONS = new Set([
  "first-party",
  "official",
  "authoritative",
  "government",
]);
const PRESERVED_FIELDS = [
  "category",
  "status",
  "query",
  "meaning",
  "evidence",
  "nextSteps",
  "warnings",
  "needsAddress",
  "situation",
  "requirementsToVerify",
];
const record = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const official = (source) =>
  OFFICIAL_CLASSIFICATIONS.has(
    String(source?.authoritative_status ?? "").toLowerCase(),
  );
const normalized = (value) => value ?? null;

function indexRecords(records, key) {
  const index = new Map();
  let unique = true;
  for (const item of records) {
    if (!record(item) || !nonempty(item[key]) || index.has(item[key]))
      unique = false;
    else index.set(item[key], item);
  }
  return { index, unique };
}

function registeredUrl(source, candidate) {
  try {
    const canonical = new URL(source.canonical_url);
    const selected = new URL(candidate ?? source.canonical_url, canonical);
    if (
      canonical.protocol !== "https:" ||
      canonical.username ||
      canonical.password
    )
      return null;
    return selected.protocol === "https:" &&
      selected.hostname === canonical.hostname &&
      !selected.username &&
      !selected.password
      ? selected.href
      : canonical.href;
  } catch {
    return null;
  }
}

// An independent calculation of the documented snapshot-age contract. This does
// not establish whether a freshly fetched page describes a currently valid rule.
function expectedStaleness(source, chunk, now) {
  const timestamp = Date.parse(
    chunk?.retrieved_at ?? source?.retrieval_date ?? "",
  );
  const current = new Date(now).getTime();
  const days = Number(source?.refresh_days ?? 30);
  return (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(current) ||
    !Number.isFinite(days) ||
    days <= 0 ||
    timestamp < current - days * 86400000 ||
    timestamp > current + 86400000
  );
}

/** Hard output/provenance contracts and explicitly labeled behavioral proxies.
 * No retrieval, citation renderer, authority helper, or model grades its own work.
 * Observations contain counts or safe enums, never response text or error details.
 * baseline is optional: callers evaluating synthesis can supply its input answer
 * to verify that official decisions, caveats, and every evidence field survived.
 */
export function scoreNavigationAnswer({
  benchmark = {},
  answer,
  sources = [],
  chunks = [],
  now = EVALUATION_DATE,
  baseline,
} = {}) {
  const checks = [];
  const add = (id, passed, kind, expected, observed) =>
    checks.push({
      id,
      passed,
      kind,
      ...(expected !== undefined ? { expected } : {}),
      ...(observed !== undefined ? { observed } : {}),
    });
  const output = record(answer) ? answer : {};
  const evidence = Array.isArray(output.evidence) ? output.evidence : [];
  const steps = Array.isArray(output.nextSteps) ? output.nextSteps : [];
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];
  const sourceIndex = indexRecords(
    Array.isArray(sources) ? sources : [],
    "source_id",
  );
  const chunkIndex = indexRecords(Array.isArray(chunks) ? chunks : [], "id");
  const rows = evidence.map((item) => ({
    item: record(item) ? item : {},
    source: sourceIndex.index.get(item?.source_id),
    chunk: chunkIndex.index.get(item?.chunk_id),
  }));
  const text = typeof output.answer === "string" ? output.answer : "";
  const narrative = [
    text,
    typeof output.meaning === "string" ? output.meaning : "",
  ].join("\n");
  const markers = [...narrative.matchAll(/\[(E[^\]\s]*)\]/gi)].map(
    (match) => match[1],
  );
  const ids = rows.map(({ item }) => item.id);
  const markerSet = new Set(markers);
  const citedRows = markers.map((id) =>
    rows.find(({ item }) => item.id === id),
  );
  const sourceIds = new Set(rows.map(({ item }) => item.source_id));
  const each = (id, predicate, kind = "integrity") => {
    const passed = rows.filter(predicate).length;
    add(
      id,
      rows.length ? passed === rows.length : null,
      kind,
      rows.length,
      passed,
    );
  };

  add(
    "answer_structure",
    record(answer) &&
      CATEGORIES.has(output.category) &&
      STATUSES.has(output.status) &&
      nonempty(text) &&
      typeof output.query === "string" &&
      (output.meaning === null || typeof output.meaning === "string") &&
      Array.isArray(output.evidence) &&
      Array.isArray(output.nextSteps) &&
      Array.isArray(output.warnings) &&
      warnings.every((item) => typeof item === "string") &&
      typeof output.needsAddress === "boolean",
    "integrity",
  );
  add(
    "registry_identifiers_unique",
    Array.isArray(sources) &&
      Array.isArray(chunks) &&
      sourceIndex.unique &&
      chunkIndex.unique,
    "integrity",
  );
  add(
    "citation_identifiers_unique",
    ids.every((id) => typeof id === "string" && /^E[1-9]\d*$/.test(id)) &&
      new Set(ids).size === ids.length,
    "integrity",
  );
  add(
    "citation_chunks_unique",
    new Set(rows.map(({ item }) => item.chunk_id)).size === rows.length,
    "integrity",
  );
  add(
    "citation_markers_resolve",
    markers.every((id) => /^E[1-9]\d*$/.test(id) && ids.includes(id)),
    "integrity",
    markers.length,
    citedRows.filter(Boolean).length,
  );
  add(
    "citation_markers_unique",
    markerSet.size === markers.length,
    "integrity",
    markers.length,
    markerSet.size,
  );
  add(
    "answered_has_citation",
    output.status === "answered" ? rows.length > 0 && markers.length > 0 : null,
    "integrity",
  );

  each("citation_source_and_chunk_registered", ({ item, source, chunk }) =>
    Boolean(source && chunk && chunk.source_id === item.source_id),
  );
  each("citation_quote_exact", ({ item, chunk }) =>
    Boolean(
      chunk &&
        nonempty(item.quote) &&
        typeof chunk.text === "string" &&
        chunk.text.includes(item.quote),
    ),
  );
  each("citation_hash_integrity", ({ item, chunk }) =>
    Boolean(
      chunk &&
        typeof chunk.text === "string" &&
        typeof item.content_hash === "string" &&
        /^[a-f0-9]{64}$/.test(item.content_hash) &&
        item.content_hash === chunk.content_hash &&
        createHash("sha256").update(chunk.text).digest("hex") ===
          chunk.content_hash,
    ),
  );
  for (const field of ["section", "page", "record_id", "layer"]) {
    each(`citation_${field}_matches`, ({ item, chunk }) =>
      Boolean(
        chunk &&
          Object.hasOwn(item, field) &&
          item[field] === normalized(chunk[field]),
      ),
    );
  }
  each("citation_source_labels_match", ({ item, source }) =>
    Boolean(
      source &&
        item.title === source.title &&
        item.agency === source.agency &&
        item.authoritative_status === source.authoritative_status,
    ),
  );
  each("citation_official_source_classification", ({ source }) =>
    official(source),
  );
  each("citation_url_matches", ({ item, source, chunk }) =>
    Boolean(
      source &&
        chunk &&
        registeredUrl(source, chunk.url) &&
        item.url === registeredUrl(source, chunk.url),
    ),
  );
  each("citation_dates_match", ({ item, source, chunk }) =>
    Boolean(
      source &&
        chunk &&
        item.retrieved_at ===
          (chunk.retrieved_at ?? source.retrieval_date ?? null) &&
        item.source_updated_date === normalized(source.source_updated_date),
    ),
  );
  each("citation_staleness_matches", ({ item, source, chunk }) =>
    Boolean(
      source &&
        chunk &&
        typeof item.stale === "boolean" &&
        item.stale === expectedStaleness(source, chunk, now),
    ),
  );

  // The accepted answered body is an intentionally narrow public contract: fixed
  // navigation framing plus full exact evidence quotes. Matching this is not a
  // claim that an excerpt is relevant, complete, or semantically sufficient.
  const bodyMarkers = [...text.matchAll(/\[(E\d+)\]/g)].map(
    (match) => match[1],
  );
  const rendered = bodyMarkers
    .map((id, index) => {
      const item = evidence.find((entry) => entry?.id === id);
      if (!item) return null;
      return index === 0
        ? `Start with ${item.title}. The source says: “${item.quote}” [${id}]`
        : `${item.title}: “${item.quote}” [${id}]`;
    })
    .join("\n\n");
  add(
    "answer_extractive_rendering",
    output.status === "answered"
      ? bodyMarkers.length > 0 && text === rendered
      : null,
    "integrity",
  );
  add(
    "first_evidence_preserved_in_answer",
    output.status === "answered" ? bodyMarkers[0] === evidence[0]?.id : null,
    "integrity",
  );

  const validSteps = steps.filter(
    (step) =>
      record(step) &&
      nonempty(step.label) &&
      nonempty(step.agency) &&
      Array.from(sourceIndex.index.values()).some(
        (source) =>
          official(source) &&
          step.agency === source.agency &&
          step.url === registeredUrl(source, source.next_step?.url) &&
          step.label === (source.next_step?.label ?? `Visit ${source.title}`),
      ),
  ).length;
  add(
    "next_steps_registered_official",
    steps.length ? validSteps === steps.length : null,
    "integrity",
    steps.length,
    validSteps,
  );
  add(
    "next_steps_unique",
    new Set(steps.map((step) => step?.url)).size === steps.length,
    "integrity",
  );
  add(
    "expected_category",
    benchmark.category ? output.category === benchmark.category : null,
    "behavior",
    benchmark.category,
    CATEGORIES.has(output.category) ? output.category : "invalid",
  );
  add(
    "expected_status",
    benchmark.expected_uncertainty_behavior
      ? output.status === benchmark.expected_uncertainty_behavior
      : null,
    "behavior",
    benchmark.expected_uncertainty_behavior,
    STATUSES.has(output.status) ? output.status : "invalid",
  );
  const expectedSources = Array.isArray(benchmark.expected_source)
    ? benchmark.expected_source
    : [];
  add(
    "expected_source_retrieved",
    expectedSources.length
      ? expectedSources.some((id) => sourceIds.has(id))
      : null,
    "proxy",
  );
  const nextSource = sourceIndex.index.get(
    benchmark.expected_next_step_resource,
  );
  add(
    "expected_next_step",
    benchmark.expected_next_step_resource
      ? Boolean(
          nextSource &&
            steps.some(
              (step) =>
                step?.url ===
                registeredUrl(nextSource, nextSource.next_step?.url),
            ),
        )
      : null,
    "proxy",
  );
  const terms = Array.isArray(benchmark.expected_evidence_terms)
    ? benchmark.expected_evidence_terms
    : [];
  const evidenceText = rows
    .map(({ item }) => (typeof item.quote === "string" ? item.quote : ""))
    .join(" ")
    .toLowerCase();
  const foundTerms = terms.filter((term) =>
    evidenceText.includes(String(term).toLowerCase()),
  ).length;
  add(
    "required_evidence_terms",
    terms.length ? foundTerms === terms.length : null,
    "proxy",
    terms.length,
    foundTerms,
  );
  add(
    "expected_location_request",
    typeof benchmark.expected_needs_address === "boolean"
      ? output.needsAddress === benchmark.expected_needs_address
      : null,
    "behavior",
    benchmark.expected_needs_address,
    typeof output.needsAddress === "boolean" ? output.needsAddress : null,
  );

  const conservative =
    typeof benchmark.expected_uncertainty_behavior === "string" &&
    benchmark.expected_uncertainty_behavior !== "answered";
  add(
    "conservative_state_preserved",
    conservative
      ? output.status === benchmark.expected_uncertainty_behavior &&
          output.generation?.mode !== "llm" &&
          output.generation?.status !== "used"
      : null,
    "behavior",
  );
  add(
    "non_answered_model_gate",
    STATUSES.has(output.status) && output.status !== "answered"
      ? output.generation?.mode !== "llm" &&
          output.generation?.status !== "used"
      : null,
    "integrity",
  );
  add(
    "uncertainty_language_proxy",
    conservative && benchmark.expected_uncertainty_behavior !== "out_of_scope"
      ? /\b(cannot|could not|do not have|does not|not enough|need|confirm|check|verify|couldn't|can't)\b/i.test(
          narrative,
        )
      : null,
    "proxy",
  );
  add(
    "baseline_decisions_preserved",
    baseline === undefined
      ? null
      : record(baseline) &&
          PRESERVED_FIELDS.every((field) =>
            isDeepStrictEqual(output[field], baseline[field]),
          ),
    "integrity",
  );
  add(
    "baseline_conservative_body_preserved",
    baseline === undefined || baseline?.status === "answered"
      ? null
      : record(baseline) && output.answer === baseline.answer,
    "integrity",
  );
  return checks;
}
