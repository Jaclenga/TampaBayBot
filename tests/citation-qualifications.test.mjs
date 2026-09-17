import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../src/lib/core/answer.mjs';
import { factsForChunk } from '../src/lib/domain/facts.mjs';
import { findApplicationConflicts, makeEvidence, withFactEvidence } from '../src/lib/citations/evidence.mjs';
import { answerWithGuardrails } from '../src/lib/guardrails/navigator.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';
import { sha256 } from '../src/lib/ingestion/normalize.mjs';

const now = new Date('2026-09-16T12:00:00Z');
const source = {
  source_id: 'harbor-help', title: 'Harbor Housing Support', agency: 'Synthetic Housing Office',
  canonical_url: 'https://example.gov/harbor', authoritative_status: 'first-party', categories: ['housing'],
  jurisdiction_ids: ['tampa'], entity_aliases: ['Harbor Housing Support'], retrieval_date: now.toISOString(), refresh_days: 30,
};
const chunk = (id, text) => ({ id, source_id: source.source_id, text, title: source.title,
  section: 'Program rules', retrieved_at: now.toISOString(), content_hash: sha256(text) });
const options = chunks => ({ sources: [source], chunks, now, jurisdictionId: 'tampa' });
const padding = 'Contact the office to learn about the program documentation. '.repeat(20);
const amountQuestion = 'What is the maximum assistance amount for Harbor Housing Support?';
const closure = 'Applications are currently closed.';
const restriction = 'Assistance is available for new move-in costs only.';
const amount = 'The maximum assistance amount for Harbor Housing Support is $5,000.';

function assertLiteral(result, chunks) {
  for (const item of result.evidence) {
    const original = chunks.find(candidate => candidate.id === item.chunk_id && candidate.source_id === item.source_id);
    assert.ok(original);
    assert.ok(original.text.includes(item.quote));
    assert.ok(item.quote.length <= 720);
    assert.equal(item.content_hash, original.content_hash);
  }
}

test('an amount and a distant closure in the same chunk retain separate required citations', () => {
  const full = chunk('full-program', `${closure} ${padding}${amount}`);
  const result = answerQuestion(amountQuestion, options([full]));
  assert.equal(result.status, 'answered');
  assert.match(result.answer, /Applications are currently closed/);
  assert.match(result.answer, /\$5,000/);
  const closed = result.evidence.find(item => item.quote.includes(closure));
  const benefit = result.evidence.find(item => item.quote.includes(amount));
  assert.ok(closed && benefit);
  assert.notEqual(closed.id, benefit.id);
  assert.equal(closed.chunk_id, benefit.chunk_id);
  for (const item of [closed, benefit]) assert.ok(result.requiredEvidenceIds.includes(item.id));
  assertLiteral(result, [full]);
});

test('separate application and restriction qualifications survive baseline and optional model selection', async () => {
  const full = chunk('three-facts', `${closure} ${padding}${restriction} ${padding}${amount}`);
  const baseline = answerQuestion(amountQuestion, options([full]));
  assert.equal(baseline.status, 'answered');
  for (const text of [closure, restriction, amount]) {
    assert.ok(baseline.answer.includes(text));
    const cited = baseline.evidence.find(item => item.quote.includes(text));
    assert.ok(cited && baseline.requiredEvidenceIds.includes(cited.id));
  }
  assert.equal(baseline.requiredEvidenceIds.length, 3);
  const config = parseLlmConfig({ LLM_PROVIDER: 'ollama', LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'fixture' });
  for (const omit of [closure, restriction, amount]) {
    const result = await answerWithGuardrails(amountQuestion, { ...options([full]), config, provider: {
      async complete({ messages }) {
        const supplied = JSON.parse(messages.find(message => message.role === 'user').content);
        return JSON.stringify({ selections: supplied.evidence.filter(item => !item.quote.includes(omit)).map(({ id, quote }) => ({ id, quote })) });
      },
    } });
    assert.equal(result.generation.status, 'fallback', omit);
    for (const text of [closure, restriction, amount]) assert.ok(result.answer.includes(text), text);
    assertLiteral(result, [full]);
  }
  const accepted = await answerWithGuardrails(amountQuestion, { ...options([full]), config, provider: {
    async complete({ messages }) {
      const supplied = JSON.parse(messages.find(message => message.role === 'user').content);
      return JSON.stringify({ selections: supplied.evidence.map(({ id, quote }) => ({ id, quote })) });
    },
  } });
  assert.equal(accepted.generation.status, 'used');
  for (const text of [closure, restriction, amount]) assert.ok(accepted.answer.includes(text), text);
});

test('application-status questions focus the actual statement inside a long program description', () => {
  const full = chunk('long-status', `Harbor Housing Support application status and housing support guidance. ${padding}${closure}`);
  const result = answerQuestion('Are applications open for Harbor Housing Support?', options([full]));
  assert.equal(result.status, 'answered');
  assert.ok(result.answer.includes(closure));
  assert.ok(result.evidence[0].quote.includes(closure));
  assert.ok(result.requiredEvidenceIds.includes(result.evidence[0].id));
  assertLiteral(result, [full]);
});

test('conflict citations quote opposing statements even in one shared chunk', () => {
  const overview = 'Harbor Housing Support helps residents pay rent and provides housing assistance for families. ';
  const open = 'Applications are currently open.';
  for (const chunks of [
    [chunk('closed', `${overview}${padding}${closure}`), chunk('open', `${overview}${padding}${open}`)],
    [chunk('both', `${overview}${padding}${closure} ${padding}${open}`)],
  ]) {
    const result = answerQuestion('Tell me about Harbor Housing Support housing assistance', options(chunks));
    assert.equal(result.status, 'conflicting_evidence');
    assert.equal(result.evidence.length, 2);
    assert.equal(result.evidence[0].quote, open);
    assert.equal(result.evidence[1].quote, closure);
    assertLiteral(result, chunks);
  }
});

test('explicit citation windows are honored for short text and invalid windows fail closed', () => {
  const short = chunk('short', `${closure} Contact the office for future announcements.`);
  const hit = { source, chunk: short };
  const focus = { start: 0, end: closure.length };
  assert.equal(makeEvidence({ ...hit, evidenceQuote: focus }, 'Contact details', 0, now).quote, closure);
  assert.equal(makeEvidence({ ...hit, programQuote: focus }, 'Contact details', 0, now).quote, closure);
  for (const evidenceQuote of [null, undefined, {}, { start: -1, end: 10 }, { start: 2, end: 1 },
    { start: 1.5, end: 10 }, { start: 0, end: short.text.length + 1 }]) {
    assert.equal(makeEvidence({ ...hit, evidenceQuote, programQuote: focus }, 'Contact details', 0, now), null);
  }
  const long = chunk('long', padding);
  assert.equal(makeEvidence({ source, chunk: long, evidenceQuote: { start: 0, end: 721 } }, 'Contact details', 0, now), null);
  const whitespace = chunk('blank-window', `${closure}   Contact us.`);
  assert.equal(makeEvidence({ source, chunk: whitespace, evidenceQuote: { start: closure.length, end: closure.length + 3 } }, 'Contact details', 0, now), null);
});

test('fact citation spans preserve literal provenance and reject mismatched facts', () => {
  const full = chunk('fact', `${padding}${closure}`);
  const fact = factsForChunk(full, source).find(item => item.factType === 'application_status');
  const hit = { source, chunk: full };
  const focused = withFactEvidence(hit, fact);
  assert.equal(full.text.slice(focused.evidenceQuote.start, focused.evidenceQuote.end), closure);
  assert.equal(makeEvidence(focused, 'Tell me about housing support', 0, now).quote, closure);
  for (const change of [{ sourceId: 'elsewhere' }, { evidenceChunkId: 'elsewhere' }, { quote: 'Invented statement.' }, { quote: '' }]) {
    assert.equal(withFactEvidence(hit, { ...fact, ...change }), null);
  }
});

test('an unquotable required qualification prevents an amount answer or optional model call', async () => {
  const longClosure = `The housing office provides ${'background information '.repeat(50)}and applications are currently closed.`;
  const longRestriction = `Assistance is available for new move-in costs only, including ${'qualifying moving expenses '.repeat(40)}listed in program rules.`;
  const records = [longClosure, longRestriction, JSON.stringify({ application_status: 'closed', description: padding })];
  const config = parseLlmConfig({ LLM_PROVIDER: 'ollama', LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'fixture' });
  for (const [index, text] of records.entries()) {
    const qualification = chunk(`unquotable-${index}`, text);
    assert.ok(factsForChunk(qualification, source).some(fact => fact.quote.length > 720 &&
      (fact.factType === 'application_status' || fact.factType === 'assistance_restriction')));
    const chunks = [chunk('amount', amount), qualification];
    let calls = 0;
    const result = await answerWithGuardrails(amountQuestion, { ...options(chunks), config, provider: {
      async complete() { calls++; throw new Error('An incomplete qualification must prevent model selection'); },
    } });
    assert.equal(result.status, 'insufficient_evidence', text);
    assert.equal(calls, 0);
    assert.notEqual(result.generation.status, 'used');
    assert.doesNotMatch(result.answer, /\$5,000/);
    assertLiteral(result, chunks);
  }
});

test('unquotable qualification metadata survives promotion of the current income table', () => {
  const qualification = chunk('unquotable-income-status', `The office provides ${'background information '.repeat(50)}and applications are currently closed.`);
  const chunks = [
    chunk('old-income', 'Harbor Housing Support income limits for 2025: $60,000 for a household of two.'),
    chunk('current-income', 'Harbor Housing Support income limits for 2026: $65,000 for a household of two.'),
    qualification,
  ];
  const result = answerQuestion('What are the current income limits for Harbor Housing Support?', options(chunks));
  assert.equal(result.status, 'insufficient_evidence');
  assert.doesNotMatch(result.answer, /\$65,000/);
  assertLiteral(result, chunks);
});

test('distinct restrictions across separate chunks are all required while identical statements are deduplicated', async () => {
  const secondRestriction = 'Existing leases are not eligible for assistance.';
  const chunks = [chunk('amount', amount), chunk('move-in', restriction), chunk('leases', secondRestriction), chunk('leases-copy', secondRestriction)];
  const baseline = answerQuestion(amountQuestion, options(chunks));
  assert.equal(baseline.status, 'answered');
  for (const text of [restriction, secondRestriction, amount]) {
    assert.ok(baseline.answer.includes(text), text);
    const cited = baseline.evidence.filter(item => item.quote.includes(text));
    assert.equal(cited.length, 1, text);
    assert.ok(baseline.requiredEvidenceIds.includes(cited[0].id));
  }
  assert.equal(baseline.requiredEvidenceIds.length, 3);
  const config = parseLlmConfig({ LLM_PROVIDER: 'ollama', LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'fixture' });
  const result = await answerWithGuardrails(amountQuestion, { ...options(chunks), config, provider: {
    async complete({ messages }) {
      const supplied = JSON.parse(messages.find(message => message.role === 'user').content);
      return JSON.stringify({ selections: supplied.evidence.filter(item => !item.quote.includes(secondRestriction)).map(({ id, quote }) => ({ id, quote })) });
    },
  } });
  assert.equal(result.generation.status, 'fallback');
  for (const text of [restriction, secondRestriction, amount]) assert.ok(result.answer.includes(text), text);
  assertLiteral(result, chunks);
});

test('a broad program overview cannot ignore an unquotable opposing application status', async () => {
  const open = chunk('open', 'Applications are currently open. Harbor Housing Support provides housing assistance.');
  const closed = chunk('closed', closure);
  const longOpen = chunk('long-open', `The housing office provides ${'background information '.repeat(50)}and applications are currently open.`);
  const longClosed = chunk('long-closed', `The housing office provides ${'background information '.repeat(50)}and applications are currently closed.`);
  const question = 'Tell me about Harbor Housing Support housing assistance';
  const config = parseLlmConfig({ LLM_PROVIDER: 'ollama', LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'fixture' });
  for (const chunks of [[open, longClosed], [longOpen, closed], [longOpen, longClosed]]) {
    const conflict = findApplicationConflicts([{ source, chunk: chunks[0] }], [source], chunks, now);
    assert.equal(conflict.unquotable, true);
    assert.ok(conflict.hits.every(hit => makeEvidence(hit, question, 0, now)));
    let calls = 0;
    const result = await answerWithGuardrails(question, { ...options(chunks), config, provider: {
      async complete() { calls++; throw new Error('Incomplete conflict evidence must prevent model selection'); },
    } });
    assert.equal(result.status, 'insufficient_evidence');
    assert.equal(calls, 0);
    assertLiteral(result, chunks);
  }
  // A later complete quotation can establish the same status without losing
  // the contradiction merely because its first supporting statement was long.
  const complete = answerQuestion(question, options([open, longClosed, closed]));
  assert.equal(complete.status, 'conflicting_evidence');
  assert.equal(complete.evidence.length, 2);
  assert.equal(complete.evidence[1].quote, closure);
  assertLiteral(complete, [open, longClosed, closed]);
});
