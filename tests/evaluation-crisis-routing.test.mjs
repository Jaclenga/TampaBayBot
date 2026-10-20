import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerResidentQuestion } from '../src/lib/core/resident.mjs';
import { parseLlmConfig } from '../src/lib/llm/index.mjs';

const evaluation = JSON.parse(readFileSync(new URL('../evaluation/datasets/answer-reliability.json', import.meta.url), 'utf8'));
const directory = JSON.parse(readFileSync(new URL('../pages-demo/src/housing-resources.json', import.meta.url), 'utf8')).resources;
const directoryById = new Map(directory.map(resource => [resource.id, resource]));
const now = new Date(evaluation.referenceDate);

async function ask(question, jurisdictionId = 'tampa-bay', locale = 'en') {
  return answerResidentQuestion(question, {
    sources: evaluation.fixture.sources,
    chunks: evaluation.fixture.chunks,
    crisisResources: directory,
    now,
    jurisdictionId,
    locale,
    config: parseLlmConfig({ LLM_PROVIDER: 'none' }),
    // A regression that tries to use a provider or HTTP adapter must fail here.
    provider: { complete: () => { throw new Error('Offline crisis test called an AI provider'); } },
    fetchImpl: () => { throw new Error('Offline crisis test made an HTTP request'); },
  });
}

function assertDirectoryProvenance(plan) {
  assert.ok(plan);
  assert.ok(plan.resources.length > 0, 'plan needs a human contact');
  assert.equal(new Set(plan.resources.map(resource => resource.id)).size, plan.resources.length);
  for (const resource of plan.resources) {
    const listed = directoryById.get(resource.id);
    assert.ok(listed, `unregistered resource ${resource.id}`);
    assert.equal(resource.sourceUrl, listed.sourceUrl, `substituted source for ${resource.id}`);
    assert.equal(resource.url, listed.url, `substituted contact URL for ${resource.id}`);
    assert.equal(new URL(resource.sourceUrl).protocol, 'https:');
  }
  assert.deepEqual(
    new Set(plan.sources.map(source => source.url)),
    new Set(plan.resources.map(resource => resource.sourceUrl)),
    'plan citations must resolve to its listed contacts',
  );
  assert.doesNotMatch(plan.deadline, /\b\d+\s*(?:days?|hours?|weeks?)\b/i,
    'the chat bridge must not calculate a legal deadline');
}

test('immediate physical danger reaches emergency services with registered contacts', async () => {
  const response = await ask('My partner is attacking me right now in Pinellas County and I need shelter tonight.');
  const plan = response.crisisPlan;
  assert.equal(plan?.situation, 'domestic_violence');
  assert.equal(plan.input.location, 'pinellas');
  assert.equal(plan.urgency, 'emergency');
  assert.equal(plan.referralPath, 'emergency_services');
  assert.match(plan.immediatePriority, /911/);
  assert.ok(plan.resources.some(resource => resource.id === 'emergency-911'));
  assertDirectoryProvenance(plan);
  assert.equal(response.generation.mode, 'extractive');
});

test('immediate physical danger uses authored Spanish answer and explanation', async () => {
  const response = await ask('My partner is attacking me right now in Pinellas County and I need shelter tonight.', 'tampa-bay', 'es');
  assert.equal(response.status, 'insufficient_evidence');
  assert.equal(response.answer, 'Si alguien está herido o hay peligro físico inmediato, vaya a un lugar seguro y llame a los servicios de emergencia ahora. Este sitio no puede enviar ayuda.');
  assert.equal(response.meaning, 'La guía para crisis de vivienda puede mostrar contactos locales cuando usted esté a salvo.');
  assert.equal(response.crisisPlan?.referralPath, 'emergency_services');
  assertDirectoryProvenance(response.crisisPlan);
});

test('nowhere safe to sleep tonight uses shelter intake without a reflexive police referral', async () => {
  const response = await ask('I have nowhere safe to sleep tonight in Tampa.');
  const plan = response.crisisPlan;
  assert.equal(plan?.situation, 'homelessness');
  assert.equal(plan.input.location, 'tampa');
  assert.equal(plan.input.noSafePlaceTonight, true);
  assert.equal(plan.urgency, 'emergency');
  assert.equal(plan.referralPath, 'shelter_intake');
  assert.ok(plan.resources.some(resource => /211|intake|outreach|shelter/.test(resource.id)));
  assert.ok(!plan.resources.some(resource => resource.id === 'emergency-911'));
  assertDirectoryProvenance(plan);
});

test('an eviction summons routes to legal help and leaves the actual deadline to court papers', async () => {
  const response = await ask('I received an eviction summons in Pinellas County. Do I have exactly 30 days to respond?');
  const plan = response.crisisPlan;
  assert.equal(plan?.situation, 'eviction');
  assert.equal(plan.input.location, 'pinellas');
  assert.equal(plan.input.noticeStage, 'court_summons');
  assert.equal(plan.urgency, 'urgent');
  assert.equal(plan.referralPath, 'legal_aid');
  assert.ok(plan.resources.some(resource => resource.id === 'court-pinellas-eviction'));
  assert.match(plan.deadline, /court paper|court clerk|legal aid/i);
  assert.doesNotMatch(plan.deadline, /30/);
  assertDirectoryProvenance(plan);
});

test('an unknown county keeps court referrals unassigned and asks for a location', async () => {
  const response = await ask('I received an eviction summons, but I do not know which Tampa Bay county my case is in.');
  const plan = response.crisisPlan;
  assert.equal(response.needsJurisdiction, true);
  assert.equal(plan?.situation, 'eviction');
  assert.equal(plan.input.location, 'all');
  assert.equal(plan.referralPath, 'legal_aid');
  assert.ok(!plan.resources.some(resource => resource.id.startsWith('court-')));
  assert.ok(plan.notes.some(note => /choose a city or county/i.test(note)));
  assertDirectoryProvenance(plan);
});

test('public data and property questions do not create a personal crisis plan', async () => {
  for (const question of [
    'How many evictions were filed in Tampa last year?',
    'What zoning applies to my property in Tampa?',
  ]) {
    const response = await ask(question);
    assert.equal(response.crisisPlan, undefined, question);
    assert.equal(response.generation.mode, 'extractive', question);
  }
});
