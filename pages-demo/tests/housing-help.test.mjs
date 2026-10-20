import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contactHref, filterHousingResources, resourceCopyText, resourceLinkNotice, resourceSourceStatus } from '../src/housing-help.ts';

const resources = JSON.parse(readFileSync(new URL('../src/housing-resources.json', import.meta.url), 'utf8')).resources;

test('contact links retain phone and text routing without accepting URI markup or extensions', () => {
  assert.equal(contactHref({ kind: 'phone', value: '911' }), 'tel:911');
  assert.equal(contactHref({ kind: 'phone', value: '(813) 247-7233' }), 'tel:8132477233');
  assert.equal(contactHref({ kind: 'text', value: '898211' }), 'sms:898211');
  assert.equal(contactHref({ kind: 'web', value: 'https://example.org/help' }), 'https://example.org/help');
  for (const value of ['tel:911', 'javascript:911', '911?body=hello', '911#oops', '911\n988', '(727) 842-8605 ext. 7', '1234567890123456']) {
    assert.equal(contactHref({ kind: 'phone', value }), null, value);
  }
  assert.equal(contactHref({ kind: 'web', value: 'javascript:alert(1)' }), null);
  assert.equal(contactHref({ kind: 'web', value: 'https://user:pass@example.org/' }), null);
});

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

test('copied resource details distinguish overdue content review from a link check', () => {
  const listing = resources.find(resource => resource.id === 'legal-bay-area');
  const staleDay = Date.parse(`${listing.verifiedAt}T00:00:00Z`) + ((listing.refreshDays ?? 90) + 1) * 86_400_000;
  const updatedLink = { ...listing, lastLinkCheckedAt: new Date(staleDay).toISOString(), linkStatus: 'ok' };
  assert.equal(resourceSourceStatus(updatedLink, staleDay), 'needs_recheck');
  assert.match(resourceCopyText(updatedLink, staleDay), /Review status: Review due/);
  assert.ok(resourceCopyText(updatedLink, staleDay).includes(`Resource information last reviewed: ${listing.verifiedAt}`));
  assert.doesNotMatch(resourceCopyText(updatedLink, staleDay), /link checked|link verified/i);
  assert.ok(filterHousingResources(resources, 'eviction', 'tampa').some(resource => resource.id === listing.id));
  const spanish = resourceCopyText(listing, staleDay, 'es');
  assert.match(spanish, /Estado de revisión: Necesita nueva revisión/);
  assert.match(spanish, /Información revisada por última vez:/);
  assert.doesNotMatch(spanish, /Review status:|Resource information last reviewed:|Availability status:/);
});

test('explicit next-review date controls review warning without advancing the review date', () => {
  const listing = resources.find(resource => resource.id === 'legal-bay-area');
  const withSchedule = { ...listing, verifiedAt: '2026-10-09', nextReviewAt: '2026-10-15', lastLinkCheckedAt: '2026-10-20T12:00:00Z', linkStatus: 'ok' };
  assert.equal(resourceSourceStatus(withSchedule, Date.parse('2026-10-15T23:59:59Z')), 'source_checked');
  assert.equal(resourceSourceStatus(withSchedule, Date.parse('2026-10-16T00:00:00Z')), 'needs_recheck');
  assert.equal(resourceSourceStatus({ ...withSchedule, refreshDays: 1, nextReviewAt: '2026-12-31' }, Date.parse('2026-10-11T00:00:00Z')), 'needs_recheck');
  assert.match(resourceCopyText(withSchedule, Date.parse('2026-10-16T00:00:00Z')), /Resource information last reviewed: 2026-10-09/);
});

test('link warnings stay separate from factual review and preserve known source issues in copied details', () => {
  const rmap = resources.find(resource => resource.id === 'housing-tampa-rmap');
  const today = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(resourceSourceStatus(rmap, today), 'source_checked');
  assert.equal(resourceLinkNotice({ linkStatus: 'ok' }), null);
  assert.equal(resourceLinkNotice({ linkStatus: 'redirect' }), 'redirect');
  assert.equal(resourceLinkNotice({ linkStatus: 'http_error' }), 'error');
  assert.equal(resourceLinkNotice({ linkStatus: 'rate_limited' }), 'inconclusive');
  const checkedLink = { ...rmap, linkStatus: 'ok', lastLinkCheckedAt: '2026-10-20T12:00:00Z' };
  assert.match(resourceCopyText(checkedLink, today), /Known source issues: .*conflicting help for existing leases/);
  assert.doesNotMatch(resourceCopyText(checkedLink, today), /link verified|link checked/i);
  const failedLink = { ...checkedLink, linkStatus: 'http_error' };
  assert.equal(resourceSourceStatus(failedLink, today), 'source_checked');
  assert.match(resourceCopyText(failedLink, today), /Automated link check: An official link returned an error/);
  assert.match(resourceCopyText(failedLink, today, 'es'), /Comprobación automática del enlace: Un enlace oficial devolvió un error/);
});
