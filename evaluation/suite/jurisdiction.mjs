import { createHash } from 'node:crypto';
import { answerWithGuardrails } from '../../src/lib/guardrails/navigator.mjs';
import { parseLlmConfig } from '../../src/lib/llm/index.mjs';

const QUESTION = 'Where can I find housing assistance application information?';
const AREAS = [
  ['tampa', 'Tampa'], ['st-petersburg', 'St. Petersburg'], ['clearwater', 'Clearwater'],
  ['hillsborough-county', 'Hillsborough County'], ['pinellas-county', 'Pinellas County'],
  ['pasco-county', 'Pasco County'],
];
const check = (id, expected, observed, kind = 'behavior') => ({
  id, kind, expected, observed, passed: JSON.stringify(expected) === JSON.stringify(observed),
});

function corpus(now) {
  const sources = AREAS.map(([id, label]) => ({
    source_id: `regional-${id}`, title: `${label} housing assistance`,
    agency: `${label} synthetic evaluation office`, jurisdiction_ids: [id],
    authoritative_status: 'first-party', categories: ['housing'], refresh_days: 30,
    canonical_url: `https://example.invalid/${id}/housing`, retrieval_date: now,
    next_step: { label: `Contact ${label}`, url: `https://example.invalid/${id}/housing` },
  }));
  const chunks = sources.map((source, index) => {
    const text = `Housing assistance application information for ${AREAS[index][1]} residents. Contact the housing office to confirm application requirements and current program availability.`;
    return {
      id: `${source.source_id}-1`, source_id: source.source_id, text,
      retrieved_at: now, content_hash: createHash('sha256').update(text).digest('hex'),
    };
  });
  return { sources, chunks, now };
}

/** Synthetic jurisdiction isolation checks, independent of current program availability. */
export async function runJurisdictionSuite({ now = '2026-09-12T12:00:00Z' } = {}) {
  const fixture = corpus(new Date(now).toISOString());
  const cases = [];
  const run = async (id, title, question, jurisdictionId, expected) => {
    const started = performance.now();
    let modelCalls = 0;
    const answer = await answerWithGuardrails(question, {
      ...fixture, jurisdictionId, config: parseLlmConfig(),
      provider: { complete() { modelCalls++; throw new Error('No model expected.'); } },
    });
    const allowed = expected.area ? [`regional-${expected.area}`] : [];
    cases.push({
      id, title, suite: 'jurisdiction', fixture: 'synthetic', durationMs: performance.now() - started,
      checks: [
        check('status', expected.status, answer.status),
        check('resolved-area', expected.area ?? 'tampa-bay', answer.jurisdictionId),
        check('local-evidence-isolated', true, answer.evidence.every(item => allowed.includes(item.source_id)), 'integrity'),
        check('evidence-present-only-when-expected', !!expected.area, answer.evidence.length > 0),
        check('official-links-isolated', true, answer.nextSteps.every(item => allowed.some(sourceId => fixture.sources.find(source => source.source_id === sourceId)?.next_step.url === item.url)), 'integrity'),
        check('no-model-call', 0, modelCalls, 'privacy'),
      ],
    });
  };
  for (const [id, label] of AREAS) {
    await run(`selected-${id}`, `Selected ${label} uses its own source collection`, QUESTION, id, { area: id, status: 'answered' });
  }
  for (const [id, locality] of [['st-petersburg', 'St Pete'], ['st-petersburg', 'Saint Petersburg'], ['clearwater', 'Clearwater'], ['pasco-county', 'Pasco County']]) {
    await run(`named-${locality.toLowerCase().replaceAll(' ', '-')}`, `Explicit ${locality} narrows the regional question`, `${QUESTION} I live in ${locality}.`, 'tampa-bay', { area: id, status: 'answered' });
  }
  await run('no-locality', 'A generic regional question does not silently apply Tampa programs', QUESTION, 'tampa-bay', { status: 'needs_jurisdiction' });
  await run('conflicting-locality', 'Conflicting city selection requires clarification', `${QUESTION} I live in Clearwater.`, 'tampa', { status: 'needs_jurisdiction' });
  await run('county-to-city', 'A named city narrows its parent county selection', `${QUESTION} I live in St. Petersburg.`, 'pinellas-county', { area: 'st-petersburg', status: 'answered' });
  await run('street-name', 'A city name in a street does not change the supplied locality', `${QUESTION} I live at 123 Clearwater Road, Tampa.`, 'tampa-bay', { area: 'tampa', status: 'answered' });
  await run('outside-city-limits', 'Outside a city limit does not establish that city jurisdiction', `${QUESTION} I live outside Clearwater city limits.`, 'tampa-bay', { status: 'needs_jurisdiction' });
  await run('unincorporated-county', 'Explicit unincorporated county wording overrides a postal city name', `${QUESTION} I live in unincorporated Clearwater, Pinellas County.`, 'tampa-bay', { area: 'pinellas-county', status: 'answered' });
  await run('saint-pete-beach', 'Saint Pete Beach is not St. Petersburg', `${QUESTION} I live in Saint Pete Beach.`, 'tampa-bay', { status: 'needs_jurisdiction' });

  for (const provider of ['ollama', 'openai-compatible']) {
    const started = performance.now();
    let supplied = [];
    let calls = 0;
    const answer = await answerWithGuardrails(QUESTION, {
      ...fixture, jurisdictionId: 'clearwater',
      config: parseLlmConfig({ LLM_PROVIDER: provider, LLM_BASE_URL: 'http://127.0.0.1:11434', LLM_MODEL: 'synthetic-jurisdiction-eval' }),
      provider: { complete({ messages }) {
        calls++;
        supplied = JSON.parse(messages.find(message => message.role === 'user').content).evidence;
        // Attempt to insert a valid quote from a different city's hidden collection.
        return JSON.stringify({ selections: [{ id: supplied[0].id, quote: fixture.chunks[0].text }] });
      } },
    });
    cases.push({
      id: `provider-isolation-${provider}`, title: `${provider} cannot insert a Tampa quote into a Clearwater answer`,
      suite: 'jurisdiction', fixture: 'synthetic', durationMs: performance.now() - started,
      checks: [
        check('provider-exercised', 1, calls),
        check('only-clearwater-supplied', true, supplied.length > 0 && supplied.every(item => item.title.startsWith('Clearwater')), 'privacy'),
        check('cross-city-selection-rejected', 'fallback', answer.generation.status),
        check('safe-fallback-area', 'clearwater', answer.jurisdictionId),
        check('safe-fallback-evidence', true, answer.evidence.length > 0 && answer.evidence.every(item => item.source_id === 'regional-clearwater'), 'integrity'),
      ],
    });
  }
  return cases;
}
