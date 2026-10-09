import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CRISIS_SITUATIONS,
  triageHousingCrisis,
  buildCrisisPlan,
  selectCrisisResources,
} from '../src/lib/housing/crisis.mjs';

const dataset = JSON.parse(readFileSync(new URL('../evaluation/datasets/housing-crisis-scenarios.json', import.meta.url), 'utf8'));
const resources = JSON.parse(readFileSync(new URL('../pages-demo/src/housing-resources.json', import.meta.url), 'utf8')).resources;
const byId = new Map(resources.map(resource => [resource.id, resource]));
const now = new Date('2026-10-09T12:00:00Z');
const cityCounty = { tampa: 'hillsborough', 'st-petersburg': 'pinellas', clearwater: 'pinellas' };

test('fictional scenario set covers all nine situations, geographies, and expert review', () => {
  assert.equal(dataset.fictional, true);
  assert.ok(dataset.scenarios.length >= 50);
  assert.equal(new Set(dataset.scenarios.map(scenario => scenario.id)).size, dataset.scenarios.length);
  assert.deepEqual(new Set(dataset.scenarios.map(scenario => scenario.input.situation)), new Set(CRISIS_SITUATIONS));
  for (const location of ['tampa', 'hillsborough', 'pinellas', 'pasco', 'clearwater', 'all']) {
    assert.ok(dataset.scenarios.some(scenario => scenario.input.location === location), location);
  }
  assert.ok(dataset.scenarios.filter(scenario => scenario.expertReview).length >= 20);
  assert.ok(dataset.scenarios.filter(scenario => scenario.criticalSafety).length >= 10);
  for (const scenario of dataset.scenarios) {
    assert.match(scenario.id, /^[a-z0-9-]+$/);
    assert.match(scenario.narrative, /^Fictional scenario:/);
    assert.ok(typeof scenario.expertReview === 'boolean');
    assert.ok(typeof scenario.criticalSafety === 'boolean');
    assert.ok(scenario.reviewDimensions.includes('urgency'));
    assert.ok(scenario.reviewDimensions.includes('citation_correctness'));
  }
});

test('59 deterministic crisis scenarios meet strict triage, referral, citation, and clarity gates', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Crisis planning must not call a model or network'); };
  try {
    for (const scenario of dataset.scenarios) {
      const { input, expected } = scenario;
      const scenarioResources = resources.map(resource => {
        const override = scenario.resourceOverrides?.find(item => item.id === resource.id);
        return override ? { ...resource, ...override } : resource;
      });
      const triage = triageHousingCrisis(input);
      const plan = buildCrisisPlan(input, scenarioResources, { now });
      assert.ok(plan, scenario.id);
      assert.equal(triage.urgency, expected.urgency, scenario.id + ': urgency');
      assert.equal(triage.referralPath, expected.referralPath, scenario.id + ': referral');
      assert.equal(plan.urgency, expected.urgency, scenario.id + ': plan urgency');
      assert.equal(plan.referralPath, expected.referralPath, scenario.id + ': plan referral');
      assert.equal(plan.situation, input.situation, scenario.id + ': situation');
      assert.ok(plan.title && plan.title.length <= 120, scenario.id + ': title');
      assert.ok(plan.immediatePriority && plan.immediatePriority.length <= 320, scenario.id + ': priority');
      assert.ok(plan.steps.length >= 1 && plan.steps.length <= 4, scenario.id + ': short steps');
      assert.ok(plan.steps.every(step => step.length <= 250), scenario.id + ': step length');
      assert.ok(plan.humanAssistance, scenario.id + ': human assistance');
      assert.ok(plan.deadline && !/\b\d+\s*(?:day|hour)s?\b/i.test(plan.deadline), scenario.id + ': no invented numerical deadline');
      assert.ok(plan.notes.some(note => /bed|fund|placement|cama|fondos|vivienda/i.test(note)), scenario.id + ': no capacity promise');
      const ids = plan.resources.map(resource => resource.id);
      if (expected.resourceAny.length) assert.ok(expected.resourceAny.some(id => ids.includes(id)), scenario.id + ': expected contact absent');
      for (const id of expected.forbiddenResourceIds) assert.ok(!ids.includes(id), scenario.id + ': forbidden contact ' + id);
      assert.equal(new Set(ids).size, ids.length, scenario.id + ': duplicate contacts');
      for (const resource of plan.resources) {
        assert.ok(byId.has(resource.id), scenario.id + ': unregistered resource');
        assert.equal(resource.sourceUrl, byId.get(resource.id).sourceUrl, scenario.id + ': source substitution');
        assert.equal(resource.verificationStatus, 'source_checked', scenario.id + ': source status');
        assert.ok(!['temporarily_closed', 'discontinued'].includes(resource.availabilityStatus), scenario.id + ': closed resource');
        const county = cityCounty[input.location] ?? input.location;
        assert.ok(
          resource.geography.includes('florida') || resource.geography.includes('national') ||
            input.location === 'all' || resource.geography.includes(county),
          scenario.id + ': wrong county ' + resource.id,
        );
        if (cityCounty[input.location] && resource.municipalities?.length) {
          assert.ok(resource.municipalities.includes(input.location), scenario.id + ': wrong municipality ' + resource.id);
        }
      }
      const expectedSources = new Set(plan.resources.map(resource => resource.sourceUrl));
      assert.deepEqual(new Set(plan.sources.map(source => source.url)), expectedSources, scenario.id + ': citation provenance');
      assert.ok(plan.sources.every(source => new URL(source.url).protocol === 'https:'), scenario.id + ': official HTTPS sources');
      if (input.situation === 'eviction' && ['court_summons', 'pending_case', 'judgment_or_possession'].includes(input.noticeStage)) {
        assert.match(plan.deadline, /court paper|court clerk|legal aid/i, scenario.id + ': verify actual court papers');
      }
      if (scenario.criticalSafety && !input.physicalDanger && !input.seriousHazard) {
        assert.ok(!ids.includes('emergency-911'), scenario.id + ': no reflexive police referral');
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stale, closed, and source-unavailable records are excluded from plans', () => {
  const input = { situation: 'utilities', location: 'pasco', timeframe: 'days', safe: 'yes' };
  const fresh = selectCrisisResources(input, resources, { now });
  assert.ok(fresh.some(resource => resource.id === 'emergency-pasco-energy'));
  const altered = resources.map(resource => {
    if (resource.id === 'emergency-pasco-energy') return { ...resource, verifiedAt: '2026-01-01' };
    if (resource.id === 'housing-pasco-coalition') return { ...resource, availabilityStatus: 'temporarily_closed' };
    if (resource.id === 'legal-bay-area') return { ...resource, verificationStatus: 'source_unavailable' };
    return resource;
  });
  const selected = selectCrisisResources(input, altered, { now });
  assert.ok(!selected.some(resource => ['emergency-pasco-energy', 'housing-pasco-coalition', 'legal-bay-area'].includes(resource.id)));
  const outdated = buildCrisisPlan(input, resources, { now: new Date('2027-02-01T00:00:00Z') });
  assert.ok(outdated.resources.length > 0);
  assert.ok(outdated.resources.every(resource => resource.verificationStatus === 'needs_recheck'));
  assert.ok(outdated.notes.some(note => /need rechecking/i.test(note)));
});

test('private fields and unsupported source text cannot alter deterministic plans', () => {
  const input = {
    situation: 'eviction', location: 'tampa', timeframe: 'days', safe: 'yes',
    noticeStage: 'court_summons',
    privateDetails: 'FAKE TEST ADDRESS 123 Example Lane; medical and payment details',
  };
  const plan = buildCrisisPlan(input, resources, { now });
  assert.ok(!JSON.stringify(plan).includes('FAKE TEST ADDRESS'));
  assert.ok(plan.resources.every(resource => byId.has(resource.id)));
  assert.ok(!plan.resources.some(resource => resource.id === 'housing-tampa-rmap'));
  assert.match(plan.deadline, /actual|exact/i);
});

test('Spanish plan copy preserves official resource names and source links', () => {
  const input = { situation: 'eviction', location: 'tampa', noticeStage: 'court_summons', timeframe: 'days', safe: 'yes' };
  const english = buildCrisisPlan(input, resources, { now, locale: 'en' });
  const spanish = buildCrisisPlan(input, resources, { now, locale: 'es' });
  assert.equal(spanish.language, 'es');
  assert.notEqual(spanish.immediatePriority, english.immediatePriority);
  assert.deepEqual(spanish.resources.map(resource => resource.id), english.resources.map(resource => resource.id));
  assert.deepEqual(spanish.sources.map(source => source.url), english.sources.map(source => source.url));
  assert.match(spanish.deadline, /documento|tribunal/i);
});
