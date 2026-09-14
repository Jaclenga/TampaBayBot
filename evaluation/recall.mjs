import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { routeQuestion } from '../src/lib/core/router.mjs';
import { isJurisdictionId } from '../src/lib/coverage.mjs';
import { retrieve, ANSWER_RETRIEVAL_LIMIT } from '../src/lib/retrieval/search.mjs';
import { answerWithGuardrails } from '../src/lib/guardrails/navigator.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';
import { summarizeModelUsage } from './suite/usage.mjs';
import { modelUsageMarkdown } from './suite/report.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
const unique = values => [...new Set(values)];
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,150}$/.test(value);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const RECALL_CUTOFFS = Object.freeze(unique([1, 3, 6, ANSWER_RETRIEVAL_LIMIT, 30]).sort((a, b) => a - b));

/** Labels are authored before seeing rankings. Missing support stays in the
 * denominator; changed text at an existing ID invalidates the dated oracle. */
export function validateRecallBenchmark(benchmark, { sources = [], chunks = [] } = {}) {
  assert.equal(benchmark?.schema_version, 1, 'Invalid program-recall schema');
  assert.ok(nonempty(benchmark.reference_date) && Number.isFinite(Date.parse(benchmark.reference_date)), 'Invalid recall reference date');
  assert.equal(new Date(benchmark.reference_date).toISOString(), benchmark.reference_date, 'Use an ISO recall reference date');
  assert.ok((nonempty(benchmark.scope) || nonempty(benchmark.scope?.description)) &&
    (nonempty(benchmark.label_policy) || nonempty(benchmark.label_policy?.applicable_definition)), 'Recall scope and label policy are required');
  assert.ok(Array.isArray(benchmark.programs) && benchmark.programs.length, 'Recall needs an authored program inventory');
  assert.ok(Array.isArray(benchmark.cases) && benchmark.cases.length, 'Recall needs authored cases');
  const sourceIndex = new Map(sources.map(source => [source.source_id, source]));
  const chunkIndex = new Map(chunks.map(chunk => [chunk.id, chunk]));
  assert.equal(sourceIndex.size, sources.length, 'Duplicate corpus source IDs');
  assert.equal(chunkIndex.size, chunks.length, 'Duplicate corpus chunk IDs');
  const programs = new Set();
  for (const program of benchmark.programs) {
    assert.ok(identifier(program.program_id) && !programs.has(program.program_id) && nonempty(program.title), 'Invalid or duplicate program');
    programs.add(program.program_id);
    assert.ok(Array.isArray(program.evidence) && program.evidence.length, 'A program needs independently reviewed support');
    const supportIds = new Set();
    for (const support of program.evidence) {
      assert.ok(identifier(support.source_id) && nonempty(support.chunk_id) && sha256(support.text_sha256), 'Invalid recall support');
      assert.ok(!supportIds.has(support.chunk_id), 'Duplicate program support');
      supportIds.add(support.chunk_id);
      const span = support.recognition_span;
      if (span) assert.ok(Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end) && span.start >= 0 && span.end > span.start && sha256(span.text_sha256), 'Invalid recognition span');
      const chunk = chunkIndex.get(support.chunk_id);
      if (!chunk) continue;
      assert.ok(sourceIndex.has(support.source_id) && chunk.source_id === support.source_id, 'Recall support source mismatch');
      assert.ok(typeof chunk.text === 'string' && digest(chunk.text) === support.text_sha256 && chunk.content_hash === support.text_sha256, 'Recall support hash mismatch; review changed evidence');
      if (span) assert.ok(span.end <= chunk.text.length && digest(chunk.text.slice(span.start, span.end)) === span.text_sha256, 'Recognition span does not match evidence');
    }
  }
  const ids = new Set();
  for (const row of benchmark.cases) {
    assert.ok(identifier(row.id) && !ids.has(row.id) && nonempty(row.question) && row.question.length <= 1000, 'Invalid or duplicate recall case');
    ids.add(row.id);
    assert.ok(isJurisdictionId(row.jurisdiction_id) && ['en', 'es'].includes(row.language), 'Invalid recall jurisdiction/language');
    assert.ok(nonempty(row.rationale) && Array.isArray(row.tags) && row.tags.every(nonempty), 'Recall labels require a rationale and tags');
    assert.ok(Array.isArray(row.expected_program_ids) && unique(row.expected_program_ids).length === row.expected_program_ids.length && row.expected_program_ids.every(id => programs.has(id)), 'Invalid expected program set');
    if (row.allowed_reference_program_ids !== undefined) assert.ok(Array.isArray(row.allowed_reference_program_ids) && row.allowed_reference_program_ids.every(id => programs.has(id)), 'Invalid allowed reference programs');
    if (row.expected_status !== undefined) assert.ok(nonempty(row.expected_status), 'Invalid expected status');
  }
  assert.ok(benchmark.cases.some(row => row.expected_program_ids.length), 'Recall cannot be estimated from only empty controls');
  return benchmark;
}

export function scoreProgramRecall(expectedIds, retrievedIds) {
  const expected = unique(expectedIds);
  const retrieved = unique(retrievedIds);
  const matched = expected.filter(id => retrieved.includes(id));
  const missed = expected.filter(id => !retrieved.includes(id));
  return { expected, retrieved, matched, missed, recall: expected.length ? matched.length / expected.length : null };
}

function aggregate(rows, stage) {
  const scores = rows.map(row => row.stages[stage]).filter(score => score.recall !== null);
  const expected = scores.reduce((sum, score) => sum + score.expected.length, 0);
  const matched = scores.reduce((sum, score) => sum + score.matched.length, 0);
  return { expected, matched, microRecall: expected ? matched / expected : null,
    macroRecall: scores.length ? scores.reduce((sum, score) => sum + score.recall, 0) / scores.length : null,
    completeCases: scores.filter(score => !score.missed.length).length, applicableCases: scores.length,
    casesWithOmissions: scores.filter(score => score.missed.length).length };
}

/** No labels or expected programs are supplied to either application stage. */
export async function evaluateProgramRecall({ benchmark, sources = [], chunks = [], answer = answerWithGuardrails } = {}) {
  validateRecallBenchmark(benchmark, { sources, chunks });
  const chunkIndex = new Map(chunks.map(chunk => [chunk.id, chunk]));
  const available = benchmark.programs.filter(program => program.evidence.some(support => chunkIndex.has(support.chunk_id))).map(program => program.program_id);
  const missingSupport = benchmark.programs.flatMap(program => program.evidence.filter(support => !chunkIndex.has(support.chunk_id)).map(support => ({ program_id: program.program_id, chunk_id: support.chunk_id })));
  const programIds = (items, quoted = false) => benchmark.programs.filter(program => program.evidence.some(support => {
    const chunk = chunkIndex.get(support.chunk_id);
    if (!chunk) return false;
    return items.some(item => {
      if (item.source_id !== support.source_id || item.chunk_id !== support.chunk_id) return false;
      if (!quoted) return true;
      const span = support.recognition_span;
      const recognition = span ? chunk.text.slice(span.start, span.end) : chunk.text.trim();
      return nonempty(item.quote) && chunk.text.includes(item.quote) && item.quote.includes(recognition);
    });
  })).map(program => program.program_id);
  const stageNames = [...RECALL_CUTOFFS.map(k => `retrieval_at_${k}`), 'retrieval_all', 'answer_evidence'];
  const cases = [];
  for (const reference of benchmark.cases) {
    const route = routeQuestion(reference.question, { jurisdictionId: reference.jurisdiction_id });
    // These are the same early exits and route scope as answerQuestion.
    const hits = route.outOfScope || route.outsideCoverage ? [] : retrieve(reference.question, {
      sources, chunks, route, now: new Date(benchmark.reference_date), limit: chunks.length,
    }).hits;
    const stages = Object.fromEntries(RECALL_CUTOFFS.map(k => [`retrieval_at_${k}`, scoreProgramRecall(reference.expected_program_ids, programIds(hits.slice(0, k).map(hit => ({ source_id: hit.source.source_id, chunk_id: hit.chunk.id }))))]));
    const allPrograms = programIds(hits.map(hit => ({ source_id: hit.source.source_id, chunk_id: hit.chunk.id })));
    stages.retrieval_all = scoreProgramRecall(reference.expected_program_ids, allPrograms);
    let output, execution = 'completed';
    try {
      output = await answer(reference.question, { sources: structuredClone(sources), chunks: structuredClone(chunks), now: benchmark.reference_date,
        jurisdictionId: reference.jurisdiction_id, config: parseLlmConfig({ LLM_PROVIDER: 'none' }) });
      if (!output || !Array.isArray(output.evidence) || !nonempty(output.status) || output.evidence.some(item =>
        !item || !nonempty(item.source_id) || !nonempty(item.chunk_id) || !nonempty(item.quote))) throw new Error('Invalid answer');
    } catch { execution = 'failed'; output = { status: 'execution_failed', evidence: [] }; }
    stages.answer_evidence = scoreProgramRecall(reference.expected_program_ids, programIds(output.evidence, true));
    const production = stages[`retrieval_at_${ANSWER_RETRIEVAL_LIMIT}`];
    const omissions = stages.answer_evidence.missed.map(program_id => ({ program_id,
      reason: !available.includes(program_id) ? 'corpus_evidence_missing' : execution === 'failed' ? 'answer_execution_failed'
        : !allPrograms.includes(program_id) ? 'retrieval_filtered_or_unmatched'
          : !production.matched.includes(program_id) ? 'below_retrieval_cutoff' : 'answer_selection_loss' }));
    const unanticipated = stages.answer_evidence.retrieved.filter(id => !reference.expected_program_ids.includes(id));
    cases.push({ id: reference.id, question: reference.question, jurisdiction_id: reference.jurisdiction_id, language: reference.language,
      tags: reference.tags, rationale: reference.rationale, expected_program_ids: reference.expected_program_ids,
      execution, modelUsage: summarizeModelUsage([]), answerStatus: output.status, expectedStatus: reference.expected_status ?? null,
      controlPassed: reference.expected_status || !reference.expected_program_ids.length ?
        execution === 'completed' && (!reference.expected_status || output.status === reference.expected_status) &&
        (reference.expected_program_ids.length > 0 || unanticipated.every(id => (reference.allowed_reference_program_ids ?? []).includes(id))) : null,
      stages, omissions, unanticipatedProgramIds: unanticipated,
      recoveredByAnswer: stages.answer_evidence.matched.filter(id => production.missed.includes(id)),
      firstRelevantRank: Object.fromEntries(reference.expected_program_ids.map(id => [id, (() => {
        const rank = hits.findIndex(hit => programIds([{ source_id: hit.source.source_id, chunk_id: hit.chunk.id }]).includes(id));
        return rank < 0 ? null : rank + 1;
      })()])) });
  }
  const metrics = rows => Object.fromEntries(stageNames.map(stage => [stage, aggregate(rows, stage)]));
  const grouped = field => Object.fromEntries(unique(cases.map(row => row[field])).map(key => [key, metrics(cases.filter(row => row[field] === key))]));
  const stages = metrics(cases);
  const controls = cases.filter(row => row.controlPassed !== null);
  return { schemaVersion: 1, status: !chunks.length ? 'not_evaluable' : missingSupport.length ? 'incomplete_corpus'
    : cases.some(row => row.execution === 'failed') ? 'execution_failed' : 'measured',
    referenceDate: benchmark.reference_date, scope: benchmark.scope, labelPolicy: benchmark.label_policy,
    productionRetrievalLimit: ANSWER_RETRIEVAL_LIMIT, summary: { programs: benchmark.programs.length, cases: cases.length,
      positiveCases: cases.filter(row => row.expected_program_ids.length).length, controls: controls.length,
      controlsPassed: controls.filter(row => row.controlPassed).length, programsWithEvidence: available.length,
      executionFailures: cases.filter(row => row.execution === 'failed').length, modelUsage: summarizeModelUsage([]) },
    stages, byJurisdiction: grouped('jurisdiction_id'), byLanguage: grouped('language'),
    byTag: Object.fromEntries(unique(cases.flatMap(row => row.tags)).map(tag => [tag, metrics(cases.filter(row => row.tags.includes(tag)))])),
    byProgram: Object.fromEntries(benchmark.programs.map(program => [program.program_id, { title: program.title,
      ...metrics(cases.filter(row => row.expected_program_ids.includes(program.program_id)).map(row => ({ ...row,
        stages: Object.fromEntries(stageNames.map(stage => [stage, scoreProgramRecall([program.program_id], row.stages[stage].retrieved)])) }))) }])),
    missingSupport, cases,
    limitations: [
      'Applicable means a program to consider under the authored scenario, not verified household eligibility or open applications.',
      'The denominator covers only the enumerated programs and dated retained pages. Programs absent from those pages remain unmeasured.',
      'Agent-authored development labels need independent human adjudication; these cases are not a blind holdout or a population estimate.',
      'Each program counts once per query; source hits, duplicate passages and generic directory links do not count as program hits.',
      'Answer evidence requires an exact source substring containing the authored recognition span. It measures supporting evidence cards, not the answer prose or resident usefulness.',
      'Unanticipated program IDs are diagnostics, not false-positive or eligibility judgments. Controls may explicitly allow references that explain an exclusion.',
      'Anchors can recover programs missing from raw retrieval; final evidence is not necessarily a subset of the top-k candidates.',
      'Missing support remains in the fixed denominator and marks the corpus incomplete; changed support text invalidates this benchmark.',
    ] };
}

const percent = value => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
const cell = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
export function recallMarkdown(report) {
  const lines = ['# Applicable-program retrieval recall', '', `Status: ${report.status}. Reference date: ${report.referenceDate}.`, '', report.scope.description ?? report.scope, '', report.labelPolicy.applicable_definition ?? report.labelPolicy,
    '', `${report.summary.programs} programs; ${report.summary.positiveCases} positive queries; ${report.summary.controls} controls (${report.summary.controlsPassed} passed).`,
    '', '| Stage | Found / expected program-query pairs | Micro recall | Macro recall | Queries with all programs |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const [stage, metric] of Object.entries(report.stages)) lines.push(`| ${stage} | ${metric.matched} / ${metric.expected} | ${percent(metric.microRecall)} | ${percent(metric.macroRecall)} | ${metric.completeCases} / ${metric.applicableCases} |`);
  lines.push('', ...modelUsageMarkdown(report.summary.modelUsage));
  lines.push('', '## Final evidence recall by jurisdiction', '', '| Jurisdiction | Found / expected | Recall |', '| --- | ---: | ---: |');
  for (const [key, value] of Object.entries(report.byJurisdiction)) lines.push(`| ${key} | ${value.answer_evidence.matched} / ${value.answer_evidence.expected} | ${percent(value.answer_evidence.microRecall)} |`);
  lines.push('', '## Omitted programs', '', '| Query | Program | First retrieval rank | Failure location |', '| --- | --- | ---: | --- |');
  for (const row of report.cases) for (const omission of row.omissions) lines.push(`| ${row.id} | ${cell(report.byProgram[omission.program_id].title)} | ${row.firstRelevantRank[omission.program_id] ?? 'absent'} | ${omission.reason} |`);
  lines.push('', '## Limits', '', ...report.limitations.map(note => `- ${note}`), '', '## Provenance', '', '```json', JSON.stringify(report.provenance ?? {}, null, 2), '```', '');
  return lines.join('\n');
}
