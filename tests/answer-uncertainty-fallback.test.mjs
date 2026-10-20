import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { answerQuestion } from '../src/lib/core/answer.mjs';
import { finishResponse } from '../src/lib/core/answer/response.mjs';

const now = '2026-09-16T12:00:00.000Z';
const official = (id, jurisdiction_ids = ['tampa']) => ({
  source_id: id, title: 'Official housing assistance directory', agency: 'Synthetic city housing office',
  canonical_url: `https://city.example.gov/${id}`, authoritative_status: 'first-party',
  categories: ['housing', 'navigation'], jurisdiction_ids, refresh_days: 30,
  next_step: { label: 'Check the official housing directory', url: `https://city.example.gov/${id}` },
});
const secondary = {
  source_id: 'secondary-guide', title: 'Community housing guide', agency: 'Synthetic community group',
  canonical_url: 'https://community.example.org/housing', authoritative_status: 'secondary',
  categories: ['housing', 'navigation'], jurisdiction_ids: ['tampa'], refresh_days: 30,
};
const passage = (text, retrieved_at = now) => ({
  id: 'secondary-passage', source_id: secondary.source_id, text, retrieved_at,
  content_hash: createHash('sha256').update(text).digest('hex'),
});
const answer = (question, sources, chunks) => answerQuestion(question, {
  sources, chunks, jurisdictionId: 'tampa', now,
});

test('stale secondary evidence retains a scoped official verification link', () => {
  const local = official('local-help');
  const foreign = official('foreign-help', ['clearwater']);
  const result = answer('Where can I find rental assistance?', [secondary, foreign, local], [
    passage('The community housing guide lists rental assistance and advises residents to check program availability with the provider.', '2020-01-01T00:00:00Z'),
  ]);
  assert.equal(result.status, 'potentially_outdated');
  assert.match(result.answer, /cannot confirm/);
  assert.ok(result.evidence.every(item => item.source_id === secondary.source_id));
  assert.deepEqual(result.nextSteps, [{ ...local.next_step, agency: local.agency }]);
});

test('insufficient secondary evidence offers only registered official links', () => {
  const local = official('local-help');
  const result = answer('How much rental assistance is available?', [secondary, local], [
    passage('The community housing guide lists rental assistance and advises residents to ask the program provider about available benefits.'),
  ]);
  assert.equal(result.status, 'insufficient_evidence');
  assert.match(result.answer, /do not establish every amount/);
  assert.deepEqual(result.nextSteps, [{ ...local.next_step, agency: local.agency }]);
  const withoutOfficial = answer('How much rental assistance is available?', [secondary], [
    passage('The community housing guide lists rental assistance and advises residents to ask the program provider about available benefits.'),
  ]);
  assert.deepEqual(withoutOfficial.nextSteps, []);
});

test('missing evidence preserves uncertainty and an in-scope official fallback', () => {
  const local = official('local-help');
  const foreign = official('foreign-help', ['clearwater']);
  const result = answer('Where can I find housing assistance?', [foreign, local], []);
  assert.equal(result.status, 'unavailable_source');
  assert.deepEqual(result.evidence, []);
  assert.match(result.answer, /do not have usable source text/);
  assert.deepEqual(result.nextSteps, [{ ...local.next_step, agency: local.agency }]);
});

test('conflicting official status statements keep both source paths and state the unknown', () => {
  const open = { ...official('open-notice'), topic_id: 'same-housing-program' };
  const closed = { ...official('closed-notice'), topic_id: 'same-housing-program' };
  const openText = 'Housing assistance applications are currently open. Contact the housing office for current instructions.';
  const closedText = 'Housing assistance applications are currently closed. Contact the housing office for current instructions.';
  const chunks = [
    { id: 'open', source_id: open.source_id, text: openText, retrieved_at: now, content_hash: createHash('sha256').update(openText).digest('hex') },
    { id: 'closed', source_id: closed.source_id, text: closedText, retrieved_at: now, content_hash: createHash('sha256').update(closedText).digest('hex') },
  ];
  const result = answer('Are housing assistance applications open?', [open, closed], chunks);
  assert.equal(result.status, 'conflicting_evidence');
  assert.match(result.answer, /cannot resolve that conflict/);
  assert.deepEqual(new Set(result.evidence.map(item => item.source_id)), new Set([open.source_id, closed.source_id]));
  assert.deepEqual(new Set(result.nextSteps.map(item => item.url)), new Set([open.next_step.url, closed.next_step.url]));
});

test('vague navigation discards citation requirements when it discards evidence', () => {
  const answer = {
    evidence: [{ id: 'E1', title: 'Synthetic source', stale: false }],
    requiredEvidenceIds: ['E1'], nextSteps: [{ label: 'Synthetic link', url: 'https://city.example.gov/help' }],
    coverage: { citedSourceCount: 1 },
  };
  const plan = {
    query: 'Who can I contact?', subjectCategory: 'navigation', requestedFacts: [],
    route: { normalized: 'who can i contact', subjectCategory: 'navigation', officialJudgment: false, needsAddress: false, needsJurisdiction: false },
  };
  const result = finishResponse(answer, { plan, selected: [], chunks: [], date: new Date(now), unsupported: null, conflict: null });
  assert.equal(result.status, 'insufficient_evidence');
  assert.deepEqual(result.evidence, []);
  assert.equal(result.requiredEvidenceIds, undefined);
  assert.deepEqual(result.nextSteps, []);
});
