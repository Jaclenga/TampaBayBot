import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../src/lib/core/answer.mjs';

const now = '2026-09-12T12:00:00Z';
const source = {
  source_id: 'harbor-support', topic_id: 'harbor-support', title: 'Harbor Housing Support',
  agency: 'Synthetic housing agency', canonical_url: 'https://example.gov/harbor-support',
  authoritative_status: 'first-party', categories: ['housing', 'navigation'], jurisdiction_ids: ['tampa'],
  keywords: ['housing', 'income', 'limits'], retrieval_date: now, refresh_days: 7,
};
const passage = (id, text) => ({
  id, source_id: source.source_id, title: source.title, section: 'Program rules', text,
  url: source.canonical_url, retrieved_at: now,
});
const current = passage('current', 'Harbor Housing Support income limits for 2026: $65,000 for a household of two.');
const previous = passage('previous', 'Harbor Housing Support income limits for 2025: $60,000 for a household of two.');
const query = 'What are the current 2026 income limits for Harbor Housing Support?';
const answer = (question, chunks) => answerQuestion(question, { sources: [source], chunks, now, jurisdictionId: 'tampa' });

function assertLiteralEvidence(result, chunks) {
  const ids = new Set(result.evidence.map(item => item.id));
  assert.equal(ids.size, result.evidence.length, 'Each citation must have a unique identifier.');
  for (const item of result.evidence) {
    const original = chunks.find(chunk => chunk.id === item.chunk_id && chunk.source_id === item.source_id);
    assert.ok(original, 'Evidence must retain its registered source and chunk identity.');
    assert.ok(original.text.includes(item.quote), 'Every quote must remain a literal source substring.');
  }
  for (const [, id] of result.answer.matchAll(/\[(E\d+)\]/g)) assert.ok(ids.has(id), `Answer references missing evidence ${id}.`);
  for (const id of result.requiredEvidenceIds ?? []) assert.ok(ids.has(id), `Required evidence ${id} must exist.`);
}

test('an explicit income year survives a current application-status question in the same request', () => {
  const chunks = [previous, current, passage('closed', 'Applications are currently closed. Contact staff to find out the next opening.')];
  for (const question of [
    'What were the 2025 income limits for Harbor Housing Support and are applications currently open?',
    'What were the 2025 income limits for Harbor Housing Support? Are applications currently open?',
    'What were the 2025 income limits for Harbor Housing Support, are applications currently open?',
    'What were the 2025 income limits for Harbor Housing Support; are applications currently open?',
    'WHAT WERE THE 2025 INCOME LIMITS FOR HARBOR HOUSING SUPPORT? ARE APPLICATIONS CURRENTLY OPEN?',
  ]) {
    const result = answer(question, chunks);
    assert.equal(result.status, 'answered', question);
    assert.match(result.answer, /2025: \$60,000/);
    assert.doesNotMatch(result.answer, /2026|65,000/);
    assert.match(result.answer, /Applications are currently closed/);
    assertLiteralEvidence(result, chunks);
  }
});

test('past-tense current income limits retain their explicitly requested historical year', () => {
  const chunks = [previous, current];
  for (const question of [
    'What were the current income limits for 2025 for Harbor Housing Support?',
    'What were the current 2025 Harbor Housing Support income limits?',
    'What were the latest income limits for Harbor Housing Support in 2025?',
  ]) {
    const result = answer(question, chunks);
    assert.equal(result.status, 'answered', question);
    assert.match(result.answer, /2025: \$60,000/);
    assert.doesNotMatch(result.answer, /2026|65,000/);
    assertLiteralEvidence(result, chunks);
  }
});

test('current applicability in a following clause refers back to the stated income limits', () => {
  for (const question of [
    'I have the 2025 Harbor Housing Support income limits, but can I use them today?',
    'I have the 2025 Harbor Housing Support income limits. Can I use them today?',
    'I have the 2025 Harbor Housing Support income limits; are they still valid today?',
    'I HAVE THE 2025 HARBOR HOUSING SUPPORT INCOME LIMITS, BUT CAN I USE THEM TODAY?',
    'What were the current Harbor Housing Support income limits for 2025, and can I use them today?',
  ]) {
    const oldOnly = answer(question, [previous]);
    assert.equal(oldOnly.status, 'potentially_outdated', question);
    assert.match(oldOnly.answer, /labeled 2025/);
    assertLiteralEvidence(oldOnly, [previous]);
    const chunks = [previous, current];
    const result = answer(question, chunks);
    assert.equal(result.status, 'answered', question);
    assert.match(result.answer, /2026: \$65,000/);
    assert.doesNotMatch(result.answer, /2025|60,000/);
    assertLiteralEvidence(result, chunks);
  }
});

test('currency separators do not sever a current income applicability clause', () => {
  const chunks = [previous, current];
  for (const amount of ['$2000.00', '$2,000.00']) {
    const result = answer(`Can I use the 2025 Harbor Housing Support income limits for an income of ${amount} today?`, chunks);
    assert.equal(result.status, 'answered');
    assert.match(result.answer, /2026: \$65,000/);
    assert.doesNotMatch(result.answer, /2025|60,000/);
    assertLiteralEvidence(result, chunks);
  }
});

test('a current income question preserves an explicit application conflict response', () => {
  const chunks = [current,
    passage('open', 'Applications are currently open. Contact staff to submit your application.'),
    passage('closed', 'Applications are currently closed. Contact staff to find out the next opening.'),
  ];
  const result = answer(query, chunks);
  assert.equal(result.status, 'conflicting_evidence');
  assert.match(result.answer, /disagree about whether applications are open/);
  assert.ok(result.evidence.some(item => /applications are currently open/i.test(item.quote)));
  assert.ok(result.evidence.some(item => /applications are currently closed/i.test(item.quote)));
  assertLiteralEvidence(result, chunks);
});

test('an inseparable qualification cannot present an old or undated income limit as current', () => {
  for (const text of [
    'Harbor Housing Support income limits for 2025: $60,000; applications are currently closed.',
    'Household income limits are $60,000, and applications are currently closed.',
  ]) {
    const chunks = [passage('qualified-income', text), current];
    const result = answer(query, chunks);
    assert.equal(result.status, 'insufficient_evidence', text);
    assert.ok(result.evidence.some(item => /applications are currently closed/i.test(item.quote)), 'The closure must remain available as evidence.');
    assertLiteralEvidence(result, chunks);
  }
});

test('an income-year heading alone cannot establish the limits in a separate table row', () => {
  const chunks = [passage('year-headings', '2025 income limits\nHousehold of two: $60,000.\n2026 income limits\nHousehold of two: $65,000.')];
  const result = answer(query, chunks);
  assert.equal(result.status, 'insufficient_evidence');
  assertLiteralEvidence(result, chunks);
});

test('using a previous income year today requires current-year evidence', () => {
  for (const question of [
    'Can I use the 2025 Harbor Housing Support income limits today?',
    'CAN I USE THE 2025 HARBOR HOUSING SUPPORT INCOME LIMITS TODAY?',
    'Can I use the 2025 Harbor Housing Support income limits   today ?',
    'Are the 2025 Harbor Housing Support income limits valid now?',
  ]) {
    const result = answer(question, [previous]);
    assert.equal(result.status, 'potentially_outdated', question);
    assert.match(result.answer, /labeled 2025/);
    assertLiteralEvidence(result, [previous]);
  }
});

test('a current applicability question quotes the current value when available', () => {
  const chunks = [previous, current];
  const result = answer('Can I use the 2025 Harbor Housing Support income limits today?', chunks);
  assert.equal(result.status, 'answered');
  assert.match(result.answer, /2026: \$65,000/);
  assert.doesNotMatch(result.answer, /2025|60,000/);
  assertLiteralEvidence(result, chunks);
});

test('an old table heading with a full date supports an outdated warning without supplying an income value', () => {
  const chunks = [passage('dated-heading', 'Federal and State Income Limits 2025 as of 4/28/2025')];
  const result = answer('Can I use the 2025 Harbor Housing Support income limits today?', chunks);
  assert.equal(result.status, 'potentially_outdated');
  assert.match(result.answer, /labeled 2025/);
  assert.ok(result.evidence.some(item => item.quote.includes('2025')));
  assertLiteralEvidence(result, chunks);
});

test('a full publication date cannot make a requested-year heading answer income limits', () => {
  for (const [year, question] of [
    [2025, 'What were the 2025 income limits for Harbor Housing Support?'],
    [2026, 'What are the current income limits for Harbor Housing Support?'],
  ]) {
    const chunks = [passage('dated-heading', `Federal and State Income Limits ${year} as of 4/28/${year}`)];
    const result = answer(question, chunks);
    assert.equal(result.status, 'insufficient_evidence');
    assertLiteralEvidence(result, chunks);
  }
});
