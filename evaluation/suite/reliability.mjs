import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { answerWithGuardrails } from '../../src/lib/guardrails/navigator.mjs';
import { parseLlmConfig } from '../../src/lib/llm/index.mjs';
import { buildCrisisPlan } from '../../src/lib/housing/crisis.mjs';
import { scoreNavigationAnswer } from './scoring.mjs';

export const reliabilityDataset = JSON.parse(readFileSync(
  new URL('../datasets/answer-reliability.json', import.meta.url), 'utf8',
));
const housingDirectory = JSON.parse(readFileSync(
  new URL('../../pages-demo/src/housing-resources.json', import.meta.url), 'utf8',
));

const STATUS = new Set([
  'answered', 'insufficient_evidence', 'conflicting_evidence',
  'potentially_outdated', 'needs_location', 'needs_jurisdiction',
  'official_judgment', 'out_of_scope', 'unavailable_source',
  'missing_geographic_coverage',
]);
const JURISDICTIONS = new Set([
  'tampa-bay', 'tampa', 'st-petersburg', 'clearwater',
  'hillsborough-county', 'pinellas-county', 'pasco-county',
]);
const CLARIFICATIONS = new Set(['none', 'address', 'jurisdiction', 'eligibility']);
const idPattern = /^[a-z0-9][a-z0-9-]{0,100}$/;
const categoryPattern = /^[a-z][a-z0-9_]{0,100}$/;
const hash = text => createHash('sha256').update(text).digest('hex');
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const uniqueStrings = values => Array.isArray(values) && values.every(value => typeof value === 'string' && idPattern.test(value)) && new Set(values).size === values.length;
const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function safeFixtureUrl(candidate, canonical) {
  try {
    const baseline = new URL(canonical);
    const value = new URL(candidate, baseline);
    return baseline.protocol === 'https:' && baseline.hostname.endsWith('.invalid') &&
      !baseline.username && !baseline.password && value.protocol === 'https:' &&
      value.hostname === baseline.hostname && !value.username && !value.password;
  } catch { return false; }
}

/** The oracle is authored independently of the answer path. Reject malformed
 * fixtures before scoring so an empty or self-contradictory dataset cannot pass.
 */
export function validateReliabilityDataset(dataset) {
  if (!record(dataset) || dataset.schemaVersion !== 1 || !isoDate(dataset.referenceDate) ||
      !record(dataset.fixture) || !idPattern.test(dataset.fixture.id ?? '') ||
      dataset.fixture.synthetic !== true || !Array.isArray(dataset.fixture.sources) ||
      !dataset.fixture.sources.length || !Array.isArray(dataset.fixture.chunks) ||
      !dataset.fixture.chunks.length || !Array.isArray(dataset.cases) || dataset.cases.length < 30)
    throw new Error('Invalid answer-reliability dataset.');
  const sources = new Map();
  for (const source of dataset.fixture.sources) {
    if (!record(source) || !idPattern.test(source.source_id ?? '') || sources.has(source.source_id) ||
        typeof source.title !== 'string' || !source.title.trim() ||
        typeof source.agency !== 'string' || !source.agency.trim() ||
        !safeFixtureUrl(source.canonical_url, source.canonical_url) ||
        source.authoritative_status !== 'first-party' ||
        !uniqueStrings(source.jurisdiction_ids) || !source.jurisdiction_ids.length ||
        source.jurisdiction_ids.some(id => !JURISDICTIONS.has(id)) ||
        !uniqueStrings(source.categories) || !source.categories.length ||
        !isoDate(source.retrieval_date) || !Number.isInteger(source.refresh_days) || source.refresh_days < 1 ||
        !record(source.next_step) || typeof source.next_step.label !== 'string' || !source.next_step.label.trim() ||
        !safeFixtureUrl(source.next_step.url, source.canonical_url))
      throw new Error('Invalid answer-reliability fixture source.');
    sources.set(source.source_id, source);
  }
  const chunks = new Set();
  for (const chunk of dataset.fixture.chunks) {
    const source = sources.get(chunk?.source_id);
    if (!record(chunk) || !idPattern.test(chunk.id ?? '') || chunks.has(chunk.id) || !source ||
        typeof chunk.text !== 'string' || !chunk.text.trim() ||
        chunk.content_hash !== hash(chunk.text) ||
        !safeFixtureUrl(chunk.url, source.canonical_url) || !isoDate(chunk.retrieved_at))
      throw new Error('Invalid answer-reliability fixture chunk.');
    chunks.add(chunk.id);
  }
  const cases = new Set();
  const categories = new Set();
  for (const row of dataset.cases) {
    if (!record(row) || !idPattern.test(row.id ?? '') || cases.has(row.id) ||
        !categoryPattern.test(row.category ?? '') ||
        typeof row.question !== 'string' || !row.question.trim() ||
        typeof row.expectedBehavior !== 'string' || !row.expectedBehavior.trim() ||
        !JURISDICTIONS.has(row.jurisdictionId) || !STATUS.has(row.expectedStatus) ||
        row.fixtureId !== dataset.fixture.id ||
        !uniqueStrings(row.requiredSourceIds) || row.requiredSourceIds.some(id => !sources.has(id)) ||
        !uniqueStrings(row.allowedSourceIds) || row.allowedSourceIds.some(id => !sources.has(id)) ||
        row.requiredSourceIds.some(id => !row.allowedSourceIds.includes(id)) ||
        !Array.isArray(row.allowedSupportPairs) ||
        row.allowedSupportPairs.some(pair => !record(pair) || !sources.has(pair.sourceId) ||
          !chunks.has(pair.chunkId) || !dataset.fixture.chunks.some(chunk =>
            chunk.id === pair.chunkId && chunk.source_id === pair.sourceId) ||
          !row.allowedSourceIds.includes(pair.sourceId)) ||
        row.requiredSourceIds.some(id => !row.allowedSupportPairs.some(pair => pair.sourceId === id)) ||
        !uniqueStrings(row.expectedNextStepSourceIds) || row.expectedNextStepSourceIds.some(id => !sources.has(id)) ||
        typeof row.nextStepRequired !== 'boolean' ||
        row.nextStepRequired !== (row.expectedNextStepSourceIds.length > 0) ||
        !CLARIFICATIONS.has(row.clarificationKind) ||
        row.clarificationRequired !== (row.clarificationKind !== 'none') ||
        typeof row.uncertaintyRequired !== 'boolean' || !Array.isArray(row.unacceptableClaims) ||
        !row.unacceptableClaims.length)
      throw new Error('Invalid answer-reliability case.');
    const claimIds = new Set();
    for (const claim of row.unacceptableClaims) {
      if (!record(claim) || !idPattern.test(claim.id ?? '') || claimIds.has(claim.id) ||
          typeof claim.pattern !== 'string' || !claim.pattern ||
          !/^[imu]*$/.test(claim.flags ?? ''))
        throw new Error('Invalid answer-reliability unacceptable claim.');
      try { new RegExp(claim.pattern, claim.flags ?? 'i'); }
      catch { throw new Error('Invalid answer-reliability unacceptable claim.'); }
      claimIds.add(claim.id);
    }
    cases.add(row.id);
    categories.add(row.category);
  }
  if (categories.size < 5) throw new Error('Answer-reliability cases need multiple categories.');
  return dataset;
}

const check = (id, kind, passed, expected, observed) => ({
  id, kind, passed,
  ...(expected === undefined ? {} : { expected }),
  ...(observed === undefined ? {} : { observed }),
});

function hasNextStepFor(answer, source) {
  const target = source.next_step;
  return Array.isArray(answer.nextSteps) && answer.nextSteps.some(item =>
    item?.url === target.url && item?.agency === source.agency && item?.label === target.label);
}

/** Add authored expectations to the existing independent provenance scorer.
 * The proxy checks are deliberately narrow: they cannot establish that a
 * real agency is open, that an answer is complete, or that a next step helps a
 * particular resident.
 */
export function scoreReliabilityAnswer({ reference, answer, sources, chunks, now }) {
  const benchmark = {
    expected_uncertainty_behavior: reference.expectedStatus,
    // An out-of-area question can also name a covered place. The selected
    // resource context may then resolve to that place while coverage refusal
    // remains the invariant that matters.
    ...(reference.expectedStatus === 'missing_geographic_coverage'
      ? {} : { expected_jurisdiction_id: reference.jurisdictionId }),
  };
  const checks = scoreNavigationAnswer({ benchmark, answer, sources, chunks, now });
  const evidence = Array.isArray(answer?.evidence) ? answer.evidence : [];
  const cited = new Set(evidence.map(item => item?.source_id));
  const missing = reference.requiredSourceIds.filter(id => !cited.has(id));
  checks.push(check('required_sources_cited', 'citation', missing.length === 0,
    reference.requiredSourceIds.length, reference.requiredSourceIds.length - missing.length));
  const allowedSources = new Set(reference.allowedSourceIds);
  const allowedPairs = new Set(reference.allowedSupportPairs.map(pair => `${pair.sourceId}/${pair.chunkId}`));
  checks.push(check('citations_use_allowed_support', 'citation', evidence.every(item =>
    allowedSources.has(item?.source_id) && allowedPairs.has(`${item?.source_id}/${item?.chunk_id}`)),
    evidence.length, evidence.filter(item => allowedPairs.has(`${item?.source_id}/${item?.chunk_id}`)).length));
  const nextSources = reference.expectedNextStepSourceIds.map(id => sources.find(source => source.source_id === id));
  checks.push(check('useful_official_next_step', 'behavior', reference.nextStepRequired
    ? nextSources.some(source => source && hasNextStepFor(answer, source)) : null,
    reference.nextStepRequired ? 'one registered source next step' : undefined));
  const body = [answer?.answer, answer?.meaning].filter(value => typeof value === 'string').join('\n');
  const violations = reference.unacceptableClaims.filter(claim =>
    new RegExp(claim.pattern, claim.flags ?? 'i').test(body));
  checks.push(check('unacceptable_claims_absent', 'accuracy', violations.length === 0,
    0, violations.map(claim => claim.id)));
  const clarification = reference.clarificationKind === 'address'
    ? answer?.needsAddress === true && /\b(?:address|property lookup|location)\b/i.test(body)
    : reference.clarificationKind === 'jurisdiction'
      ? answer?.needsJurisdiction === true && /\b(?:city|county|jurisdiction|area)\b/i.test(body)
      : reference.clarificationKind === 'eligibility'
        ? Array.isArray(answer?.requirementsToVerify) && answer.requirementsToVerify.some(item => typeof item === 'string' && item.includes('?'))
        : true;
  checks.push(check('necessary_clarification', 'behavior', clarification,
    reference.clarificationKind));
  const uncertaintyText = [body, ...(Array.isArray(answer?.warnings) ? answer.warnings : [])].join(' ');
  const uncertainty = !reference.uncertaintyRequired ||
    answer?.status !== 'answered' && /\b(?:cannot|could not|do not|does not|not|need|confirm|check|verify|unknown|unavailable)\b/i.test(uncertaintyText) ||
    /\b(?:may|might|could|check|confirm|verify|unverified|not guaranteed|not a|cannot)\b/i.test(uncertaintyText);
  checks.push(check('uncertainty_stated', 'proxy', uncertainty,
    reference.uncertaintyRequired));
  checks.push(check('model_disabled', 'integrity', answer?.generation?.status === 'disabled' &&
    answer?.generation?.mode === 'extractive'));
  return checks;
}

function directoryIntegrityCase(directory, now) {
  const started = performance.now();
  const resources = Array.isArray(directory?.resources) ? directory.resources : [];
  const ids = new Set(resources.map(resource => resource?.id));
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  };
  const selections = [
    ['eviction', 'tampa', 'court_summons'], ['homelessness', 'pinellas', 'unknown'],
    ['rent', 'pasco', 'written_notice'], ['unsafe_housing', 'clearwater', 'unknown'],
  ];
  const plans = selections.map(([situation, location, noticeStage]) =>
    buildCrisisPlan({ situation, location, noticeStage, timeframe: 'unknown', safe: 'unsure' }, resources, { now }));
  const sourceRelations = plans.every(plan => plan && plan.resources.every(resource =>
    ids.has(resource.id) && resources.find(item => item.id === resource.id)?.sourceUrl === resource.sourceUrl) &&
    plan.sources.every(source => plan.resources.some(resource => resource.sourceUrl === source.url)));
  return {
    id: 'directory-integrity', suite: 'reliability',
    title: 'Checked-in housing directory and guide links', fixture: 'public_snapshot',
    durationMs: Number((performance.now() - started).toFixed(3)),
    checks: [
      check('directory_ids_unique', 'integrity', resources.length > 0 && ids.size === resources.length &&
        resources.every(resource => idPattern.test(resource?.id ?? ''))),
      check('directory_links_safe_https', 'integrity', resources.length > 0 &&
        resources.every(resource => safeUrl(resource.url) && safeUrl(resource.sourceUrl))),
      check('guide_sources_match_directory', 'citation', sourceRelations),
    ],
    details: { category: 'directory_integrity', scenario: 'checked_in_resource_metadata', challenge: 'offline_link_integrity' },
  };
}

export async function runReliabilitySuite({
  answer = answerWithGuardrails,
  dataset = reliabilityDataset,
  directory = housingDirectory,
} = {}) {
  validateReliabilityDataset(dataset);
  const { sources, chunks } = dataset.fixture;
  const results = [];
  for (const reference of dataset.cases) {
    const started = performance.now();
    let checks;
    try {
      const response = await answer(reference.question, {
        sources: structuredClone(sources), chunks: structuredClone(chunks),
        now: dataset.referenceDate, jurisdictionId: reference.jurisdictionId,
        config: parseLlmConfig({ LLM_PROVIDER: 'none' }),
      });
      checks = [check('execution', 'robustness', true), ...scoreReliabilityAnswer({
        reference, answer: response, sources, chunks, now: dataset.referenceDate,
      })];
    } catch {
      // Never write questions, provider errors, or response bodies to reports.
      checks = [check('execution', 'robustness', false)];
    }
    results.push({
      id: reference.id, suite: 'reliability', title: reference.id, fixture: 'synthetic',
      durationMs: Number((performance.now() - started).toFixed(3)), checks,
      details: { category: reference.category, scenario: reference.fixtureId,
        challenge: reference.expectedBehavior },
    });
  }
  results.push(directoryIntegrityCase(directory, new Date(dataset.referenceDate)));
  return results;
}
