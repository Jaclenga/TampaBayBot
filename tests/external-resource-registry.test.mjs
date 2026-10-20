import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { operationalResourceRecords } from '../src/lib/ingestion/external-resource-registry.mjs';

const gisConfig = JSON.parse(readFileSync(new URL('../data/gis-config.json', import.meta.url), 'utf8'));
const developmentConfig = JSON.parse(readFileSync(new URL('../data/development-config.json', import.meta.url), 'utf8'));

test('normalizes authored GIS and development URLs as link-only operational records', () => {
  const before = JSON.stringify({ gisConfig, developmentConfig });
  const records = operationalResourceRecords({ gisConfig, developmentConfig });
  assert.equal(records.length, 28);
  assert.equal(new Set(records.map(item => item.resource_id)).size, records.length);
  assert.equal(new Set(records.map(item => item.official_url)).size, records.length);
  assert.equal(JSON.stringify({ gisConfig, developmentConfig }), before);
  for (const item of records) {
    assert.match(item.resource_id, /^[a-z0-9-]+$/);
    assert.equal(new URL(item.official_url).protocol, 'https:');
    assert.ok(item.organization);
    assert.ok(item.categories.length > 0);
    assert.ok(item.jurisdiction.length > 0);
    assert.equal(item.link_only, true);
    assert.equal(item.last_content_reviewed_at, null);
    assert.equal(item.review_status, 'needs_review');
    assert.equal(item.last_link_checked_at, null);
    assert.equal(item.link_status, 'not_checked');
    assert.deepEqual(item.links.map(link => link.url), [item.official_url]);
  }
  const csv = records.find(item => item.links[0].role === 'snapshot_csv');
  assert.equal(csv.authority, 'independent');
  assert.equal(csv.jurisdiction[0], 'tampa');
  assert.equal(csv.last_content_reviewed_at, null, 'configuration verified_at must not become factual review');
});

test('one shared Pinellas parcel endpoint retains both jurisdictions', () => {
  const records = operationalResourceRecords({ gisConfig, developmentConfig });
  const parcel = records.find(item => item.official_url ===
    'https://egis.pinellas.gov/gis/rest/services/PublicWebGIS/Parcels/MapServer/1');
  assert.deepEqual(parcel.jurisdiction, ['clearwater', 'st-petersburg']);
  assert.deepEqual(parcel.categories, ['property']);
  assert.equal(parcel.authority, 'official');
});

test('already monitored URLs can be excluded without changing source records', () => {
  const all = operationalResourceRecords({ gisConfig, developmentConfig });
  const existingUrls = new Set([all[0].official_url, all[1].official_url]);
  const reduced = operationalResourceRecords({ gisConfig, developmentConfig, existingUrls });
  assert.equal(reduced.length, all.length - 2);
  assert.ok(reduced.every(item => !existingUrls.has(item.official_url)));
});

test('invalid or insecure configured URLs fail before a network request', () => {
  const bad = structuredClone(gisConfig);
  bad.geocoders[0].url = 'http://example.org/geocode';
  assert.throws(() => operationalResourceRecords({ gisConfig: bad, developmentConfig }), /Invalid endpoint URL/);
  const missingId = structuredClone(developmentConfig);
  delete missingId.official_sources[0].source_id;
  assert.throws(() => operationalResourceRecords({ gisConfig, developmentConfig: missingId }), /Missing development official source ID/);
});
