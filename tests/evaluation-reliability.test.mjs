import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  reliabilityDataset, validateReliabilityDataset, scoreReliabilityAnswer,
  runReliabilitySuite,
} from '../evaluation/suite/reliability.mjs';
import { makeReport, reportMarkdown } from '../evaluation/suite/report.mjs';

const now = '2026-10-09T12:00:00.000Z';

// A handwritten response keeps the mutation oracle independent of answer code.
function golden() {
  const source = {
    source_id: 'reviewed-fixture', title: 'Synthetic housing resource',
    agency: 'Synthetic test agency', categories: ['housing'],
    jurisdiction_ids: ['tampa'], authoritative_status: 'first-party',
    canonical_url: 'https://fixture.invalid/housing', retrieval_date: now,
    refresh_days: 30,
    next_step: { label: 'Check the synthetic resource', url: 'https://fixture.invalid/housing/apply' },
  };
  const chunk = {
    id: 'reviewed-fixture-chunk', source_id: source.source_id,
    text: 'The synthetic office lists housing assistance resources. Contact the office to verify current options.',
    url: source.canonical_url, retrieved_at: now,
  };
  chunk.content_hash = createHash('sha256').update(chunk.text).digest('hex');
  const evidence = {
    id: 'E1', source_id: source.source_id, chunk_id: chunk.id,
    title: source.title, agency: source.agency, quote: chunk.text,
    section: null, page: null, record_id: null, layer: null,
    url: chunk.url, retrieved_at: chunk.retrieved_at,
    source_updated_date: null, authoritative_status: source.authoritative_status,
    stale: false, content_hash: chunk.content_hash,
  };
  return {
    sources: [source], chunks: [chunk], now,
    reference: {
      expectedStatus: 'answered', jurisdictionId: 'tampa',
      requiredSourceIds: [source.source_id], allowedSourceIds: [source.source_id],
      allowedSupportPairs: [{ sourceId: source.source_id, chunkId: chunk.id }],
      expectedNextStepSourceIds: [source.source_id], nextStepRequired: true,
      unacceptableClaims: [{ id: 'guaranteed-eligibility', pattern: 'you (?:qualify|are eligible)' }],
      clarificationKind: 'none', uncertaintyRequired: true,
    },
    answer: {
      category: 'housing', status: 'answered', query: 'Where can I find housing help in Tampa?',
      answer: `Start with ${source.title}. The source says: “${chunk.text}” [E1]`,
      meaning: 'Confirm current options with the agency.', evidence: [evidence],
      nextSteps: [{ ...source.next_step, agency: source.agency }], warnings: [],
      needsAddress: false, needsJurisdiction: false,
      jurisdictionId: 'tampa', jurisdictionLabel: 'Tampa',
      generation: { mode: 'extractive', provider: 'none', status: 'disabled' },
    },
  };
}

const scored = value => Object.fromEntries(scoreReliabilityAnswer(value).map(item => [item.id, item]));

test('the committed answer-reliability dataset has a complete synthetic oracle', () => {
  assert.equal(validateReliabilityDataset(reliabilityDataset), reliabilityDataset);
  assert.ok(reliabilityDataset.cases.length >= 30);
  assert.ok(new Set(reliabilityDataset.cases.map(item => item.category)).size >= 5);
  const bad = structuredClone(reliabilityDataset);
  bad.fixture.chunks[0].content_hash = '0'.repeat(64);
  assert.throws(() => validateReliabilityDataset(bad), /fixture chunk/);
});

test('handwritten supported answer passes applicable reliability checks', () => {
  assert.deepEqual(scoreReliabilityAnswer(golden()).filter(item => item.passed === false), []);
});

test('a plausible wrong-source citation fails even with a real quote and HTTPS link', () => {
  const value = golden();
  value.sources.push({ ...value.sources[0], source_id: 'other-fixture' });
  value.answer.evidence[0].source_id = 'other-fixture';
  assert.equal(scored(value).citation_source_and_chunk_registered.passed, false);
  assert.equal(scored(value).required_sources_cited.passed, false);
});

test('an extra valid citation from a different source fails authored support restrictions', () => {
  const value = golden();
  const extraSource = { ...value.sources[0], source_id: 'other-fixture',
    canonical_url: 'https://fixture.invalid/other',
    next_step: { label: 'Check other resource', url: 'https://fixture.invalid/other' } };
  const extraChunk = { ...value.chunks[0], id: 'other-fixture-chunk', source_id: extraSource.source_id,
    url: extraSource.canonical_url };
  value.sources.push(extraSource);
  value.chunks.push(extraChunk);
  value.answer.evidence.push({ ...value.answer.evidence[0], id: 'E2',
    source_id: extraSource.source_id, chunk_id: extraChunk.id, url: extraChunk.url });
  assert.equal(scored(value).citation_source_and_chunk_registered.passed, true);
  assert.equal(scored(value).citation_quote_exact.passed, true);
  assert.equal(scored(value).citations_use_allowed_support.passed, false);
});

test('a valid but irrelevant chunk from the right source fails authored support restrictions', () => {
  const value = golden();
  const irrelevant = { ...value.chunks[0], id: 'unrelated-program-chunk',
    text: 'This source also publishes unrelated synthetic program information.' };
  irrelevant.content_hash = createHash('sha256').update(irrelevant.text).digest('hex');
  value.chunks.push(irrelevant);
  value.answer.evidence.push({ ...value.answer.evidence[0], id: 'E2',
    chunk_id: irrelevant.id, quote: irrelevant.text, content_hash: irrelevant.content_hash });
  assert.equal(scored(value).citation_source_and_chunk_registered.passed, true);
  assert.equal(scored(value).citation_quote_exact.passed, true);
  assert.equal(scored(value).citations_use_allowed_support.passed, false);
});

test('invented claim, changed quote, and unregistered link fail independently', () => {
  const invented = golden();
  invented.answer.answer += ' You qualify for the program.';
  assert.equal(scored(invented).unacceptable_claims_absent.passed, false);
  assert.equal(scored(invented).answer_extractive_rendering.passed, false);
  const changed = golden();
  changed.answer.evidence[0].quote = 'Everyone receives assistance.';
  assert.equal(scored(changed).citation_quote_exact.passed, false);
  const link = golden();
  link.answer.evidence[0].url = 'https://different.invalid/housing';
  assert.equal(scored(link).citation_url_matches.passed, false);
});

test('missing clarification and official next step fail their authored checks', () => {
  const address = golden();
  address.reference.clarificationKind = 'address';
  assert.equal(scored(address).necessary_clarification.passed, false);
  const next = golden();
  next.answer.nextSteps = [];
  assert.equal(scored(next).useful_official_next_step.passed, false);
});

test('offline suite and report group failures by category without recording answers', async () => {
  const dataset = structuredClone(reliabilityDataset);
  const results = await runReliabilitySuite({ dataset, answer: async () => {
    throw new Error('private response text must not appear in reports');
  } });
  assert.equal(results.length, dataset.cases.length + 1);
  const report = makeReport(results, { mode: 'offline' });
  const category = dataset.cases[0].category;
  assert.ok(report.summary.reliabilityByCategory[category].failed > 0);
  assert.match(reportMarkdown(report), /Answer reliability by category/);
  assert.doesNotMatch(JSON.stringify(report), /private response text/);
});
