import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import {
  runQualitySuite,
  scoreClaimQuality,
  validateQualityGroundTruth,
} from "../evaluation/suite/quality.mjs";
import { makeReport } from "../evaluation/suite/report.mjs";
import { EVALUATION_DATE } from "../evaluation/scenarios.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const corpusSources = JSON.parse(
  await fs.readFile(new URL("../data/sources.json", import.meta.url), "utf8"),
);
const corpusChunks = JSON.parse(
  await fs.readFile(new URL("../data/chunks.json", import.meta.url), "utf8"),
);

function fixture() {
  const text = "Applications use the official portal and close at 5 p.m.";
  const secondText = "Applicants must confirm that the program is still open.";
  const source = {
    source_id: "fixture-source",
    title: "Fixture program",
    agency: "Fixture public office",
    authoritative_status: "first-party",
    jurisdiction_ids: ["tampa"],
  };
  const chunks = [
    {
      id: "fixture-chunk",
      source_id: source.source_id,
      text,
      content_hash: digest(text),
    },
    {
      id: "fixture-second",
      source_id: source.source_id,
      text: secondText,
      content_hash: digest(secondText),
    },
  ];
  const reference = {
    id: "fixture-case",
    title: "Fixture application instructions",
    question: "How do I apply?",
    jurisdiction_id: "tampa",
    expected_status: "answered",
    claims: [
      {
        id: "portal",
        text_sha256: digest(text),
        support: [
          { source_id: source.source_id, chunk_id: chunks[0].id },
        ],
      },
    ],
  };
  const evidence = {
    id: "E1",
    source_id: source.source_id,
    chunk_id: chunks[0].id,
    quote: text,
  };
  const answer = {
    status: "answered",
    answer: `Start with Fixture program. The source says: “${text}” [E1]`,
    evidence: [evidence],
  };
  return { text, secondText, source, chunks, reference, evidence, answer };
}

const scored = (reference, answer) =>
  Object.fromEntries(
    scoreClaimQuality({ reference, answer }).map((check) => [check.id, check]),
  );

test("exact authored claims with supporting citations pass all quality metrics", () => {
  const value = fixture();
  const checks = scored(value.reference, value.answer);
  assert.equal(checks.factual_accuracy.passed, true);
  assert.equal(checks.citation_correctness.passed, true);
  assert.equal(checks.citation_completeness.passed, true);
  assert.doesNotMatch(JSON.stringify(checks), new RegExp(value.text));
});

test("a fabricated cited claim fails accuracy and citation correctness", () => {
  const value = fixture();
  value.answer.answer =
    "Start with Fixture program. The source says: “Everyone automatically qualifies.” [E1]";
  const checks = scored(value.reference, value.answer);
  assert.equal(checks.factual_accuracy.passed, false);
  assert.equal(checks.citation_correctness.passed, false);
  assert.equal(checks.citation_completeness.passed, true);
});

test("a real but non-supporting citation fails correctness independently", () => {
  const value = fixture();
  value.answer.evidence[0] = {
    ...value.answer.evidence[0],
    source_id: "other-source",
    chunk_id: "other-chunk",
  };
  const checks = scored(value.reference, value.answer);
  assert.equal(checks.factual_accuracy.passed, true);
  assert.equal(checks.citation_correctness.passed, false);
  assert.equal(checks.citation_completeness.passed, true);
});

test("an uncited expected claim fails completeness without changing accuracy", () => {
  const value = fixture();
  value.answer.answer = value.answer.answer.replace(" [E1]", "");
  const checks = scored(value.reference, value.answer);
  assert.equal(checks.factual_accuracy.passed, true);
  assert.equal(checks.citation_correctness.passed, null);
  assert.equal(checks.citation_completeness.passed, false);
});

test("partial citation coverage is measured across every extractive claim", () => {
  const value = fixture();
  value.reference.claims.push({
    id: "availability",
    text_sha256: digest(value.secondText),
    support: [
      { source_id: value.source.source_id, chunk_id: value.chunks[1].id },
    ],
  });
  value.answer.answer += `\n\nFixture program: “${value.secondText}”`;
  value.answer.evidence.push({
    id: "E2",
    source_id: value.source.source_id,
    chunk_id: value.chunks[1].id,
    quote: value.secondText,
  });
  const checks = scored(value.reference, value.answer);
  assert.equal(checks.factual_accuracy.passed, true);
  assert.equal(checks.citation_correctness.passed, true);
  assert.deepEqual(checks.citation_completeness.observed, { cited: 1 });
  assert.equal(checks.citation_completeness.passed, false);
});

test("an additional uncited claim cannot hide behind one correct cited claim", () => {
  const value = fixture();
  value.answer.answer +=
    "\n\nFixture program: “The office guarantees approval.”";
  const checks = scored(value.reference, value.answer);
  assert.equal(checks.factual_accuracy.passed, false);
  assert.equal(checks.citation_correctness.passed, true);
  assert.equal(checks.citation_completeness.passed, false);
});

test("ground truth must resolve to exact retained source chunks", () => {
  const value = fixture();
  const groundTruth = {
    schema_version: 1,
    reference_date: EVALUATION_DATE,
    cases: [value.reference],
  };
  assert.equal(
    validateQualityGroundTruth(groundTruth, {
      sources: [value.source],
      chunks: value.chunks,
    }),
    groundTruth,
  );
  for (const mutate of [
    (copy) => {
      copy.reference_date = "not-a-date";
    },
    (copy) => {
      copy.cases[0].claims[0].text_sha256 = digest("different claim");
    },
    (copy) => {
      copy.cases[0].claims[0].support[0].chunk_id = "missing-chunk";
    },
    (copy) => {
      copy.cases.push(structuredClone(copy.cases[0]));
    },
  ]) {
    const copy = structuredClone(groundTruth);
    mutate(copy);
    assert.throws(() =>
      validateQualityGroundTruth(copy, {
        sources: [value.source],
        chunks: value.chunks,
      }),
    );
  }
});

test("the Tampa Bay claim-quality suite runs through the guarded application path", async () => {
  const cases = await runQualitySuite({
    sources: corpusSources,
    chunks: corpusChunks,
    now: EVALUATION_DATE,
  });
  assert.equal(cases.length, 12);
  assert.deepEqual(
    [...new Set(cases.flatMap((row) => row.checks.map((check) => check.id)))],
    [
      "execution",
      "factual_accuracy",
      "citation_correctness",
      "citation_completeness",
    ],
  );
  assert.ok(cases.every((row) => row.checks.every((check) => check.passed)));

  const report = makeReport(cases, {
    mode: "offline",
    startedAt: EVALUATION_DATE,
    completedAt: EVALUATION_DATE,
  });
  assert.equal(report.automatedQuality.factualAccuracy.passed, 12);
  assert.equal(report.automatedQuality.citationCorrectness.passed, 12);
  assert.equal(report.automatedQuality.citationCompleteness.passed, 12);
  assert.equal(report.humanEvaluation.factualCorrectness, null);
});
