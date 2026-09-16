import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { answerWithGuardrails } from "../../src/lib/guardrails/navigator.mjs";
import { parseLlmConfig } from "../../src/lib/llm/index.mjs";

export const qualityGroundTruth = JSON.parse(
  readFileSync(new URL("../datasets/quality-benchmark.json", import.meta.url), "utf8"),
);

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,100}$/;
const JURISDICTIONS = new Set([
  "tampa",
  "st-petersburg",
  "clearwater",
  "hillsborough-county",
  "pinellas-county",
  "pasco-county",
]);
const OFFICIAL_CLASSIFICATIONS = new Set([
  "first-party",
  "official",
  "authoritative",
  "government",
]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const record = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Validate the authored oracle against the retained corpus before evaluating
 * application output. The answer implementation never receives this oracle.
 */
export function validateQualityGroundTruth(
  groundTruth,
  { sources = [], chunks = [] } = {},
) {
  if (
    !record(groundTruth) ||
    groundTruth.schema_version !== 1 ||
    typeof groundTruth.reference_date !== "string" ||
    !Number.isFinite(Date.parse(groundTruth.reference_date)) ||
    new Date(groundTruth.reference_date).toISOString() !==
      groundTruth.reference_date ||
    !Array.isArray(groundTruth.cases) ||
    !groundTruth.cases.length
  )
    throw new Error("Invalid claim-quality ground truth.");
  const sourceIndex = new Map(sources.map((source) => [source?.source_id, source]));
  const chunkIndex = new Map(chunks.map((chunk) => [chunk?.id, chunk]));
  if (sourceIndex.size !== sources.length || chunkIndex.size !== chunks.length)
    throw new Error("Claim-quality ground truth requires unique corpus IDs.");
  const caseIds = new Set();
  for (const row of groundTruth.cases) {
    if (
      !record(row) ||
      !IDENTIFIER.test(row.id ?? "") ||
      caseIds.has(row.id) ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      typeof row.question !== "string" ||
      !row.question.trim() ||
      !JURISDICTIONS.has(row.jurisdiction_id) ||
      row.expected_status !== "answered" ||
      !Array.isArray(row.claims) ||
      !row.claims.length
    )
      throw new Error("Invalid claim-quality case.");
    caseIds.add(row.id);
    const claimIds = new Set();
    const claimHashes = new Set();
    for (const claim of row.claims) {
      if (
        !record(claim) ||
        !IDENTIFIER.test(claim.id ?? "") ||
        claimIds.has(claim.id) ||
        !SHA256.test(claim.text_sha256 ?? "") ||
        claimHashes.has(claim.text_sha256) ||
        !Array.isArray(claim.support) ||
        !claim.support.length
      )
        throw new Error("Invalid claim-quality reference claim.");
      claimIds.add(claim.id);
      claimHashes.add(claim.text_sha256);
      for (const support of claim.support) {
        const source = sourceIndex.get(support?.source_id);
        const chunk = chunkIndex.get(support?.chunk_id);
        if (
          !source ||
          !chunk ||
          chunk.source_id !== source.source_id ||
          !Array.isArray(source.jurisdiction_ids) ||
          !source.jurisdiction_ids.includes(row.jurisdiction_id) ||
          !OFFICIAL_CLASSIFICATIONS.has(
            String(source.authoritative_status ?? "").toLowerCase(),
          ) ||
          typeof chunk.text !== "string" ||
          digest(chunk.text) !== claim.text_sha256 ||
          chunk.content_hash !== claim.text_sha256
        )
          throw new Error("Claim-quality support does not match the corpus.");
      }
    }
  }
  return groundTruth;
}

/** Parse only the public fixed extractive answer format. A missing citation is
 * retained as a claim so citation completeness can fail independently.
 */
export function extractAnswerClaims(answer) {
  if (typeof answer !== "string" || !answer.trim()) return [];
  return answer.split(/\n{2,}/u).map((paragraph, index) => {
    const opening = paragraph.indexOf("“");
    const closing = paragraph.lastIndexOf("”");
    if (opening < 0 || closing <= opening)
      return { textHash: null, citationId: null, wellFormed: false };
    const prefix = paragraph.slice(0, opening);
    const suffix = paragraph.slice(closing + 1).trim();
    const marker = suffix.match(/^\[(E[1-9]\d*)\]$/u);
    const validPrefix = index === 0
      ? /^Start with .+\. The source says: $/u.test(prefix)
      : /^.+: $/u.test(prefix);
    return {
      textHash: digest(paragraph.slice(opening + 1, closing)),
      citationId: marker?.[1] ?? null,
      wellFormed: validPrefix && (suffix === "" || Boolean(marker)),
    };
  });
}

export function scoreClaimQuality({ reference, answer } = {}) {
  const expectedClaims = Array.isArray(reference?.claims)
    ? reference.claims
    : [];
  const expectedByHash = new Map(
    expectedClaims.map((claim) => [claim.text_sha256, claim]),
  );
  const output = record(answer) ? answer : {};
  const claims = extractAnswerClaims(output.answer);
  const evidence = Array.isArray(output.evidence) ? output.evidence : [];
  const evidenceById = new Map();
  const duplicateEvidenceIds = new Set();
  for (const item of evidence) {
    if (evidenceById.has(item?.id)) duplicateEvidenceIds.add(item.id);
    else evidenceById.set(item?.id, item);
  }
  const matchedClaims = claims.filter((claim) =>
    expectedByHash.has(claim.textHash),
  );
  const matchedExpected = expectedClaims.filter((expected) =>
    claims.some((claim) => claim.textHash === expected.text_sha256),
  );
  const accuracyPassed =
    output.status === reference?.expected_status &&
    claims.length === expectedClaims.length &&
    matchedClaims.length === claims.length &&
    matchedExpected.length === expectedClaims.length &&
    claims.every((claim) => claim.wellFormed);

  const citedClaims = claims.filter((claim) => claim.citationId);
  const supportedCitations = citedClaims.filter((claim) => {
    const expected = expectedByHash.get(claim.textHash);
    const item = evidenceById.get(claim.citationId);
    return Boolean(
      expected &&
        item &&
        !duplicateEvidenceIds.has(claim.citationId) &&
        typeof item.quote === "string" &&
        digest(item.quote) === claim.textHash &&
        expected.support.some(
          (support) =>
            support.source_id === item.source_id &&
            support.chunk_id === item.chunk_id,
        ),
    );
  });

  return [
    {
      id: "factual_accuracy",
      kind: "accuracy",
      passed: accuracyPassed,
      expected: {
        status: reference?.expected_status ?? null,
        claims: expectedClaims.length,
      },
      observed: {
        status:
          typeof output.status === "string" ? output.status : "invalid",
        claims: claims.length,
        matched: matchedClaims.length,
      },
    },
    {
      id: "citation_correctness",
      kind: "citation",
      passed:
        citedClaims.length > 0
          ? supportedCitations.length === citedClaims.length
          : null,
      expected: { supported: citedClaims.length },
      observed: { supported: supportedCitations.length },
    },
    {
      id: "citation_completeness",
      kind: "citation",
      passed:
        claims.length > 0 && citedClaims.length === claims.length,
      expected: { cited: claims.length },
      observed: { cited: citedClaims.length },
    },
  ];
}

export async function runQualitySuite({
  sources = [],
  chunks = [],
  now,
  answer = answerWithGuardrails,
  groundTruth = qualityGroundTruth,
} = {}) {
  validateQualityGroundTruth(groundTruth, { sources, chunks });
  if (
    !Number.isFinite(Date.parse(now ?? "")) ||
    new Date(now).toISOString() !== groundTruth.reference_date
  )
    throw new Error("Claim-quality reference date does not match the run.");
  const results = [];
  for (const reference of groundTruth.cases) {
    const started = performance.now();
    let checks;
    try {
      const output = await answer(reference.question, {
        sources: structuredClone(sources),
        chunks: structuredClone(chunks),
        now,
        jurisdictionId: reference.jurisdiction_id,
        config: parseLlmConfig({ LLM_PROVIDER: "none" }),
      });
      checks = [
        { id: "execution", passed: true, kind: "robustness" },
        ...scoreClaimQuality({ reference, answer: output }),
      ];
    } catch {
      checks = [
        { id: "execution", passed: false, kind: "robustness" },
      ];
    }
    results.push({
      id: reference.id,
      suite: "quality",
      title: reference.title,
      fixture: "public_snapshot",
      durationMs: Number((performance.now() - started).toFixed(3)),
      checks,
      details: {
        scenario: "authored_claim_ground_truth",
        challenge: "fixed_extractive_answer",
      },
    });
  }
  return results;
}
