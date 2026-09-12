import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { scoreNavigationAnswer } from "../evaluation/suite/scoring.mjs";
import { runNavigationSuite } from "../evaluation/suite/navigation.mjs";
import { benchmarks } from "../evaluation/benchmarks.mjs";
import { EVALUATION_DATE } from "../evaluation/scenarios.mjs";

// Handwritten golden response, independent of the production answer/citation
// renderer. Mutations exercise an evaluator's ability to reject bad outputs.
function fixture() {
  const source = {
    source_id: "reviewed-fixture",
    title: "Synthetic housing resource",
    agency: "Synthetic test agency",
    canonical_url: "https://fixture.invalid/housing",
    authoritative_status: "first-party",
    retrieval_date: EVALUATION_DATE,
    source_updated_date: "2026-09-10",
    refresh_days: 7,
    next_step: {
      label: "Check the synthetic resource",
      url: "https://fixture.invalid/housing/apply",
    },
    categories: ["housing"],
    jurisdiction_ids: ['tampa'],
    synthetic_fixture: true,
  };
  const chunk = {
    id: "reviewed-fixture-chunk",
    source_id: source.source_id,
    text: "Assistance covers new move-in costs only. Existing leases are not eligible.",
    section: "Application limits",
    page: 2,
    record_id: "SYNTHETIC-42",
    layer: "Synthetic records",
    url: "https://fixture.invalid/housing#limits",
    retrieved_at: EVALUATION_DATE,
  };
  chunk.content_hash = createHash("sha256").update(chunk.text).digest("hex");
  const evidence = {
    id: "E1",
    chunk_id: chunk.id,
    source_id: source.source_id,
    title: source.title,
    agency: source.agency,
    quote: chunk.text,
    section: chunk.section,
    page: chunk.page,
    record_id: chunk.record_id,
    layer: chunk.layer,
    url: chunk.url,
    retrieved_at: chunk.retrieved_at,
    source_updated_date: source.source_updated_date,
    authoritative_status: source.authoritative_status,
    stale: false,
    content_hash: chunk.content_hash,
  };
  return {
    benchmark: {
      category: "housing",
      expected_uncertainty_behavior: "answered",
      expected_source: [source.source_id],
      expected_next_step_resource: source.source_id,
      expected_evidence_terms: ["new move-in costs only", "not eligible"],
      expected_needs_address: false,
    },
    sources: [source],
    chunks: [chunk],
    now: EVALUATION_DATE,
    answer: {
      category: "housing",
      status: "answered",
      query: "Where can I find move-in help?",
      answer:
        "Start with Synthetic housing resource. The source says: “Assistance covers new move-in costs only. Existing leases are not eligible.” [E1]",
      meaning: "Confirm the application details with the agency.",
      evidence: [evidence],
      nextSteps: [{ ...source.next_step, agency: source.agency }],
      warnings: [],
      needsAddress: false,
      jurisdictionId: 'tampa', jurisdictionLabel: 'Tampa', needsJurisdiction: false,
      generation: { mode: "extractive", provider: "none", status: "disabled" },
    },
  };
}

function scored(value) {
  return Object.fromEntries(
    scoreNavigationAnswer(value).map((check) => [check.id, check]),
  );
}
function failed(value, id) {
  assert.equal(scored(value)[id].passed, false, id);
}

test('foreign jurisdiction quotes and next steps fail even when their provenance is exact', () => {
  const value = fixture();
  value.answer.jurisdictionId = 'clearwater';
  value.answer.jurisdictionLabel = 'Clearwater';
  failed(value, 'citation_jurisdiction_matches');
  failed(value, 'next_steps_jurisdiction_matches');
  value.sources[0].jurisdiction_ids = undefined;
  failed(value, 'citation_jurisdiction_matches');
});

test("handwritten exact-evidence response passes applicable checks and keeps unmeasured cases null", () => {
  const checks = scoreNavigationAnswer(fixture());
  assert.deepEqual(
    checks.filter((check) => check.passed === false),
    [],
  );
  assert.equal(new Set(checks.map((check) => check.id)).size, checks.length);
  assert.equal(
    checks.find((check) => check.id === "baseline_decisions_preserved").passed,
    null,
  );
  assert.equal(
    checks.find((check) => check.id === "conservative_state_preserved").passed,
    null,
  );
  assert.ok(checks.some((check) => check.kind === "proxy"));
});

test("fabricated quotation fails even if copied into an otherwise valid cited answer", () => {
  const value = fixture();
  value.answer.evidence[0].quote =
    "Every applicant receives $9000 automatically.";
  value.answer.answer =
    "Start with Synthetic housing resource. The source says: “Every applicant receives $9000 automatically.” [E1]";
  failed(value, "citation_quote_exact");
  assert.equal(scored(value).citation_hash_integrity.passed, true);
});

test("uncited extra claims and a fabricated body fail despite valid evidence and citation markers", () => {
  for (const text of [
    "You qualify for assistance. [E1]",
    `${fixture().answer.answer} You are guaranteed approval.`,
    "Start with Synthetic housing resource. The source says: “Existing leases are eligible.” [E1]",
  ]) {
    const value = fixture();
    value.answer.answer = text;
    failed(value, "answer_extractive_rendering");
    assert.equal(scored(value).citation_quote_exact.passed, true);
  }
});

test("unknown and malformed citation markers are rejected, including markers in meaning", () => {
  for (const marker of ["E99", "E0", "E01", "e1", "Eunknown"]) {
    const value = fixture();
    value.answer.meaning += ` [${marker}]`;
    failed(value, "citation_markers_resolve");
  }
});

test("duplicate markers, duplicate evidence IDs, and reused chunk IDs are separate failures", () => {
  const marker = fixture();
  marker.answer.answer += " [E1]";
  failed(marker, "citation_markers_unique");
  const duplicate = fixture();
  duplicate.answer.evidence.push(structuredClone(duplicate.answer.evidence[0]));
  failed(duplicate, "citation_identifiers_unique");
  duplicate.answer.evidence[1].id = "E2";
  failed(duplicate, "citation_chunks_unique");
});

test("answered status cannot pass without a cited excerpt, even when the body looks plausible", () => {
  const value = fixture();
  value.answer.answer = "Check the housing resource for help.";
  value.answer.evidence = [];
  failed(value, "answered_has_citation");
  failed(value, "expected_source_retrieved");
  assert.equal(scored(value).citation_quote_exact.passed, null);
});

test("hash checks recompute the trusted chunk hash and reject coordinated incorrect hash metadata", () => {
  const value = fixture();
  value.answer.evidence[0].content_hash = "0".repeat(64);
  failed(value, "citation_hash_integrity");
  value.chunks[0].content_hash = "0".repeat(64);
  failed(value, "citation_hash_integrity");
});

test("registered chunks cannot be attributed to another source with matching titles", () => {
  const value = fixture();
  value.sources.push({ ...value.sources[0], source_id: "other-source" });
  value.answer.evidence[0].source_id = "other-source";
  failed(value, "citation_source_and_chunk_registered");
});

test("unknown source and chunk IDs and ambiguous registry IDs fail independently of quote text", () => {
  for (const field of ["source_id", "chunk_id"]) {
    const value = fixture();
    value.answer.evidence[0][field] = "fabricated";
    failed(value, "citation_source_and_chunk_registered");
  }
  const duplicate = fixture();
  duplicate.chunks.push(structuredClone(duplicate.chunks[0]));
  failed(duplicate, "registry_identifiers_unique");
});

for (const [field, replacement] of [
  ["section", "Fabricated section"],
  ["page", 99],
  ["record_id", "SYNTHETIC-999"],
  ["layer", "Another layer"],
]) {
  test(`incorrect ${field} locator is rejected even when quotation and hash remain exact`, () => {
    const value = fixture();
    value.answer.evidence[0][field] = replacement;
    failed(value, `citation_${field}_matches`);
    assert.equal(scored(value).citation_quote_exact.passed, true);
  });
}

test("independent or unofficial source classifications cannot be laundered into official evidence", () => {
  for (const classification of [
    "independent",
    "unofficial",
    "unverified",
    "not-authoritative",
  ]) {
    const value = fixture();
    value.sources[0].authoritative_status = classification;
    failed(value, "citation_source_labels_match");
    failed(value, "citation_official_source_classification");
    value.answer.evidence[0].authoritative_status = classification;
    failed(value, "citation_official_source_classification");
    failed(value, "next_steps_registered_official");
  }
});

test("changing source agency, evidence URL, or citation dates fails provenance checks", () => {
  for (const [field, replacement, check] of [
    ["agency", "A different agency", "citation_source_labels_match"],
    [
      "url",
      "https://fixture.invalid/unregistered-path",
      "citation_url_matches",
    ],
    ["url", "https://attacker.invalid/collect", "citation_url_matches"],
    ["retrieved_at", "2026-01-01", "citation_dates_match"],
    ["source_updated_date", "2026-09-12", "citation_dates_match"],
  ]) {
    const value = fixture();
    value.answer.evidence[0][field] = replacement;
    failed(value, check);
  }
});

test("stale flags are independently checked for old, future-dated, and missing snapshots", () => {
  for (const timestamp of ["2020-01-01", "2099-01-01", "invalid-date"]) {
    const value = fixture();
    value.chunks[0].retrieved_at = timestamp;
    value.answer.evidence[0].retrieved_at = timestamp;
    failed(value, "citation_staleness_matches");
    value.answer.evidence[0].stale = true;
    assert.equal(scored(value).citation_staleness_matches.passed, true);
  }
});

test("next steps must match a registered official resource, its label, and its agency", () => {
  for (const [field, replacement] of [
    ["url", "https://fixture.invalid/different-application"],
    ["agency", "Third party"],
    ["label", "Guaranteed approval"],
  ]) {
    const value = fixture();
    value.answer.nextSteps[0][field] = replacement;
    failed(value, "next_steps_registered_official");
  }
  const duplicated = fixture();
  duplicated.answer.nextSteps.push(
    structuredClone(duplicated.answer.nextSteps[0]),
  );
  failed(duplicated, "next_steps_unique");
});

test("routing, status, expected source, required terms, next resource, and location expectations are scored", () => {
  for (const [field, replacement, check] of [
    ["category", "zoning", "expected_category"],
    ["expected_uncertainty_behavior", "official_judgment", "expected_status"],
    ["expected_source", ["other-source"], "expected_source_retrieved"],
    [
      "expected_evidence_terms",
      ["not present in this source"],
      "required_evidence_terms",
    ],
    ["expected_next_step_resource", "missing-resource", "expected_next_step"],
    ["expected_needs_address", true, "expected_location_request"],
  ]) {
    const value = fixture();
    value.benchmark[field] = replacement;
    failed(value, check);
  }
});

test("official and other conservative states cannot be upgraded or marked as model-generated", () => {
  for (const status of [
    "official_judgment",
    "conflicting_evidence",
    "potentially_outdated",
    "needs_location",
    "out_of_scope",
    "missing_geographic_coverage",
    "unavailable_source",
    "insufficient_evidence",
  ]) {
    const value = fixture();
    value.benchmark.expected_uncertainty_behavior = status;
    failed(value, "conservative_state_preserved");
    value.answer.status = status;
    value.answer.generation = {
      mode: "llm",
      provider: "ollama",
      status: "used",
    };
    failed(value, "conservative_state_preserved");
    failed(value, "non_answered_model_gate");
  }
});

test("an optional baseline detects changed caveats and a false factual answer under a conservative status", () => {
  const value = fixture();
  value.answer.status = "official_judgment";
  value.answer.answer =
    "I cannot make an eligibility determination. Confirm with the agency.";
  value.baseline = structuredClone(value.answer);
  value.answer.answer = "Your application is approved.";
  failed(value, "baseline_conservative_body_preserved");
  for (const field of [
    "meaning",
    "warnings",
    "nextSteps",
    "evidence",
    "needsAddress",
  ]) {
    const mutation = fixture();
    mutation.baseline = structuredClone(mutation.answer);
    mutation.answer[field] = null;
    failed(mutation, "baseline_decisions_preserved");
  }
});

test("a valid shorter substring cannot silently replace a supplied caveat during synthesis", () => {
  const value = fixture();
  value.baseline = structuredClone(value.answer);
  value.answer.evidence[0].quote = "Assistance covers new move-in costs only.";
  value.answer.answer =
    "Start with Synthetic housing resource. The source says: “Assistance covers new move-in costs only.” [E1]";
  assert.equal(scored(value).citation_quote_exact.passed, true);
  failed(value, "baseline_decisions_preserved");
  failed(value, "required_evidence_terms");
});

test("malformed answers fail structure checks without aborting scoring or recording raw output", () => {
  for (const answer of [
    null,
    {},
    "private-output-canary",
    { ...fixture().answer, evidence: [null] },
    { ...fixture().answer, nextSteps: [null] },
  ]) {
    const checks = scoreNavigationAnswer({ ...fixture(), answer });
    assert.ok(checks.some((check) => check.passed === false));
    assert.ok(!JSON.stringify(checks).includes("private-output-canary"));
  }
  const value = fixture();
  value.answer.status = "private-output-canary";
  value.answer.category = "private-output-canary";
  value.answer.answer = "private-output-canary";
  assert.ok(
    !JSON.stringify(scoreNavigationAnswer(value)).includes(
      "private-output-canary",
    ),
  );
});

test("navigation runner continues all authored cases after failures and never serializes raw exceptions", async () => {
  let calls = 0;
  const results = await runNavigationSuite({
    answer: async () => {
      calls++;
      throw new Error("secret-error-canary");
    },
  });
  assert.equal(calls, benchmarks.length);
  assert.equal(results.length, 77);
  assert.equal(
    new Set(results.map((result) => result.id)).size,
    results.length,
  );
  assert.ok(
    results.every((result) =>
      result.checks.some(
        (check) => check.id === "execution" && check.passed === false,
      ),
    ),
  );
  assert.ok(!JSON.stringify(results).includes("secret-error-canary"));
  assert.ok(results.every((result) => result.durationMs >= 0));
});

test("navigation runner disables models explicitly and isolates the trusted scoring corpus from mutations", async () => {
  const value = fixture();
  const original = structuredClone(value.sources);
  let sawDisabled = false;
  const results = await runNavigationSuite({
    sources: value.sources,
    chunks: value.chunks,
    answer: async (_question, options) => {
      sawDisabled =
        options.config.enabled === false && options.config.provider === "none";
      if (options.sources[0]) options.sources[0].title = "Contaminated corpus";
      return {
        ...value.answer,
        evidence: [
          { ...value.answer.evidence[0], title: "Contaminated corpus" },
        ],
      };
    },
  });
  assert.equal(sawDisabled, true);
  assert.deepEqual(value.sources, original);
  assert.equal(
    results[0].checks.find(
      (check) => check.id === "citation_source_labels_match",
    ).passed,
    false,
  );
  assert.ok(!JSON.stringify(results).includes("Contaminated corpus"));
});
