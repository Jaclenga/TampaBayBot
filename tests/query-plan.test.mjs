import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryPlan } from '../src/lib/core/query-plan.mjs';
import { routeQuestion } from '../src/lib/core/router.mjs';

test('query plans retain resident text while exposing normalized intent and requested facts', () => {
  const query = '¿Cuál es el máximo de asistencia para vivienda en Tampa?';
  const plan = createQueryPlan(query);
  assert.equal(plan.originalQuery, query);
  assert.equal(plan.query, query);
  assert.equal(plan.intent, 'housing');
  assert.equal(plan.subjectCategory, 'housing');
  assert.equal(plan.jurisdiction.jurisdictionId, 'tampa');
  assert.ok(plan.requestedFacts.includes('amount'));
  assert.equal(plan.consequentialDecision, false);
  assert.deepEqual(plan.route, routeQuestion(query));
});

test('navigation intent retains the underlying domain for retrieval', () => {
  const plan = createQueryPlan('Which department handles electrical permits in Clearwater?');
  assert.equal(plan.intent, 'navigation');
  assert.equal(plan.subjectCategory, 'permitting');
  assert.equal(plan.jurisdiction.jurisdictionId, 'clearwater');
  assert.ok(plan.requestedFacts.includes('contact'));
});

test('location hints preserve city names in streets without asserting property boundaries', () => {
  const plan = createQueryPlan('What zoning applies to 123 St. Petersburg Road, Clearwater?');
  assert.equal(plan.jurisdiction.jurisdictionId, 'clearwater');
  assert.equal(plan.geography.hasAddress, true);
  assert.equal(plan.geography.needsAddress, true);
  assert.equal(plan.geography.outsideCoverage, false);
  assert.deepEqual(plan.geography.addresses, ['123 st. petersburg road']);
  assert.deepEqual(plan.entities, [{ type: 'address', value: '123 st. petersburg road' }]);
  assert.equal('coordinates' in plan.geography, false);
  assert.equal('parcel' in plan.geography, false);
});

test('bare addresses and navigation overrides preserve established route behavior', () => {
  assert.equal(createQueryPlan('315 E Kennedy Blvd, Tampa').intent, 'zoning');
  const navigation = createQueryPlan('315 E Kennedy Blvd, Tampa phone number');
  assert.equal(navigation.intent, 'navigation');
  assert.equal(navigation.subjectCategory, 'navigation');
  for (const [query, topic] of [
    ['I need hosuing assitance after evicton', 'housing'],
    ['What zonning is on my property?', 'zoning'],
    ['Need a permitt for a fence', 'permitting'],
    ['Show devlopment near me', 'development'],
  ]) assert.equal(createQueryPlan(query).subjectCategory, topic, query);
});

test('consequential decisions remain separate from requested program information', () => {
  const decision = createQueryPlan('Am I eligible for housing assistance in Tampa?');
  assert.equal(decision.consequentialDecision, true);
  assert.ok(decision.requestedFacts.includes('eligibility'));
  const information = createQueryPlan('What are the eligibility requirements for housing assistance in Tampa?');
  assert.equal(information.consequentialDecision, false);
  assert.ok(information.requestedFacts.includes('eligibility'));
  const spanish = createQueryPlan('¿Puedo construir un duplex en mi propiedad en Tampa?');
  assert.equal(spanish.consequentialDecision, true);
});

test('program entities come from registry aliases and titles without hardcoded IDs', () => {
  const sources = [{ source_id: 'synthetic-assistance', title: 'Invented Assistance Program (IAP)', program_id: 'invented', entity_aliases: ['New Neighbor Help'] }];
  for (const query of ['Is IAP open?', 'What is New Neighbor Help?', 'Maximum amount for IAP.']) {
    const plan = createQueryPlan(query, { sources });
    assert.ok(plan.entities.some(entity => entity.type === 'program' && entity.programId === 'invented' && entity.sourceId === 'synthetic-assistance'), query);
  }
  assert.deepEqual(createQueryPlan('Is IAPP open?', { sources }).entities, []);
  assert.deepEqual(createQueryPlan('What is Example Zoning?', { sources: [{ source_id: 'zoning', title: 'Example Zoning' }] }).entities, []);
});

test('program mentions and zoning designations retain identity without manufacturing evidence', () => {
  const program = createQueryPlan('What does the Silver Tree Grant offer?');
  assert.deepEqual(program.entities, [{ type: 'program', value: 'Silver Tree Grant' }]);
  assert.equal(program.entities[0].sourceId, undefined);
  const zoning = createQueryPlan('What does RM-24 mean in Tampa?');
  assert.ok(zoning.entities.some(entity => entity.type === 'zoning_designation' && entity.value === 'RM-24'));
});

test('requested facts distinguish fees and benefit amounts, and expose status and income questions', () => {
  assert.deepEqual(createQueryPlan('What is the maximum permit fee?').requestedFacts, ['fee']);
  assert.ok(createQueryPlan('Is the assistance program accepting applications?').requestedFacts.includes('application_status'));
  assert.ok(createQueryPlan('What are the income limits for assistance?').requestedFacts.includes('income_limit'));
  assert.deepEqual(createQueryPlan('How long is the loan term and what is the deadline?').requestedFacts, ['duration', 'deadline']);
});

test('jurisdiction ambiguity and out-of-scope signals remain explicit', () => {
  const conflict = createQueryPlan('Housing assistance in Clearwater', { jurisdictionId: 'tampa' });
  assert.equal(conflict.jurisdiction.jurisdictionReason, 'conflict');
  assert.equal(conflict.jurisdiction.needsJurisdiction, true);
  assert.equal(createQueryPlan('Housing assistance in Tampa Bay').jurisdiction.jurisdictionId, 'tampa-bay');
  assert.equal(createQueryPlan('What zoning applies to 123 Tampa Street, Orlando?').geography.outsideCoverage, true);
  assert.equal(createQueryPlan('What is the weather nearby?').route.outOfScope, true);
  assert.equal(createQueryPlan('Where can I find Florida Housing homebuyer programs?').jurisdiction.needsJurisdiction, false);
});

test('conversation expansion can preserve the original resident question separately', () => {
  const plan = createQueryPlan('housing rent assistance. How much?', { originalQuery: 'How much?', jurisdictionId: 'tampa' });
  assert.equal(plan.originalQuery, 'How much?');
  assert.equal(plan.query, 'housing rent assistance. How much?');
  assert.equal(plan.subjectCategory, 'housing');
  assert.ok(plan.requestedFacts.includes('amount'));
});

test('known registry entities supply a missing subject without changing legacy text routing', () => {
  const sources = [{ source_id: 'new-program', title: 'Invented Housing Assistance Program (IHAP)', categories: ['housing', 'navigation'], jurisdiction_ids: ['tampa'] }];
  const question = 'Can I apply now for IHAP?';
  const legacy = routeQuestion(question, { jurisdictionId: 'tampa' });
  assert.equal(legacy.subjectCategory, 'navigation');
  const plan = createQueryPlan(question, { sources, jurisdictionId: 'tampa' });
  assert.equal(plan.intent, 'housing');
  assert.equal(plan.subjectCategory, 'housing');
  assert.equal(plan.route.category, 'housing');
  assert.ok(plan.requestedFacts.includes('application_status'));
  const navigation = createQueryPlan('Which agency handles IHAP?', { sources, jurisdictionId: 'tampa' });
  assert.equal(navigation.intent, 'navigation');
  assert.equal(navigation.subjectCategory, 'housing');
  assert.ok(navigation.requestedFacts.includes('contact'));
});

test('entity subject inference preserves explicit subjects, exclusions, and jurisdiction boundaries', () => {
  const resource = { source_id: 'new-program', title: 'Invented Housing Assistance Program (IHAP)', categories: ['housing'], jurisdiction_ids: ['tampa'] };
  for (const question of ['What is the weather for IHAP?', 'Can I apply for an electrical permit through IHAP?', 'Can I apply for IHAP in Orlando?']) {
    assert.deepEqual(createQueryPlan(question, { sources: [resource], jurisdictionId: 'tampa' }).route, routeQuestion(question, { jurisdictionId: 'tampa' }));
  }
  for (const source of [{ ...resource, jurisdiction_ids: ['clearwater'] }, { ...resource, jurisdiction_ids: undefined }]) {
    assert.equal(createQueryPlan('Can I apply for IHAP?', { sources: [source], jurisdictionId: 'tampa' }).subjectCategory, 'navigation');
  }
  const ambiguous = [resource, { ...resource, source_id: 'same-name-other-subject', categories: ['permitting'] }];
  assert.equal(createQueryPlan('Can I apply for IHAP?', { sources: ambiguous, jurisdictionId: 'tampa' }).subjectCategory, 'navigation');
  assert.equal(createQueryPlan('Can I apply for IHAP?', { sources: [{ ...resource, categories: ['housing', 'permitting'] }], jurisdictionId: 'tampa' }).subjectCategory, 'navigation');
});

test('an inferred property-related subject still requires geographic confirmation', () => {
  const sources = [{ source_id: 'new-permit-program', title: 'Invented Project Program (IPP)', categories: ['permitting'], jurisdiction_ids: ['tampa'] }];
  const plan = createQueryPlan('Can I apply for IPP at 123 Main Street?', { sources, jurisdictionId: 'tampa' });
  assert.equal(plan.subjectCategory, 'permitting');
  assert.equal(plan.geography.hasAddress, true);
  assert.equal(plan.geography.needsAddress, true);
  assert.equal(plan.route.needsAddress, true);
  assert.equal('coordinates' in plan.geography, false);
});

test('scoped entities recover missing lexical signals while explicit exclusions remain closed', () => {
  const resource = { source_id: 'new-program', title: 'Invented Housing Assistance Program (IHAP)', categories: ['housing'], jurisdiction_ids: ['tampa'] };
  const question = 'Is IHAP accepting applications?';
  const legacy = routeQuestion(question, { jurisdictionId: 'tampa' });
  assert.equal(legacy.outOfScope, true);
  assert.deepEqual(createQueryPlan(question, { jurisdictionId: 'tampa' }).route, legacy);
  const plan = createQueryPlan(question, { sources: [resource], jurisdictionId: 'tampa' });
  assert.equal(plan.subjectCategory, 'housing');
  assert.equal(plan.route.outOfScope, false);
  assert.ok(plan.requestedFacts.includes('application_status'));
  for (const excluded of ['What is the weather for IHAP?', 'Write a song about IHAP', 'Is IHAP accepting applications in Orlando?']) {
    assert.deepEqual(createQueryPlan(excluded, { sources: [resource], jurisdictionId: 'tampa' }).route, routeQuestion(excluded, { jurisdictionId: 'tampa' }));
  }
  for (const sources of [
    [{ ...resource, jurisdiction_ids: ['clearwater'] }],
    [{ ...resource, categories: ['housing', 'permitting'] }],
  ]) assert.deepEqual(createQueryPlan(question, { sources, jurisdictionId: 'tampa' }).route, legacy);
});
