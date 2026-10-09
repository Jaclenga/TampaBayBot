import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const directory = JSON.parse(readFileSync(new URL('../src/housing-resources.json', import.meta.url), 'utf8'));
const resources = directory.resources;
const situations = new Set([
  'eviction', 'rent', 'imminent_homelessness', 'homelessness',
  'unsafe_housing', 'utilities', 'domestic_violence', 'disaster',
  'affordable_housing',
]);
const categories = new Set(['eviction', 'homelessness', 'legal', 'emergency']);
const areas = new Set(['national', 'florida', 'hillsborough', 'pinellas', 'pasco']);
const statuses = new Set(['source_checked', 'needs_recheck', 'source_unavailable']);
const availability = new Set(['unknown', 'confirmed_open', 'temporarily_closed', 'discontinued']);
const url = value => {
  assert.equal(typeof value, 'string');
  assert.equal(new URL(value).protocol, 'https:');
};

test('static resource records have explicit source-check and availability metadata', () => {
  assert.ok(resources.length >= 30);
  assert.equal(new Set(resources.map(resource => resource.id)).size, resources.length);
  for (const resource of resources) {
    assert.match(resource.id, /^[a-z0-9-]+$/);
    for (const field of ['organization', 'program', 'description', 'eligibility', 'availability']) {
      assert.ok(typeof resource[field] === 'string' && resource[field].trim(), resource.id + ': ' + field);
    }
    assert.ok(resource.categories.length && resource.categories.every(value => categories.has(value)), resource.id);
    assert.ok(resource.crisisCategories.length && resource.crisisCategories.every(value => situations.has(value)), resource.id);
    assert.ok(resource.geography.length && resource.geography.every(value => areas.has(value)), resource.id);
    assert.ok(resource.contacts.length && resource.contacts.every(contact => contact.label && contact.value && ['phone', 'text', 'web'].includes(contact.kind)), resource.id);
    assert.ok(statuses.has(resource.verificationStatus), resource.id);
    assert.ok(availability.has(resource.availabilityStatus), resource.id);
    assert.ok(Number.isInteger(resource.refreshDays) && resource.refreshDays >= 1 && resource.refreshDays <= 90, resource.id);
    assert.ok(Array.isArray(resource.restrictions), resource.id);
    assert.match(resource.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(resource.verifiedAt)), resource.id);
    url(resource.url);
    url(resource.sourceUrl);
    if (resource.intakeUrl) url(resource.intakeUrl);
  }
});

test('every crisis topic has a local route in each county without claiming capacity', () => {
  const local = area => resources.filter(resource => resource.geography.includes(area));
  for (const area of ['hillsborough', 'pinellas', 'pasco']) {
    const records = local(area);
    for (const situation of ['eviction', 'homelessness', 'unsafe_housing', 'utilities', 'domestic_violence']) {
      assert.ok(records.some(resource => resource.crisisCategories.includes(situation)), area + ': ' + situation);
    }
  }
  assert.ok(resources.some(resource => resource.crisisCategories.includes('affordable_housing') && resource.geography.includes('florida')));
  assert.ok(resources.some(resource => resource.crisisCategories.includes('disaster') && resource.geography.includes('national')));
  for (const resource of resources) {
    if (/shelter|rent|energy|financial|housing|fema/i.test(resource.program)) {
      assert.equal(resource.availabilityStatus, 'unknown', resource.id);
    }
  }
});

test('RMAP source conflict cannot be offered as an eviction or rent-arrears route', () => {
  const resource = resources.find(item => item.id === 'housing-tampa-rmap');
  assert.ok(resource);
  assert.ok(!resource.categories.includes('eviction'));
  assert.ok(!resource.crisisCategories.includes('eviction'));
  assert.ok(!resource.crisisCategories.includes('rent'));
  assert.ok(resource.restrictions.some(value => /conflict/i.test(value)));
  assert.equal(resource.intakeUrl, undefined);
});

test('county mobile outreach and financial orientation are described without a capacity promise', () => {
  const mobile = resources.find(resource => resource.id === 'homeless-metro-mobile-outreach');
  assert.ok(mobile);
  assert.deepEqual(mobile.geography, ['hillsborough', 'pinellas', 'pasco']);
  assert.equal(mobile.contacts.length, 3);
  assert.ok(mobile.crisisCategories.includes('homelessness'));
  assert.equal(mobile.availabilityStatus, 'unknown');
  const pinellas = resources.find(resource => resource.id === 'housing-pinellas-metro-financial');
  assert.ok(pinellas.restrictions.some(value => /fridays at noon, in english/i.test(value)));
  assert.equal(pinellas.serviceHours, undefined);
});

test('unsafe-housing entries disclose code-jurisdiction and complaint privacy limits', () => {
  const code = resources.filter(resource => resource.id.startsWith('unsafe-'));
  assert.equal(code.length, 4);
  assert.ok(code.every(resource => resource.crisisCategories.includes('unsafe_housing')));
  assert.ok(code.every(resource => resource.restrictions.some(value => /public record|privacy|confidential/i.test(value))));
  assert.deepEqual(resources.find(resource => resource.id === 'unsafe-tampa-code').municipalities, ['tampa']);
  assert.deepEqual(resources.find(resource => resource.id === 'unsafe-hillsborough-code').municipalities, ['unincorporated-hillsborough']);
});
