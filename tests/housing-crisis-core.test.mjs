import test from 'node:test';
import assert from 'node:assert/strict';
import directory from '../pages-demo/src/housing-resources.json' with { type: 'json' };
import { answerResidentQuestion } from '../src/lib/core/resident.mjs';
import { buildCrisisPlan, inferCrisisInput, selectCrisisResources, triageHousingCrisis } from '../src/lib/housing/crisis.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const resources = directory.resources;

test('no safe sleep tonight is an emergency shelter referral, not an automatic police referral', () => {
  const triage = triageHousingCrisis({ situation: 'homelessness', location: 'tampa', timeframe: 'tonight' });
  assert.equal(triage.urgency, 'emergency');
  assert.equal(triage.dangerKind, 'unsafe_sleep');
  assert.equal(triage.referralPath, 'shelter_intake');
  const plan = buildCrisisPlan({ situation: 'homelessness', location: 'tampa', timeframe: 'tonight' }, resources, { now });
  assert.ok(plan.resources.some(item => item.id === 'homeless-hillsborough-211'));
  assert.ok(!plan.resources.some(item => item.id === 'emergency-911'));
  assert.match(plan.humanAssistance, /not a bed reservation/i);
});

test('physical danger and domestic violence use distinct human referral paths', () => {
  const violence = triageHousingCrisis({ situation: 'domestic_violence', safe: 'no', location: 'pinellas' });
  assert.equal(violence.urgency, 'emergency');
  assert.equal(violence.referralPath, 'dv_advocate');
  const plan = buildCrisisPlan({ situation: 'domestic_violence', safe: 'no', location: 'pinellas' }, resources, { now });
  assert.equal(plan.resources[0].id, 'emergency-casa');
  assert.ok(!plan.resources.some(item => item.id === 'emergency-911'));
  const danger = buildCrisisPlan({ situation: 'domestic_violence', physicalDanger: true, location: 'pinellas' }, resources, { now });
  assert.equal(danger.referralPath, 'emergency_services');
  assert.equal(danger.resources[0].id, 'emergency-911');
});

test('a court summons is urgent without inventing a legal deadline', () => {
  const plan = buildCrisisPlan({ situation: 'eviction', location: 'tampa', noticeStage: 'court_summons' }, resources, { now });
  assert.equal(plan.urgency, 'urgent');
  assert.equal(plan.referralPath, 'legal_aid');
  assert.match(plan.immediatePriority, /summons.*court papers/i);
  assert.match(plan.deadline, /exact instructions and date/);
  assert.doesNotMatch(JSON.stringify(plan), /\b(?:3|5|7|30) days?\b/i);
  assert.ok(plan.resources.some(item => item.id === 'legal-bay-area'));
  assert.ok(plan.resources.some(item => item.id === 'court-hillsborough-eviction'));
  assert.ok(!plan.resources.some(item => item.id === 'housing-tampa-rmap'));
  assert.ok(plan.sources.every(source => source.url.startsWith('https://') && source.verifiedAt));
});

test('a landlord warning and a summons remain separate document stages', () => {
  const warning = buildCrisisPlan({ situation: 'eviction', location: 'pasco', noticeStage: 'informal_warning' }, resources, { now });
  const summons = buildCrisisPlan({ situation: 'eviction', location: 'pasco', noticeStage: 'court_summons' }, resources, { now });
  assert.equal(warning.urgency, 'standard');
  assert.equal(summons.urgency, 'urgent');
  assert.match(warning.immediatePriority, /warning/);
  assert.match(summons.immediatePriority, /summons/);
  const order = buildCrisisPlan({ situation: 'eviction', location: 'pasco', noticeStage: 'judgment_or_possession' }, resources, { now });
  assert.match(order.deadline, /court order/);
  assert.doesNotMatch(order.deadline, /response deadline/);
});

test('geographic matching excludes city-only services outside that city', () => {
  const pasco = selectCrisisResources({ situation: 'eviction', location: 'pasco' }, resources, { now });
  assert.ok(pasco.some(item => item.id === 'court-pasco-eviction'));
  assert.ok(!pasco.some(item => item.id === 'court-hillsborough-eviction'));
  const tampa = selectCrisisResources({ situation: 'homelessness', location: 'tampa' }, resources, { now });
  assert.ok(tampa.some(item => item.id === 'homeless-tampa-hope'));
  const clearwater = selectCrisisResources({ situation: 'homelessness', location: 'clearwater' }, resources, { now });
  assert.ok(!clearwater.some(item => item.id === 'homeless-tampa-hope'));
  const countyUnsafe = buildCrisisPlan({ situation: 'unsafe_housing', location: 'hillsborough' }, resources, { now });
  assert.ok(!countyUnsafe.resources.some(item => item.id === 'unsafe-hillsborough-code'));
  assert.ok(countyUnsafe.resources.some(item => item.id === 'legal-bay-area'));
  assert.ok(countyUnsafe.notes.some(note => /city limits or an unincorporated area/.test(note)));
  const tampaUnsafe = buildCrisisPlan({ situation: 'unsafe_housing', location: 'tampa' }, resources, { now });
  assert.ok(!tampaUnsafe.resources.some(item => item.id === 'unsafe-hillsborough-code'));
  assert.ok(tampaUnsafe.resources.some(item => item.id === 'unsafe-tampa-code'));
});

test('unknown county still offers geographically labeled crisis contacts without inferring eligibility', () => {
  const violence = buildCrisisPlan({ situation: 'domestic_violence', location: 'all' }, resources, { now });
  assert.deepEqual(new Set(violence.resources.filter(item => item.id.startsWith('emergency-')).map(item => item.id)),
    new Set(['emergency-spring', 'emergency-casa', 'emergency-sunrise']));
  assert.ok(violence.notes.some(note => /different areas/.test(note)));
  const utilities = buildCrisisPlan({ situation: 'utilities', location: 'all' }, resources, { now });
  assert.deepEqual(new Set(utilities.resources.filter(item => item.id.endsWith('-energy')).map(item => item.geography[0])),
    new Set(['hillsborough', 'pinellas', 'pasco']));
  const rent = buildCrisisPlan({ situation: 'rent', location: 'all' }, resources, { now });
  assert.ok(['hillsborough', 'pinellas', 'pasco'].every(county => rent.resources.some(item => item.geography.includes(county))));
  assert.ok([...violence.resources, ...utilities.resources, ...rent.resources].every(item => !item.municipalities?.length));
});

test('expired local safety contacts remain clearly marked as needing recheck when no fresh direct contact exists', () => {
  const plan = buildCrisisPlan({ situation: 'domestic_violence', location: 'tampa' }, resources,
    { now: new Date('2026-11-10T12:00:00Z') });
  assert.equal(plan.resources[0].id, 'emergency-spring');
  assert.equal(plan.resources[0].verificationStatus, 'needs_recheck');
  assert.equal(plan.resources[0].verifiedAt, '2026-10-09');
  assert.ok(plan.notes.some(note => /need rechecking/.test(note)));
  assert.ok(plan.sources.some(source => source.url === plan.resources[0].sourceUrl));
  const closed = resources.map(item => item.id === 'emergency-spring' ? { ...item, availabilityStatus: 'temporarily_closed' } : item);
  assert.ok(!buildCrisisPlan({ situation: 'domestic_violence', location: 'tampa' }, closed,
    { now: new Date('2026-11-10T12:00:00Z') }).resources.some(item => item.id === 'emergency-spring'));
  const partialFresh = resources.map(item => item.id === 'emergency-spring' ? { ...item, verifiedAt: '2026-11-09' } : item);
  const unknownArea = buildCrisisPlan({ situation: 'domestic_violence', location: 'all' }, partialFresh,
    { now: new Date('2026-11-10T12:00:00Z') });
  assert.equal(unknownArea.resources.find(item => item.id === 'emergency-spring').verificationStatus, 'source_checked');
  assert.equal(unknownArea.resources.find(item => item.id === 'emergency-casa').verificationStatus, 'needs_recheck');
  assert.equal(unknownArea.resources.find(item => item.id === 'emergency-sunrise').verificationStatus, 'needs_recheck');
});

test('unrelated hidden notice stages cannot change other housing plans', () => {
  const input = { situation: 'affordable_housing', location: 'tampa' };
  const ordinary = buildCrisisPlan(input, resources, { now });
  const previousEvictionStage = buildCrisisPlan({ ...input, noticeStage: 'court_summons' }, resources, { now });
  assert.equal(previousEvictionStage.urgency, ordinary.urgency);
  assert.equal(previousEvictionStage.deadline, ordinary.deadline);
  assert.equal(previousEvictionStage.input.noticeStage, 'unknown');
});

test('stale, closed, unavailable, and unsafe-link resources are excluded from recommendations', () => {
  const example = resources.find(item => item.id === 'legal-bay-area');
  const fixtures = [
    { ...example, id: 'stale', verifiedAt: '2025-01-01' },
    { ...example, id: 'closed', availabilityStatus: 'temporarily_closed' },
    { ...example, id: 'unverified', verificationStatus: 'needs_recheck' },
    { ...example, id: 'unsafe-url', url: 'javascript:alert(1)' },
    { ...example, id: 'fresh' },
  ];
  const selected = selectCrisisResources({ situation: 'eviction', location: 'tampa' }, fixtures, { now });
  assert.deepEqual(selected.map(item => item.id), ['fresh']);
});

test('Spanish plan copy is authored navigation; official names and links stay unchanged', () => {
  const plan = buildCrisisPlan({ situation: 'eviction', location: 'tampa', noticeStage: 'court_summons' }, resources, { now, locale: 'es' });
  assert.equal(plan.language, 'es');
  assert.match(plan.immediatePriority, /citación|documentos judiciales/i);
  assert.match(plan.deadline, /plazo/);
  assert.ok(plan.resources.some(item => item.organization === 'Bay Area Legal Services'));
  assert.ok(plan.sources.every(source => source.url.startsWith('https://')));
});

test('chat attaches a plan with an empty RAG corpus while preserving RAG status and evidence', async () => {
  const question = "I'm in Tampa, I received an eviction summons, I have very little money, and I'm worried about losing my apartment. What should I do?";
  const response = await answerResidentQuestion(question, {
    sources: [], chunks: [], jurisdictionId: 'tampa', now,
    config: { valid: true, enabled: false, provider: 'none' },
  });
  assert.equal(response.status, 'insufficient_evidence');
  assert.deepEqual(response.evidence, []);
  assert.equal(response.crisisPlan.urgency, 'urgent');
  assert.ok(response.crisisPlan.resources.some(item => item.id === 'legal-bay-area'));
  assert.ok(response.crisisPlan.resources.some(item => item.id === 'court-hillsborough-eviction'));
  assert.ok(response.crisisPlan.resources.some(item => item.id === 'homeless-hillsborough-211'));
  assert.ok(!response.crisisPlan.resources.some(item => item.id === 'housing-tampa-rmap'));
  const spanish = await answerResidentQuestion(question, {
    sources: [], chunks: [], jurisdictionId: 'tampa', now, locale: 'es',
    config: { valid: true, enabled: false, provider: 'none' },
  });
  assert.equal(spanish.crisisPlan.language, 'es');
  assert.match(spanish.crisisPlan.immediatePriority, /citación/i);
});

test('chat plan follows resolved geography and withholds mismatched local referrals', async () => {
  const question = 'I am in Tampa and received an eviction summons';
  const common = { sources: [], chunks: [], now, config: { valid: true, enabled: false, provider: 'none' } };
  const detected = await answerResidentQuestion(question, { ...common, jurisdictionId: 'tampa-bay' });
  assert.equal(detected.crisisPlan.input.location, 'tampa');
  assert.ok(detected.crisisPlan.resources.some(item => item.id === 'court-hillsborough-eviction'));
  const mismatch = await answerResidentQuestion(question, { ...common, jurisdictionId: 'pinellas-county' });
  assert.equal(mismatch.status, 'needs_jurisdiction');
  assert.equal(mismatch.crisisPlan.input.location, 'all');
  assert.ok(!mismatch.crisisPlan.resources.some(item => item.id.startsWith('court-')));
});

test('chat crisis inference does not turn a landlord request into tenant triage', () => {
  assert.equal(inferCrisisInput('I am a landlord. How can I evict my tenant?', { jurisdictionId: 'tampa' }), null);
  assert.equal(inferCrisisInput("I'm a landlord. How do I evict my tenant?", { jurisdictionId: 'tampa' }), null);
  assert.equal(inferCrisisInput('What is zoning for this parcel?', { jurisdictionId: 'tampa' }), null);
  assert.equal(inferCrisisInput('I received a summons for eviction', { jurisdictionId: 'tampa' }).noticeStage, 'court_summons');
  assert.equal(inferCrisisInput('Is my home in a flood zone?', { jurisdictionId: 'tampa' }), null);
  assert.equal(inferCrisisInput('I will be homeless tomorrow', { jurisdictionId: 'tampa' }).situation, 'imminent_homelessness');
  assert.equal(inferCrisisInput('Recibí una citación de desalojo en Tampa', { jurisdictionId: 'tampa' }).noticeStage, 'court_summons');
  const attack = inferCrisisInput('My partner is attacking me and I need somewhere to go', { jurisdictionId: 'pinellas-county' });
  assert.equal(attack.situation, 'domestic_violence');
  assert.equal(attack.physicalDanger, true);
});

test('Spanish immediate danger and same-night shelter requests receive emergency guidance', () => {
  const violence = inferCrisisInput('Mi pareja me golpea ahora y necesito refugio', { jurisdictionId: 'tampa' });
  assert.equal(violence.situation, 'domestic_violence');
  assert.equal(violence.physicalDanger, true);
  const plan = buildCrisisPlan(violence, resources, { now, locale: 'es' });
  assert.equal(plan.urgency, 'emergency');
  assert.equal(plan.referralPath, 'emergency_services');
  assert.match(plan.immediatePriority, /911/);
  for (const question of ['No tengo donde dormir esta noche', 'Necesito un refugio esta noche en Tampa']) {
    const input = inferCrisisInput(question, { jurisdictionId: 'tampa' });
    assert.equal(input.situation, 'homelessness', question);
    assert.equal(input.noSafePlaceTonight, true, question);
    assert.equal(triageHousingCrisis(input).urgency, 'emergency', question);
  }
});

test('negated and historical details do not create current eviction or physical-danger plans', () => {
  const rent = inferCrisisInput('I have no eviction notice, but I need rental assistance', { jurisdictionId: 'tampa' });
  assert.equal(rent.situation, 'rent');
  assert.equal(rent.noticeStage, 'none');
  assert.equal(inferCrisisInput('I was evicted five years ago. What zoning applies to my property in Tampa?',
    { jurisdictionId: 'tampa' }), null);
  assert.equal(inferCrisisInput('What is the eviction rate in Tampa?', { jurisdictionId: 'tampa' }), null);
  const affordable = inferCrisisInput('I had a gas leak last year and now need a cheaper apartment',
    { jurisdictionId: 'tampa' });
  assert.equal(affordable.situation, 'affordable_housing');
  assert.equal(affordable.physicalDanger, false);
  assert.equal(affordable.timeframe, 'unknown');
});

test('an RMAP arrears question flags source conflict without recommending move-in assistance', () => {
  const input = inferCrisisInput('Can RMAP pay my back rent on my existing lease?', { jurisdictionId: 'tampa' });
  assert.equal(input.situation, 'rent');
  const plan = buildCrisisPlan(input, resources, { now });
  assert.ok(!plan.resources.some(item => item.id === 'housing-tampa-rmap'));
  assert.ok(plan.notes.some(note => /RMAP page and its linked portal/.test(note)));
  assert.ok(plan.sources.some(source => source.url === resources.find(item => item.id === 'housing-tampa-rmap').sourceUrl));
});

test('rent plan prioritizes a verified assistance inquiry channel without promising funds', () => {
  const plan = buildCrisisPlan({ situation: 'rent', location: 'tampa' }, resources, { now });
  assert.equal(plan.resources[0].id, 'housing-hillsborough-metro-financial');
  assert.ok(plan.resources[0].availabilityStatus === 'unknown');
  assert.ok(!plan.resources.some(item => item.id === 'housing-tampa-rmap'));
  assert.match(plan.notes.join(' '), /no bed, funding, or placement is promised/i);
});
