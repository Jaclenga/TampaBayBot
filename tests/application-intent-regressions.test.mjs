import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryPlan } from '../src/lib/core/query-plan.mjs';
import { answerQuestion } from '../src/lib/core/answer.mjs';

const now = new Date('2026-09-16T12:00:00Z');
const source = {
  source_id: 'harbor-support', title: 'Harbor Housing Assistance Program',
  canonical_url: 'https://example.invalid/harbor', agency: 'Fictional housing agency',
  categories: ['housing'], jurisdiction_ids: ['tampa'], authoritative_status: 'first-party',
  retrieval_date: now.toISOString(), refresh_days: 30,
};
const methodText = 'Applications must be submitted through the online portal only; in-person applications will not be accepted.';
const chunk = (id, text) => ({ id, source_id: source.source_id, section: 'Application instructions', text, retrieved_at: now.toISOString() });
const options = { sources: [source], chunks: [chunk('method', methodText)], jurisdictionId: 'tampa', now };
const statusRequested = question => createQueryPlan(question, options).requestedFacts.includes('application_status');

function assertLiteralEvidence(answer, chunks) {
  for (const item of answer.evidence) {
    const original = chunks.find(chunk => chunk.id === item.chunk_id && chunk.source_id === item.source_id);
    assert.ok(original?.text.includes(item.quote));
  }
  for (const [, id] of answer.answer.matchAll(/\[(E\d+)\]/g)) assert.ok(answer.evidence.some(item => item.id === id));
}

test('application methods do not require unsupported open-or-closed claims', () => {
  for (const question of [
    'Can I apply for rental assistance in person?',
    'Can I apply for housing assistance in-person?',
    'Can I apply for rental assistance online?',
    'Can I apply for rental assistance by mail?',
    'Can I apply for rental assistance by email?',
    'Can I apply for rental assistance by phone?',
    'Can I apply for rental assistance over the phone?',
    'Can I apply for rental assistance through the portal?',
    'Can I apply for rental assistance on the website?',
    'Can I apply for rental assistance at the office?',
    'Where can I apply for rental assistance?',
    'How can I apply for rental assistance?',
  ]) assert.equal(statusRequested(question), false, question);

  const answer = answerQuestion('Can I apply for rental assistance in person?', options);
  assert.equal(answer.status, 'answered');
  assert.ok(answer.answer.includes(methodText));
  assert.doesNotMatch(answer.answer, /applications are open/i);
  assertLiteralEvidence(answer, options.chunks);
});

test('opening the application portal or form is not an intake-status request', () => {
  for (const question of [
    'How do I open the housing application portal?',
    'How can I open an application form for housing assistance?',
    'Can I open the online portal to apply for housing assistance?',
    'How do I open the housing application today?',
  ]) assert.equal(statusRequested(question), false, question);
});

test('explicit availability is still required for method-and-status requests', () => {
  for (const question of [
    'Can I apply now for housing assistance?',
    'Can I apply for housing assistance?',
    'Is housing assistance accepting applications?',
    'Is housing assistance accepting applications online?',
    'Are housing assistance applications open?',
    'Is the housing assistance program closed?',
    'When will housing assistance reopen?',
    'Can I apply for housing assistance online now?',
    'Can I apply for housing assistance by mail today?',
    'Can I currently apply for housing assistance in person?',
    'When can I apply for housing assistance online?',
    'Can I apply for housing assistance online, and are applications open?',
    'Can I apply for housing assistance online, and is the program accepting applications?',
    'How do I open the portal, and are housing assistance applications closed?',
  ]) {
    assert.equal(statusRequested(question), true, question);
    const answer = answerQuestion(question, options);
    assert.equal(answer.status, 'insufficient_evidence', question);
    assert.match(answer.answer, /do not confirm whether applications are open or closed/);
    assertLiteralEvidence(answer, options.chunks);
  }
});

test('a combined method-and-status question preserves the literal closure when one is available', () => {
  const closure = 'Applications are currently closed.';
  const chunks = [chunk('method-and-status', `${methodText} ${closure}`)];
  const question = 'Can I apply for rental assistance online now?';
  const answer = answerQuestion(question, { ...options, chunks });
  assert.equal(answer.status, 'answered');
  assert.ok(answer.answer.includes(methodText));
  assert.ok(answer.answer.includes(closure));
  assertLiteralEvidence(answer, chunks);
});

test('Spanish method qualifiers survive intent normalization while ahora still requests status', () => {
  for (const question of [
    '¿Puedo solicitar ayuda para el alquiler en persona?',
    '¿Puedo solicitar ayuda para el alquiler en línea?',
    '¿Puedo solicitar ayuda para el alquiler por correo?',
    '¿Dónde puedo solicitar ayuda para el alquiler?',
  ]) assert.equal(statusRequested(question), false, question);
  const question = '¿Puedo solicitar ayuda para el alquiler en persona ahora?';
  assert.equal(statusRequested(question), true);
  assert.equal(answerQuestion(question, options).status, 'insufficient_evidence');
});

test('discovering an alternative program does not require an unrequested intake-status claim', () => {
  const program = { ...source, source_id: 'juniper-energy', title: 'Juniper Home Energy Assistance Program (JHEAP)' };
  const text = 'The Elm Emergency Energy Assistance Program is transitioning. Residents can apply for the Juniper Home Energy Assistance Program (JHEAP) crisis assistance online. Contact the agency for application instructions.';
  const chunks = [{ ...chunk('alternative-program', text), source_id: program.source_id }];
  const alternativeOptions = { ...options, sources: [program], chunks };
  for (const question of [
    'I need emergency help with a past-due electric bill. The Elm Emergency Energy Assistance Program is transitioning; what assistance program can I apply to instead?',
    'Which program can I apply to instead for help paying electric bills?',
    'What program can I apply for to get help paying electric bills?',
    'Which housing assistance programs can I apply for?',
  ]) {
    assert.equal(createQueryPlan(question, alternativeOptions).requestedFacts.includes('application_status'), false, question);
    const answer = answerQuestion(question, alternativeOptions);
    assert.equal(answer.status, 'answered', question);
    assert.match(answer.answer, /Juniper Home Energy Assistance Program/);
    assert.doesNotMatch(answer.answer, /applications are open/i);
    assertLiteralEvidence(answer, chunks);
  }
  for (const question of [
    'Which housing assistance program can I apply to now instead?',
    'What program can I apply for today for help paying electric bills?',
    'Which housing assistance program can I apply for, and are applications open?',
  ]) {
    assert.equal(createQueryPlan(question, alternativeOptions).requestedFacts.includes('application_status'), true, question);
    const answer = answerQuestion(question, alternativeOptions);
    assert.equal(answer.status, 'insufficient_evidence', question);
    assertLiteralEvidence(answer, chunks);
  }
  assert.equal(statusRequested('Can I apply for housing assistance?'), true);
});
