import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterHousingResources, resourceCopyText } from '../src/housing-help.ts';

const resources = JSON.parse(readFileSync(new URL('../src/housing-resources.json', import.meta.url), 'utf8')).resources;

test('housing filter scopes municipal programs while retaining statewide and national help', () => {
  const tampa = filterHousingResources(resources, 'eviction', 'tampa');
  const pasco = filterHousingResources(resources, 'eviction', 'pasco');
  assert.ok(!tampa.some(resource => resource.id === 'housing-tampa-rmap'), 'RMAP current city page covers move-in help, not existing-rent eviction prevention');
  assert.ok(filterHousingResources(resources, 'all', 'tampa').some(resource => resource.id === 'housing-tampa-rmap'));
  assert.ok(!pasco.some(resource => resource.id === 'housing-tampa-rmap'));
  assert.ok(pasco.some(resource => resource.id === 'court-pasco-eviction'));
  assert.ok(pasco.some(resource => resource.id === 'legal-florida-tenant-rights'));
  assert.ok(!pasco.some(resource => resource.id === 'court-pinellas-eviction'));
  const hillsborough = filterHousingResources(resources, 'all', 'hillsborough');
  assert.ok(!hillsborough.some(resource => resource.id === 'housing-tampa-rmap'), 'a county selection must not imply a city-only program covers the county');
  assert.ok(!hillsborough.some(resource => resource.id === 'unsafe-hillsborough-code'), 'a county selection must not imply an unincorporated-only office covers the county');
  assert.ok(filterHousingResources(resources, 'all', 'all').some(resource => resource.id === 'unsafe-hillsborough-code'));
});

test('fallback navigation uses only static records and preserves location limits when copied', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Fallback must not call an API or model'); };
  try {
    for (const category of ['eviction', 'homelessness', 'legal', 'emergency']) {
      assert.ok(filterHousingResources(resources, category, 'pinellas').length > 0, category);
    }
    const tampaProgram = resources.find(resource => resource.id === 'housing-tampa-rmap');
    assert.match(resourceCopyText(tampaProgram), /limited to tampa/);
    assert.match(resourceCopyText(tampaProgram), /https:\/\/www\.tampa\.gov/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('copied resource details flag expired source checks without removing the listing', () => {
  const listing = resources.find(resource => resource.id === 'legal-bay-area');
  const staleDay = Date.parse(`${listing.verifiedAt}T00:00:00Z`) + ((listing.refreshDays ?? 90) + 1) * 86_400_000;
  assert.match(resourceCopyText(listing, staleDay), /Source status: Needs recheck/);
  assert.ok(resourceCopyText(listing, staleDay).includes(`Last checked: ${listing.verifiedAt}`));
  assert.ok(filterHousingResources(resources, 'eviction', 'tampa').some(resource => resource.id === listing.id));
  const spanish = resourceCopyText(listing, staleDay, 'es');
  assert.match(spanish, /Estado de la fuente: Necesita nueva verificación/);
  assert.match(spanish, /Última comprobación:/);
  assert.doesNotMatch(spanish, /Source status:|Last checked:|Availability status:/);
});
