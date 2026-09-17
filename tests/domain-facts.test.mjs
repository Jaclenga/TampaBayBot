import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFacts, factsForChunk, factAnnotationsMatch } from '../src/lib/domain/facts.mjs';
import { normalize, chunkUnits, sha256 } from '../src/lib/ingestion/normalize.mjs';
import { makeCorpus, validateCorpus } from '../src/lib/ingestion/generation.mjs';

const source = { source_id: 'example-program', topic_id: 'local-help', title: 'Example program', canonical_url: 'https://example.gov/program' };
const chunk = text => ({ id: 'example-evidence', source_id: source.source_id, text, content_hash: sha256(text) });

test('semantic facts retain exact evidence identity and distinguish benefits from household income', () => {
  const evidence = chunk('Applications are currently closed. Maximum assistance: $1,234.50. Income Limits 2025: $60,000. Assistance is for new move-in costs only. Existing leases are not eligible. Contact help@example.gov or (813) 555-1234.');
  const facts = deriveFacts(evidence, source);
  assert.deepEqual(facts.filter(fact => fact.factType === 'application_status').map(fact => fact.value), ['closed']);
  assert.deepEqual(facts.filter(fact => fact.factType === 'benefit_amount').map(fact => fact.value), ['$1,234.50']);
  assert.deepEqual(facts.filter(fact => fact.factType === 'effective_year').map(fact => fact.value), [2025]);
  assert.equal(facts.find(fact => fact.factType === 'income_limit').effectiveYear, 2025);
  assert.ok(facts.some(fact => fact.factType === 'assistance_restriction' && /move-in/.test(fact.quote)));
  assert.ok(facts.some(fact => fact.factType === 'eligibility' && /not eligible/.test(fact.quote)));
  assert.deepEqual(facts.filter(fact => fact.factType === 'contact').map(fact => fact.value), ['help@example.gov', '(813) 555-1234']);
  for (const fact of facts) {
    assert.equal(fact.programId, source.topic_id);
    assert.equal(fact.sourceId, source.source_id);
    assert.equal(fact.evidenceChunkId, evidence.id);
    assert.equal(fact.confidence, 'explicit');
    assert.ok(evidence.text.includes(fact.quote));
  }
});

test('projected, conditional and interrogative status wording cannot establish applications are open', () => {
  for (const text of [
    'We will be accepting new applications in summer 2027.',
    'If applications are open, complete the form.',
    'Applications are expected to open in 2027.',
    'Are applications open?',
    'It is not true that applications are open.',
    'Applications are open only if additional funding is approved.',
  ]) assert.ok(!deriveFacts(chunk(text), source).some(fact => fact.factType === 'application_status'), text);
  assert.equal(deriveFacts(chunk('The agency is currently accepting new applications.'), source)[0].value, 'open');
  assert.equal(deriveFacts(chunk('We are not currently accepting new applications and expect a summer reopening.'), source)[0].value, 'closed');
});

test('dates and income values are never invented from titles, source notes or ambiguous years', () => {
  const evidence = { ...chunk('Contact the agency for the household income limit.'), section: '2025 Income Limits' };
  assert.deepEqual(deriveFacts(evidence, { ...source, notes: 'Applications are closed. Income Limits 2025: $60,000.', retrieval_date: '2026-09-01' }), []);
  assert.ok(!deriveFacts(chunk('Income limits differ between 2025 and 2026.'), source).some(fact => fact.factType === 'effective_year'));
  assert.deepEqual(deriveFacts({ ...evidence, source_id: 'other-source' }, source), []);
});

test('demonstration descriptions are not program restrictions', () => {
  const evidence = chunk('Fictional rental assistance helps demo households with moving costs. This is an invented program used only to demonstrate cited answers; it is not a real government benefit.');
  assert.ok(!deriveFacts(evidence, source).some(fact => fact.factType === 'assistance_restriction'));
  assert.ok(deriveFacts(chunk('Assistance is available for new move-in costs only.'), source).some(fact => fact.factType === 'assistance_restriction'));
});

test('legacy and annotated evidence use identical derivation and forged literal-quote annotations fail validation', () => {
  const evidence = chunk('Applications are closed. Maximum assistance: $1,234.');
  const facts = deriveFacts(evidence, source);
  assert.deepEqual(factsForChunk(evidence, source), facts);
  assert.deepEqual(factsForChunk({ ...evidence, facts }, source), facts);
  assert.equal(factAnnotationsMatch({ ...evidence, facts }, source), true);
  for (const change of [{ value: 'open' }, { evidenceChunkId: 'elsewhere' }, { sourceId: 'other-source' }, { programId: 'invented-program' }, { quote: 'Applications are open.' }]) {
    const forged = { ...evidence, facts: [{ ...facts[0], ...change }, ...facts.slice(1)] };
    assert.deepEqual(factsForChunk(forged, source), facts, 'Runtime rechecks meaning, not just quotation bounds.');
    assert.equal(factAnnotationsMatch(forged, source), false);
    assert.throws(() => validateCorpus(makeCorpus([source], [forged])), /facts differ/);
  }
});

test('HTML, CSV and structured adapters generate repeatable facts with unchanged content and raw hashes', async () => {
  const records = [
    ['html', '<main><p>Applications are closed.</p><p>Income limits for 2025: $60,000.</p></main>'],
    ['csv', 'application_status,income_limit,effective_year\nclosed,60000,2025\n'],
    ['json', '{"application_status":"closed","income_limit":60000,"effective_year":2025}'],
    ['geojson', '{"type":"FeatureCollection","features":[{"properties":{"application_status":"closed","income_limit":60000,"effective_year":2025},"geometry":null}]}'],
  ];
  for (const [source_type, content] of records) {
    const definition = { ...source, source_type };
    const bytes = Buffer.from(content); const hash = sha256(bytes);
    const normalized = await normalize(bytes, definition);
    const first = chunkUnits(normalized, definition, '2026-01-01', hash);
    const second = chunkUnits(await normalize(bytes, definition), definition, '2026-01-01', hash);
    assert.deepEqual(first, second);
    assert.ok(first.flatMap(item => item.facts).some(fact => fact.factType === 'application_status' && fact.value === 'closed'), source_type);
    assert.ok(first.flatMap(item => item.facts).some(fact => fact.factType === 'effective_year' && fact.value === 2025), source_type);
    for (const item of first) {
      assert.equal(item.content_hash, sha256(item.text));
      assert.equal(item.raw_content_hash, hash);
      for (const fact of item.facts) assert.ok(item.text.includes(fact.quote));
    }
    validateCorpus(makeCorpus([definition], first));
  }
});

test('long source units attach facts only to the chunk that contains the literal statement', () => {
  const text = `${'Background guidance. '.repeat(100)}Applications are closed. ${'Additional guidance. '.repeat(100)}`;
  const chunks = chunkUnits({ units: [{ text, section: 'Long source' }] }, source, '2026-01-01', 'raw');
  assert.ok(chunks.length > 1);
  const statuses = chunks.flatMap(item => item.facts).filter(fact => fact.factType === 'application_status');
  assert.equal(statuses.length, 1);
  const evidence = chunks.find(item => item.id === statuses[0].evidenceChunkId);
  assert.ok(evidence.text.includes(statuses[0].quote));
});

test('continuation fragments cannot turn a preceding negation into an open application status', () => {
  const evidence = { ...chunk('Accepting applications. Maximum assistance: $2,000.'), locator: { text_start: 1400, text_end: 1460 } };
  const facts = deriveFacts(evidence, source);
  assert.ok(!facts.some(fact => fact.factType === 'application_status'));
  assert.equal(facts.find(fact => fact.factType === 'benefit_amount').value, '$2,000');
});

test('currency values cannot supply an effective year or obscure an explicit income table year', () => {
  for (const amount of ['$2000', '$ 2020', '2000 dollars', '$2025.50', '1999 dollars']) {
    const facts = deriveFacts(chunk(`Household income limit: ${amount}.`), source);
    assert.ok(facts.some(fact => fact.factType === 'income_limit'), amount);
    assert.ok(!facts.some(fact => fact.factType === 'effective_year' || fact.effectiveYear), amount);
    const dated = deriveFacts(chunk(`Income limits for 2026: ${amount}.`), source);
    assert.deepEqual(dated.filter(fact => fact.factType === 'effective_year').map(fact => fact.value), [2026]);
    assert.equal(dated.find(fact => fact.factType === 'income_limit').effectiveYear, 2026);
  }
});

test('dated income headings identify a year without inventing an income value or attaching adjacent rows', () => {
  const evidence = chunk('2025 income limits\nHousehold of two: $60,000.\n2026 income limits\nHousehold of two: $65,000.');
  const facts = deriveFacts(evidence, source);
  assert.deepEqual(facts.filter(fact => fact.factType === 'effective_year').map(fact => fact.value), [2025, 2026]);
  assert.ok(!facts.some(fact => fact.factType === 'income_limit'));
  for (const text of ['2026 income limits', 'Income limits for 2026.', 'Income limits differ between 2025 and 2026.']) {
    assert.ok(!deriveFacts(chunk(text), source).some(fact => fact.factType === 'income_limit'), text);
  }
  for (const text of ['2026 income limits: $65,000.', 'Income limits for 2026: 65000.', '2026 income limit: $2000.']) {
    const values = deriveFacts(chunk(text), source).filter(fact => fact.factType === 'income_limit');
    assert.equal(values.length, 1, text);
    assert.equal(values[0].effectiveYear, 2026);
    assert.equal(values[0].quote, text);
  }
});

test('dated income headings and household-size labels do not invent income limits from calendar or count numbers', () => {
  for (const date of ['4/28/2025', '04-28-2025', '2025-04-28', '2025/04/28', 'April 28, 2025', 'Apr. 28th 2025', '28 April 2025', 'April 28']) {
    const text = `Federal HUD and State Income Limits 2025 as of ${date}`;
    const facts = deriveFacts(chunk(text), source);
    assert.deepEqual(facts.filter(fact => fact.factType === 'effective_year').map(fact => fact.value), [2025], text);
    assert.ok(!facts.some(fact => fact.factType === 'income_limit'), text);
  }
  for (const label of ['household of 2', 'households of 2 to 4', 'household size: 2', 'household size of 2', 'family of 4', '2-person household', '2 people', '4 members', '2 households']) {
    const text = `2025 income limits for a ${label} as of 4/28/2025.`;
    const facts = deriveFacts(chunk(text), source);
    assert.deepEqual(facts.filter(fact => fact.factType === 'effective_year').map(fact => fact.value), [2025], text);
    assert.ok(!facts.some(fact => fact.factType === 'income_limit'), text);
  }
  for (const value of ['$2000', '2000 dollars', '65000', '65,000', '80% of area median income']) {
    const text = `Income limits for 2025 as of 4/28/2025 for a household of 2: ${value}.`;
    const facts = deriveFacts(chunk(text), source).filter(fact => fact.factType === 'income_limit');
    assert.equal(facts.length, 1, text);
    assert.equal(facts[0].effectiveYear, 2025);
    assert.equal(facts[0].quote, text);
  }
});

test('present closures survive ordinary advisory prefixes while hypothetical notices remain unclassified', () => {
  for (const text of [
    'Until further notice, applications are closed.',
    'Until further notice, we are not accepting applications.',
    'Applicants should be aware that applications are currently closed.',
    'Residents must be advised that applications are paused.',
  ]) {
    const facts = deriveFacts(chunk(text), source).filter(fact => fact.factType === 'application_status');
    assert.deepEqual(facts.map(fact => fact.value), ['closed'], text);
    assert.equal(facts[0].quote, text);
  }
  for (const text of [
    'If applicants should be aware that applications are closed, notify them.',
    'Until funding is approved, applications are open.',
    'It is not true that, until further notice, applications are closed.',
    'Applicants should be aware that applications are open only if funding is approved.',
  ]) assert.ok(!deriveFacts(chunk(text), source).some(fact => fact.factType === 'application_status'), text);
});

test('complete continuation sentences retain closure facts and boundary metadata can be checked against neighboring evidence', () => {
  const text = `${'Background. '.repeat(116)}Notes. Applications are currently closed. Contact the agency for future availability.`;
  const chunks = chunkUnits({ units: [{ text, section: 'Program rules' }] }, source, '2026-01-01', 'raw');
  const continuation = chunks.find(item => item.locator.text_start > 0);
  assert.ok(continuation.text.startsWith('Applications are currently closed.'));
  assert.equal(continuation.locator.starts_at_sentence_boundary, true);
  assert.deepEqual(continuation.facts.filter(fact => fact.factType === 'application_status').map(fact => fact.value), ['closed']);
  validateCorpus(makeCorpus([source], chunks));
  for (const item of chunks) {
    assert.equal(item.text, text.slice(item.locator.text_start, item.locator.text_end).trim());
    assert.equal(item.content_hash, sha256(item.text));
  }
  const forged = chunks.map(item => item === continuation
    ? { ...item, locator: { ...item.locator, starts_at_sentence_boundary: false }, facts: [] }
    : item);
  assert.throws(() => validateCorpus(makeCorpus([source], forged)), /Sentence boundary differs/);
});

test('recorded split-sentence boundaries preserve the protection against preceding negation', () => {
  const text = `${'Background. '.repeat(116)}Not Accepting applications. Maximum assistance: $2,000.`;
  const chunks = chunkUnits({ units: [{ text, section: 'Program rules' }] }, source, '2026-01-01', 'raw');
  const continuation = chunks.find(item => item.locator.text_start > 0);
  assert.ok(continuation.text.startsWith('Accepting applications.'));
  assert.equal(continuation.locator.starts_at_sentence_boundary, false);
  assert.ok(!continuation.facts.some(fact => fact.factType === 'application_status'));
  assert.equal(continuation.facts.find(fact => fact.factType === 'benefit_amount').value, '$2,000');
  validateCorpus(makeCorpus([source], chunks));
  const forged = chunks.map(item => item === continuation
    ? { ...item, locator: { ...item.locator, starts_at_sentence_boundary: true } }
    : item);
  assert.throws(() => validateCorpus(makeCorpus([source], forged)), /Sentence boundary differs/);
  // Absent boundary metadata remains conservative for old reviewed snapshots.
  const legacy = { ...continuation, locator: { ...continuation.locator } };
  delete legacy.locator.starts_at_sentence_boundary;
  assert.ok(!deriveFacts(legacy, source).some(fact => fact.factType === 'application_status'));
});

test('structured narrative fields extract explicit status while preserving literal serialized quotes and hashes', async () => {
  const description = 'Until further notice, applications are currently closed.\nThe agency calls this a "temporary pause".';
  const records = [
    ['json', JSON.stringify({ description })],
    ['json', JSON.stringify({ application_status: description })],
    ['csv', `description\n"${description.replaceAll('"', '""')}"\n`],
    ['geojson', JSON.stringify({ type: 'FeatureCollection', features: [{ properties: { description }, geometry: null }] })],
  ];
  for (const [source_type, content] of records) {
    const definition = { ...source, source_type }; const bytes = Buffer.from(content);
    const chunks = chunkUnits(await normalize(bytes, definition), definition, '2026-01-01', sha256(bytes));
    const statuses = chunks.flatMap(item => item.facts).filter(fact => fact.factType === 'application_status');
    assert.deepEqual(statuses.map(fact => fact.value), ['closed'], source_type);
    const evidence = chunks.find(item => item.id === statuses[0].evidenceChunkId);
    assert.equal(statuses[0].quote, evidence.text);
    assert.equal(evidence.content_hash, sha256(evidence.text));
    assert.equal(evidence.raw_content_hash, sha256(bytes));
    validateCorpus(makeCorpus([definition], chunks));
  }
  for (const description of ['If applications are open, complete the form.', 'It is not true that applications are closed.']) {
    assert.ok(!deriveFacts(chunk(JSON.stringify({ description })), source).some(fact => fact.factType === 'application_status'));
  }
});
