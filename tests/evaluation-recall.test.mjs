import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  evaluateProgramRecall,
  recallMarkdown,
  scoreProgramRecall,
  validateRecallBenchmark,
} from '../evaluation/recall.mjs';
import { main as runRecallCommand, parseRecallArguments } from '../scripts/eval-recall.mjs';

const REFERENCE_DATE = '2026-09-13T12:00:00.000Z';
const digest = text => createHash('sha256').update(text).digest('hex');

/** Original fictional programs; no downloaded corpus or resident data. */
function fixture() {
  const source = {
    source_id: 'fixture-directory', title: 'Fictional resource directory',
    agency: 'Fictional demonstration office', canonical_url: 'https://example.invalid/assistance',
    authoritative_status: 'first-party', source_type: 'html', categories: ['housing'],
    jurisdiction_ids: ['tampa'], retrieval_date: REFERENCE_DATE, refresh_days: 30,
    keywords: [], status: 'available',
  };
  const texts = [
    'Fictional Alpha provides rental assistance for a deposit when an invented household moves.',
    'Fictional Beta provides rental assistance for a deposit under a different invented mechanism.',
    'This fictional directory introduction gives rental assistance contact details without describing a benefit.',
  ];
  const chunks = texts.map((text, index) => ({
    id: `fixture-passage-${index + 1}`, source_id: source.source_id, text,
    content_hash: digest(text), retrieved_at: REFERENCE_DATE,
    url: source.canonical_url, section: 'Original fictional example',
  }));
  const programs = chunks.slice(0, 2).map((chunk, index) => ({
    program_id: `fictional-${index === 0 ? 'alpha' : 'beta'}`,
    title: `Fictional ${index === 0 ? 'Alpha' : 'Beta'}`,
    evidence: [{ source_id: source.source_id, chunk_id: chunk.id, text_sha256: digest(chunk.text) }],
  }));
  const benchmark = {
    schema_version: 1, reference_date: REFERENCE_DATE,
    scope: 'Two original fictional deposit mechanisms in one directory.',
    label_policy: 'Both mechanisms warrant checking for this fictional moving question.',
    programs,
    cases: [{
      id: 'fictional-move', question: 'I need rental assistance for a deposit in Tampa.',
      jurisdiction_id: 'tampa', language: 'en',
      expected_program_ids: programs.map(program => program.program_id),
      rationale: 'The stated moving need makes both fictional deposit mechanisms relevant.',
      tags: ['moving'],
    }],
  };
  return { sources: [source], chunks, benchmark };
}

function evidence(chunk, index = 0) {
  return {
    id: `E${index + 1}`, source_id: chunk.source_id, chunk_id: chunk.id,
    quote: chunk.text, content_hash: chunk.content_hash,
  };
}

const answerWith = entries => async () => ({ status: 'answered', evidence: entries });
const caseScore = (report, stage = 'answer_evidence', id = 'fictional-move') =>
  report.cases.find(row => row.id === id).stages[stage];

test('program recall deduplicates identities and counts every expected program', () => {
  assert.deepEqual(scoreProgramRecall(['alpha', 'alpha', 'beta'], ['alpha', 'alpha', 'unrelated']), {
    expected: ['alpha', 'beta'], retrieved: ['alpha', 'unrelated'],
    matched: ['alpha'], missed: ['beta'], recall: 0.5,
  });
  assert.equal(scoreProgramRecall([], ['unrelated']).recall, null);
  assert.equal(scoreProgramRecall(['alpha'], []).recall, 0);
});

test('two programs on one page require distinct supporting passages', async () => {
  const value = fixture();
  const report = await evaluateProgramRecall({ ...value, answer: answerWith(value.chunks.slice(0, 2).map(evidence)) });
  assert.deepEqual(caseScore(report).matched, ['fictional-alpha', 'fictional-beta']);
  assert.equal(caseScore(report).recall, 1);
  assert.equal(caseScore(report, 'retrieval_all').recall, 1);
  const partial = await evaluateProgramRecall({ ...value, answer: answerWith([evidence(value.chunks[0])]) });
  assert.equal(caseScore(partial).recall, 0.5);
  assert.deepEqual(caseScore(partial).missed, ['fictional-beta']);
});

test('an unrelated passage from the correct source earns no program credit', async () => {
  const value = fixture();
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([evidence(value.chunks[2])]) });
  assert.equal(caseScore(report).recall, 0);
  assert.deepEqual(caseScore(report).missed, ['fictional-alpha', 'fictional-beta']);
  assert.ok(report.cases[0].omissions.every(item => item.reason === 'answer_selection_loss'));
});

test('removing corpus support retains the original applicability denominator', async () => {
  const value = fixture();
  value.chunks = value.chunks.filter(chunk => chunk.id !== 'fixture-passage-2');
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([evidence(value.chunks[0])]) });
  assert.equal(caseScore(report, 'retrieval_all').expected.length, 2);
  assert.equal(caseScore(report, 'retrieval_all').recall, 0.5);
  assert.equal(caseScore(report).recall, 0.5);
  assert.equal(report.cases[0].omissions.find(item => item.program_id === 'fictional-beta').reason, 'corpus_evidence_missing');
});

test('the answer receives normal runtime inputs without applicability labels', async () => {
  const value = fixture();
  let calls = 0;
  await evaluateProgramRecall({ ...value, answer: async (question, options) => {
    calls++;
    assert.equal(question, value.benchmark.cases[0].question);
    assert.equal(options.jurisdictionId, 'tampa');
    assert.equal(new Date(options.now).toISOString(), REFERENCE_DATE);
    assert.ok(Object.keys(options).every(key => ['sources', 'chunks', 'now', 'jurisdictionId', 'config'].includes(key)));
    assert.equal(JSON.stringify(options).includes('expected_program_ids'), false);
    assert.equal(JSON.stringify(options).includes('label_policy'), false);
    return { status: 'answered', evidence: [evidence(value.chunks[0])] };
  } });
  assert.equal(calls, 1);
});

test('filtered or unmatched retrieval is distinct from answer selection loss', async () => {
  const value = fixture();
  value.sources[0].categories = ['permitting'];
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([]) });
  assert.equal(caseScore(report, 'retrieval_all').recall, 0);
  assert.ok(report.cases[0].omissions.every(item => item.reason === 'retrieval_filtered_or_unmatched'));
});

test('an answer can rescue a support passage outside raw retrieval', async () => {
  const value = fixture();
  value.sources[0].categories = ['permitting'];
  const report = await evaluateProgramRecall({ ...value, answer: answerWith(value.chunks.slice(0, 2).map(evidence)) });
  assert.equal(caseScore(report, 'retrieval_at_15').recall, 0);
  assert.equal(caseScore(report).recall, 1);
  assert.deepEqual(report.cases[0].recoveredByAnswer, ['fictional-alpha', 'fictional-beta']);
  assert.deepEqual(report.cases[0].omissions, []);
});

test('a relevant passage below the production chunk cutoff is attributed separately', async () => {
  const value = fixture();
  value.benchmark.programs = value.benchmark.programs.slice(0, 1);
  value.benchmark.cases[0].expected_program_ids = ['fictional-alpha'];
  value.benchmark.cases[0].question = 'Rental assistance housing deposit in Tampa';
  const targetText = 'An invented office may provide a deposit for a qualifying fictional household under these demonstration rules.';
  const target = { ...value.chunks[0], text: targetText, content_hash: digest(targetText) };
  value.benchmark.programs[0].evidence[0].text_sha256 = digest(targetText);
  const distractors = Array.from({ length: 20 }, (_, index) => {
    const text = `Rental assistance housing deposit rental assistance housing deposit. Fictional directory introduction number ${index} lists navigation contacts only.`;
    return { ...value.chunks[2], id: `distractor-${index}`, text, content_hash: digest(text) };
  });
  value.chunks = [...distractors, target];
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([]) });
  assert.equal(caseScore(report, 'retrieval_all').recall, 1);
  assert.equal(caseScore(report, 'retrieval_at_15').recall, 0);
  assert.equal(report.cases[0].omissions[0].reason, 'below_retrieval_cutoff');
});

test('a truncated quote must include the program recognition span', async () => {
  const value = fixture();
  const chunk = value.chunks[0];
  const span = 'Fictional Alpha provides rental assistance for a deposit';
  const unrelated = 'This introduction describes general fictional office procedures and opening hours.';
  chunk.text = `${unrelated} ${chunk.text}`;
  chunk.content_hash = digest(chunk.text);
  const support = value.benchmark.programs[0].evidence[0];
  support.text_sha256 = chunk.content_hash;
  support.recognition_span = {
    start: chunk.text.indexOf(span), end: chunk.text.indexOf(span) + span.length,
    text_sha256: digest(span),
  };
  const wrong = await evaluateProgramRecall({ ...value, answer: answerWith([{ ...evidence(chunk), quote: unrelated }]) });
  assert.equal(caseScore(wrong).matched.includes('fictional-alpha'), false);
  const right = await evaluateProgramRecall({ ...value, answer: answerWith([{ ...evidence(chunk), quote: span }]) });
  assert.equal(caseScore(right).matched.includes('fictional-alpha'), true);
  const fabricated = await evaluateProgramRecall({ ...value, answer: answerWith([{ ...evidence(chunk), quote: `${span} and invented guaranteed approval.` }]) });
  assert.equal(caseScore(fabricated).matched.includes('fictional-alpha'), false);
});

test('empty applicability controls have null recall and cannot inflate aggregates', async () => {
  const value = fixture();
  value.benchmark.cases.push({
    ...value.benchmark.cases[0], id: 'fictional-no-benefit',
    question: 'Where is a fictional permitting office in Tampa?', expected_program_ids: [],
    rationale: 'No listed fictional housing program addresses this permit request.', tags: ['control'],
    expected_status: 'insufficient_evidence',
  });
  const report = await evaluateProgramRecall({ ...value, answer: async () => ({ status: 'insufficient_evidence', evidence: [] }) });
  assert.equal(caseScore(report, 'answer_evidence', 'fictional-no-benefit').recall, null);
  assert.equal(report.stages.answer_evidence.applicableCases, 1);
  assert.equal(report.stages.answer_evidence.expected, 2);
  assert.equal(report.stages.answer_evidence.microRecall, 0);
  assert.equal(report.stages.answer_evidence.macroRecall, 0);
});

test('micro recall weights programs while macro recall weights applicable cases', async () => {
  const value = fixture();
  value.sources[0].jurisdiction_ids.push('clearwater');
  value.benchmark.cases.push({
    ...value.benchmark.cases[0], id: 'fictional-alpha-only',
    question: 'Necesito ayuda con el deposito de alquiler de Fictional Alpha en Clearwater.',
    language: 'es', jurisdiction_id: 'clearwater',
    expected_program_ids: ['fictional-alpha'],
    rationale: 'This second authored profile warrants only the fictional Alpha mechanism.',
  });
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([evidence(value.chunks[0])]) });
  const aggregate = report.stages.answer_evidence;
  assert.equal(aggregate.expected, 3);
  assert.equal(aggregate.matched, 2);
  assert.ok(Math.abs(aggregate.microRecall - 2 / 3) < 0.00001);
  assert.equal(aggregate.macroRecall, 0.75);
  assert.equal(aggregate.completeCases, 1);
  assert.equal(aggregate.applicableCases, 2);
  assert.equal(report.byLanguage.en.answer_evidence.microRecall, 0.5);
  assert.equal(report.byLanguage.es.answer_evidence.microRecall, 1);
  assert.equal(report.byJurisdiction.tampa.answer_evidence.expected, 2);
  assert.equal(report.byJurisdiction.clearwater.answer_evidence.expected, 1);
  assert.equal(report.byProgram['fictional-alpha'].answer_evidence.expected, 2);
  assert.equal(report.byProgram['fictional-alpha'].answer_evidence.microRecall, 1);
  assert.equal(report.byProgram['fictional-beta'].answer_evidence.expected, 1);
  assert.equal(report.byProgram['fictional-beta'].answer_evidence.microRecall, 0);
});

test('answer failures remain explicit omissions without losing retrieval measurements', async () => {
  const report = await evaluateProgramRecall({ ...fixture(), answer: async () => { throw new Error('Fictional adapter failure'); } });
  assert.equal(report.status, 'execution_failed');
  assert.equal(report.summary.executionFailures, 1);
  assert.equal(caseScore(report, 'retrieval_all').recall, 1);
  assert.equal(caseScore(report).recall, 0);
  assert.ok(report.cases[0].omissions.every(item => item.reason === 'answer_execution_failed'));
});

test('malformed answer evidence is recorded as an execution failure', async () => {
  const report = await evaluateProgramRecall({ ...fixture(), answer: answerWith([null]) });
  assert.equal(report.status, 'execution_failed');
  assert.equal(report.summary.executionFailures, 1);
  assert.equal(caseScore(report).recall, 0);
});

test('an empty source distribution cannot be reported as a measured benchmark', async () => {
  const value = fixture();
  value.chunks = [];
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([]) });
  assert.equal(report.status, 'not_evaluable');
  assert.equal(report.stages.retrieval_all.expected, 2);
  assert.equal(report.stages.retrieval_all.matched, 0);
  assert.ok(report.cases[0].omissions.every(item => item.reason === 'corpus_evidence_missing'));
});

test('an empty control fails if the answer surfaces a known inapplicable program', async () => {
  const value = fixture();
  value.benchmark.cases.push({
    ...value.benchmark.cases[0], id: 'fictional-no-benefit',
    question: 'Where is a fictional permitting office in Tampa?', expected_program_ids: [],
    rationale: 'No listed fictional housing program addresses this permit request.',
    tags: ['control'], expected_status: 'answered',
  });
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([evidence(value.chunks[0])]) });
  const control = report.cases.find(row => row.id === 'fictional-no-benefit');
  assert.equal(control.controlPassed, false);
  assert.deepEqual(control.unanticipatedProgramIds, ['fictional-alpha']);
  assert.equal(control.stages.answer_evidence.recall, null);
  assert.equal(report.summary.controlsPassed, 0);
});

test('an exclusion control may reference its explicitly allowed program when status matches', async () => {
  const value = fixture();
  value.benchmark.cases.push({
    ...value.benchmark.cases[0], id: 'fictional-exclusion',
    question: 'Can you officially approve my eligibility for Fictional Alpha rental help in Tampa?',
    expected_program_ids: [], allowed_reference_program_ids: ['fictional-alpha'],
    rationale: 'The answer may reference Alpha while declining an official eligibility decision.',
    tags: ['control'], expected_status: 'official_judgment',
  });
  const run = (entries, status = 'official_judgment') => evaluateProgramRecall({
    ...value, answer: async () => ({ status, evidence: entries }),
  });
  const allowed = await run([evidence(value.chunks[0])]);
  const control = allowed.cases.find(row => row.id === 'fictional-exclusion');
  assert.equal(control.controlPassed, true);
  assert.equal(control.stages.answer_evidence.recall, null);
  assert.deepEqual(control.unanticipatedProgramIds, ['fictional-alpha']);
  assert.equal(allowed.summary.controlsPassed, 1);
  const wrongStatus = await run([evidence(value.chunks[0])], 'answered');
  assert.equal(wrongStatus.cases.find(row => row.id === 'fictional-exclusion').controlPassed, false);
  const unlisted = await run(value.chunks.slice(0, 2).map(evidence));
  assert.equal(unlisted.cases.find(row => row.id === 'fictional-exclusion').controlPassed, false);
});

test('the recall CLI parses explicit corpus, benchmark, output and strict settings', () => {
  assert.deepEqual(parseRecallArguments([]), {
    corpusRoot: '.', benchmark: 'evaluation/datasets/program-recall-benchmark.json', output: 'work/evals/recall', strict: false,
  });
  assert.deepEqual(parseRecallArguments([
    '--corpus-root', 'work/reviewed-corpus', '--benchmark', 'evaluation/fictional.json',
    '--output', 'work/evals/fictional-recall', '--strict',
  ]), {
    corpusRoot: 'work/reviewed-corpus', benchmark: 'evaluation/fictional.json',
    output: 'work/evals/fictional-recall', strict: true,
  });
  assert.equal(parseRecallArguments(['--help']).help, true);
});

test('the recall CLI rejects unknown, duplicate and missing-value options', () => {
  for (const args of [
    ['--unknown'], ['unexpected-positional-value'], ['--output'], ['--benchmark', '--strict'],
    ['--corpus-root', ''], ['--strict', '--strict'], ['--help', '--help'],
    ['--output', 'work/first', '--output', 'work/second'],
  ]) assert.throws(() => parseRecallArguments(args), `Expected rejection of ${JSON.stringify(args)}`);
});

test('the recall command refuses output destinations outside a work subdirectory', async () => {
  for (const output of ['data', 'evaluation', 'work', '../outside-checkout', 'work/../data']) {
    await assert.rejects(runRecallCommand(['--output', output]), `Expected rejection of ${output}`);
  }
});

test('the Markdown report shows recall numerators, denominators and omitted programs', async () => {
  const value = fixture();
  const report = await evaluateProgramRecall({ ...value, answer: answerWith([evidence(value.chunks[0])]) });
  const markdown = recallMarkdown(report);
  assert.match(markdown, /\| answer_evidence \| 1 \/ 2 \| 50\.0% \| 50\.0% \| 0 \/ 1 \|/);
  assert.match(markdown, /\| retrieval_all \| 2 \/ 2 \| 100\.0% \| 100\.0% \| 1 \/ 1 \|/);
  assert.match(markdown, /\| fictional-move \| Fictional Beta \| \d+ \| answer_selection_loss \|/);
  assert.match(markdown, /\n\n\| Stage \|/);
  assert.doesNotMatch(markdown, /NaN|undefined|\[object Object\]/);
  assert.ok(!markdown.includes(value.chunks[0].text), 'Report must not copy retained evidence text.');
});

test('oracle validation rejects changed support, unknown program IDs and invalid spans', () => {
  const value = fixture();
  assert.doesNotThrow(() => validateRecallBenchmark(value.benchmark, value));
  const changed = structuredClone(value);
  changed.chunks[0].text += ' Changed source text.';
  assert.throws(() => validateRecallBenchmark(changed.benchmark, changed));
  const unknown = structuredClone(value);
  unknown.benchmark.cases[0].expected_program_ids.push('unknown-program');
  assert.throws(() => validateRecallBenchmark(unknown.benchmark, unknown));
  const invalidSpan = structuredClone(value);
  invalidSpan.benchmark.programs[0].evidence[0].recognition_span = { start: 0, end: 99999, text_sha256: digest('wrong') };
  assert.throws(() => validateRecallBenchmark(invalidSpan.benchmark, invalidSpan));
});
