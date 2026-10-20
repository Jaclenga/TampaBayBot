import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvidence, validateCitationIntegrity } from '../src/lib/citations/evidence.mjs';

const now = new Date('2026-10-01T12:00:00Z');
const source = {
  source_id: 'office-a', title: 'Public Housing Program', agency: 'Fictional Housing Office',
  canonical_url: 'https://example.gov/program', source_updated_date: '2026-09-20',
  authoritative_status: 'first-party', retrieval_date: now.toISOString(),
};
const text = 'The program accepts applications for move-in assistance through its official office.';
const chunk = {
  id: 'program-rule', source_id: source.source_id, text, section: 'Applications',
  retrieved_at: now.toISOString(), content_hash: 'fixture-hash',
  url: 'https://example.gov/program#apply',
};
const evidence = makeEvidence({ source, chunk }, 'How do I apply?', 0, now);
const answer = { status: 'answered', answer: `The source says: “${evidence.quote}” [E1]`, evidence: [evidence], requiredEvidenceIds: ['E1'] };
const context = { sources: [source], chunks: [chunk] };

test('citation metadata and literal quote come from the registered source and chunk', () => {
  assert.equal(evidence.publisher, source.agency);
  assert.equal(evidence.source_date, source.source_updated_date);
  assert.equal(evidence.url, chunk.url);
  assert.equal(evidence.previewStatus, 'not_permitted');
  assert.equal(evidence.preview, null);
  assert.deepEqual(validateCitationIntegrity(answer, context), { valid: true, errors: [] });
});

test('retrieval time never becomes an invented publisher date', () => {
  const undated = { ...source, source_updated_date: null };
  const item = makeEvidence({ source: undated, chunk }, 'How do I apply?', 0, now);
  assert.equal(item.source_date, null);
  assert.equal(item.retrieved_at, now.toISOString());
  assert.deepEqual(validateCitationIntegrity({ ...answer, answer: `${item.quote} [E1]`, evidence: [item] },
    { sources: [undated], chunks: [chunk] }), { valid: true, errors: [] });
});

test('previews require an explicit registry permission and remain literal, bounded excerpts', () => {
  const permitted = { ...source, preview_policy: 'short_excerpt' };
  const passage = { ...chunk, text: `${text} ${'Additional published context. '.repeat(20)}` };
  const item = makeEvidence({ source: permitted, chunk: passage }, 'How do I apply?', 0, now);
  assert.equal(item.previewStatus, 'permitted');
  assert.ok(item.preview.length <= 200);
  assert.ok(item.quote.startsWith(item.preview));
  assert.deepEqual(validateCitationIntegrity({ ...answer, answer: `${item.quote} [E1]`, evidence: [item] },
    { sources: [permitted], chunks: [passage] }), { valid: true, errors: [] });
  assert.ok(validateCitationIntegrity({ ...answer, evidence: [{ ...evidence, preview: text }] }, context)
    .errors.includes('preview_policy_mismatch:E1'));
});

test('nonexistent, mismatched, and duplicate source or chunk identities fail validation', () => {
  const altered = [
    [{ ...evidence, source_id: 'missing' }, context, 'source_not_unique:E1'],
    [{ ...evidence, chunk_id: 'missing' }, context, 'chunk_not_unique:E1'],
    [evidence, { sources: [source], chunks: [{ ...chunk, source_id: 'other' }] }, 'chunk_not_unique:E1'],
    [evidence, { sources: [source, { ...source }], chunks: [chunk] }, 'source_not_unique:E1'],
    [evidence, { sources: [source], chunks: [chunk, { ...chunk }] }, 'chunk_not_unique:E1'],
  ];
  for (const [item, corpus, error] of altered) {
    const result = validateCitationIntegrity({ ...answer, evidence: [item] }, corpus);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(error), JSON.stringify(result.errors));
  }
});

test('unsupported or altered quotes, URLs, and source metadata fail validation', () => {
  for (const [change, error] of [
    [{ quote: 'Applications are guaranteed.' }, 'unsupported_quote:E1'],
    [{ url: 'https://other.example/program' }, 'source_url_mismatch:E1'],
    [{ publisher: 'Different Agency' }, 'source_metadata_mismatch:E1'],
    [{ source_date: '2027-01-01' }, 'source_metadata_mismatch:E1'],
    [{ authoritative_status: 'independent' }, 'source_metadata_mismatch:E1'],
    [{ section: 'Invented section' }, 'source_metadata_mismatch:E1'],
    [{ page: 9 }, 'source_metadata_mismatch:E1'],
    [{ record_id: 'unrelated-record' }, 'source_metadata_mismatch:E1'],
    [{ layer: 'unrelated-layer' }, 'source_metadata_mismatch:E1'],
  ]) {
    const result = validateCitationIntegrity({ ...answer, evidence: [{ ...evidence, ...change }] }, context);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(error), JSON.stringify(result.errors));
  }
});

test('stale status can be verified against the same answer clock without inventing a date', () => {
  assert.deepEqual(validateCitationIntegrity(answer, { ...context, now }), { valid: true, errors: [] });
  const result = validateCitationIntegrity({ ...answer, evidence: [{ ...evidence, stale: true }] }, { ...context, now });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('stale_status_mismatch:E1'));
});

test('nonexistent markers, unsupported claims, missing markers, and wrong required IDs fail closed', () => {
  for (const [change, error] of [
    [{ answer: `${evidence.quote} [E99]` }, 'unknown_citation:E99'],
    [{ answer: 'Applications are guaranteed. [E1]' }, 'unsupported_claim:E1'],
    [{ answer: evidence.quote }, 'missing_citation'],
    [{ requiredEvidenceIds: ['E2'] }, 'required_citation_missing'],
  ]) {
    const result = validateCitationIntegrity({ ...answer, ...change }, context);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(error), JSON.stringify(result.errors));
  }
});

test('plain-text interpretation and warning fields cannot contain unclickable citation markers', () => {
  for (const change of [
    { meaning: 'This interpretation comes from [E1].' },
    { warnings: ['Check the source [E1].'] },
  ]) {
    const result = validateCitationIntegrity({ ...answer, ...change }, context);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('unclickable_citation'));
  }
});

test('conflicting evidence requires both markers to resolve to their own registered passages', () => {
  const otherSource = {
    ...source, source_id: 'office-b', agency: 'Fictional County Housing Office',
    canonical_url: 'https://example.gov/other',
  };
  const otherChunk = {
    ...chunk, id: 'opposing-rule', source_id: otherSource.source_id,
    text: 'Applications are closed until funding is restored.',
    url: 'https://example.gov/other#status',
  };
  const otherEvidence = makeEvidence({ source: otherSource, chunk: otherChunk }, 'Are applications open?', 1, now);
  const corpus = { sources: [source, otherSource], chunks: [chunk, otherChunk] };
  const conflict = {
    status: 'conflicting_evidence',
    answer: 'The sources disagree about whether applications are open. [E1] [E2]',
    evidence: [evidence, otherEvidence], requiredEvidenceIds: ['E1', 'E2'],
  };
  assert.deepEqual(validateCitationIntegrity(conflict, corpus), { valid: true, errors: [] });
  for (const answerText of [
    'The sources disagree about whether applications are open. [E1]',
    'The sources disagree about whether applications are open. [E1] [E3]',
    'The sources disagree about whether applications are open. [E1] [E1]',
  ]) {
    const result = validateCitationIntegrity({ ...conflict, answer: answerText }, corpus);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('incomplete_conflict_citations'));
  }
  const wrongSource = validateCitationIntegrity({ ...conflict,
    evidence: [evidence, { ...otherEvidence, source_id: source.source_id }],
  }, corpus);
  assert.equal(wrongSource.valid, false);
  assert.ok(wrongSource.errors.includes('chunk_not_unique:E2'));
});

test('citation IDs must be unique and sequential for unambiguous clickable references', () => {
  const duplicate = { ...evidence, id: 'E1' };
  const skipped = { ...evidence, id: 'E3' };
  for (const item of [duplicate, skipped]) {
    const result = validateCitationIntegrity({ ...answer, evidence: [evidence, item] }, context);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('invalid_evidence_id'));
  }
});
