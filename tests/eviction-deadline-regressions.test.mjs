import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryPlan } from '../src/lib/core/query-plan.mjs';
import { answerQuestion } from '../src/lib/core/answer.mjs';

const now = new Date('2026-10-09T12:00:00.000Z');
const source = {
  source_id: 'synthetic-court', title: 'Synthetic eviction court process',
  agency: 'Synthetic court information desk', canonical_url: 'https://fixture.invalid/court',
  authoritative_status: 'first-party', categories: ['housing'],
  jurisdiction_ids: ['hillsborough-county'], retrieval_date: now.toISOString(),
  refresh_days: 30,
};
const chunk = {
  id: 'court-process', source_id: source.source_id,
  text: 'Read the actual court papers to find response instructions and dates. Contact the court clerk to confirm process details; the clerk cannot give legal advice.',
  url: source.canonical_url, retrieved_at: now.toISOString(),
};
const options = { sources: [source], chunks: [chunk], jurisdictionId: 'hillsborough-county', now };

test('eviction response-window questions request a deadline fact', () => {
  for (const question of [
    'My landlord gave me a notice. How many days do I have to respond to a court summons in Hillsborough County?',
    'An eviction notice means I have exactly 30 days to respond in Hillsborough County, right?',
    'What is the deadline to respond to eviction court papers in Hillsborough County?',
  ]) assert.ok(createQueryPlan(question, options).requestedFacts.includes('deadline'), question);
  assert.ok(!createQueryPlan('Where can I find eviction court forms in Hillsborough County?', options).requestedFacts.includes('deadline'));
});

test('a general court process passage cannot establish a numeric response window', () => {
  for (const question of [
    'How many days do I have to respond to an eviction summons in Hillsborough County?',
    'An eviction notice means I have exactly 30 days to respond in Hillsborough County, right?',
  ]) {
    const answer = answerQuestion(question, options);
    assert.equal(answer.status, 'insufficient_evidence', question);
    assert.doesNotMatch(answer.answer, /\b(?:30|five|7)\s+days?\b/i, question);
    assert.ok(answer.nextSteps.length > 0, question);
  }
});
