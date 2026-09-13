import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeospatialClient } from '../src/lib/geospatial/index.mjs';
import { createDevelopmentClient } from '../src/lib/development/index.mjs';
import gis from '../data/gis-config.json' with { type: 'json' };
import development from '../data/development-config.json' with { type: 'json' };

// All records and polygons in this file are synthetic; only the reviewed field mappings are real.
const point = { latitude: 28.27, longitude: -82.67, address: '100 SYNTHETIC FIXTURE ST' };
const polygon = { rings: [[[-82.671, 28.269], [-82.671, 28.271], [-82.669, 28.271], [-82.669, 28.269], [-82.671, 28.269]]], spatialReference: { wkid: 4326 } };
const pasco = gis.jurisdictions.find(item => item.id === 'pasco');
const settings = { ...gis, jurisdictions: [pasco], geocoders: gis.geocoders.filter(item => item.id === 'pasco') };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

function propertyFetcher({ municipal = 'not_found', geometry = polygon, parcelCount = 1, transferLimit = false, calls = [] } = {}) {
  return async (url, request = {}) => {
    const parsed = new URL(url);
    const params = request.body ? new URLSearchParams(request.body) : parsed.searchParams;
    const kind = Object.entries(pasco.layers).find(([, layer]) => `${layer.url}/query` === parsed.origin + parsed.pathname)?.[0];
    assert.ok(kind, `Unexpected fixture endpoint: ${url}`);
    calls.push({ kind, method: request.method ?? 'GET', params });
    assert.doesNotMatch(params.get('outFields'), /OWNER|MAILING|EXEMPT/);
    if (kind === 'boundary') return json({ features: [{ attributes: { OBJECTID: 1 } }] });
    if (kind === 'municipalities') return municipal === 'unavailable' ? json({ error: { code: 503 } }) : json({ features: municipal === 'not_found' ? [] : [{ attributes: { OBJECTID: 2, CITYNAME: 'SYNTHETIC CITY', last_edited_date: null } }] });
    if (kind === 'parcel') return json({ spatialReference: { wkid: 4326 }, features: Array.from({ length: parcelCount }, (_, index) => ({ attributes: { OBJECTID: 3 + index, HPARCEL: `FIXTURE-PARCEL-${index}`, VPARCEL: 'FIXTURE PIN', SITE_ADDRESS: point.address, JURISDICTION_NAME: 'UNINCORPORATED PASCO COUNTY', LAST_UPDATE: null, OWNER: 'must not appear' }, geometry })) });
    if (kind === 'zoning') return json({ exceededTransferLimit: transferLimit, features: [{ attributes: { OBJECTID: 6, ZN_TYPE: 'FIXTURE-A', last_edited_date: null } }, ...(params.get('geometryType') === 'esriGeometryPolygon' ? [{ attributes: { OBJECTID: 7, ZN_TYPE: 'FIXTURE-B', last_edited_date: null } }] : [])] });
    return json({ features: [{ attributes: { OBJECTID: 8, FLU_CODE: 'FIXTURE-FLU', DESCRIPTION: 'Synthetic future land use', DATE_STAMP: null, last_edited_date: null } }] });
  };
}

test('Pasco address service returns selected official address points without assigning municipality from the mailing label', async () => {
  const client = createGeospatialClient({ settings, fetcher: async url => {
    assert.equal(new URL(url).origin, 'https://pascogis.pascocountyfl.net');
    return json({ spatialReference: { wkid: 4326 }, candidates: [{ address: point.address, score: 72, location: { x: point.longitude, y: point.latitude }, attributes: { Addr_type: 'PointAddress' } }] });
  } });
  const result = await client.lookupAddress(point.address);
  assert.equal(result.status, 'selection_required');
  assert.equal(result.candidates[0].sourceId, 'pasco-maps');
  assert.equal('jurisdictionId' in result.candidates[0], false);
});

test('full parcel polygon exposes a second zoning designation missed at the address point and uses bounded POST queries', async () => {
  const calls = [];
  const result = await createGeospatialClient({ settings, fetcher: propertyFetcher({ calls }) }).getPropertyContext(point);
  assert.equal(result.jurisdictionId, 'pasco');
  assert.equal(result.parcelAnalysis.scope, 'whole_parcel');
  assert.equal(result.parcelAnalysis.status, 'checked');
  assert.deepEqual(result.zoning.records.map(record => record.label), ['FIXTURE-A', 'FIXTURE-B']);
  assert.equal(result.zoning.status, 'ambiguous');
  assert.doesNotMatch(JSON.stringify(result), /must not appear|"rings"/);
  for (const call of calls.filter(call => ['municipalities', 'zoning', 'futureLandUse'].includes(call.kind))) {
    assert.equal(call.method, 'POST');
    assert.equal(call.params.get('geometryType'), 'esriGeometryPolygon');
    assert.deepEqual(JSON.parse(call.params.get('geometry')), polygon);
    assert.equal(call.params.get('resultRecordCount'), String(gis.max_layer_records));
  }
});

test('Pasco municipality intersections and outages preserve parcels and withhold county land-use assignments', async () => {
  for (const municipal of ['found', 'unavailable']) {
    const calls = [];
    const result = await createGeospatialClient({ settings, fetcher: propertyFetcher({ municipal, calls }) }).getPropertyContext(point);
    assert.equal(result.parcel.status, 'found');
    assert.equal(result.status, 'partial');
    assert.equal(result.zoning.records.length, 0);
    assert.equal(result.parcelAnalysis.status, 'incomplete');
    assert.equal(calls.some(call => ['zoning', 'futureLandUse'].includes(call.kind)), false);
  }
});

test('missing, wrong-SR, open and oversized parcel geometry explicitly fall back to point coverage', async () => {
  const invalid = [null, { ...polygon, spatialReference: { wkid: 3857 } }, { ...polygon, rings: [polygon.rings[0].slice(0, -1)] }, { ...polygon, rings: [Array.from({ length: 5001 }, () => polygon.rings[0][0])] }, { ...polygon, rings: polygon.rings.map(ring => ring.map(([x, y]) => [x + 0.01, y])) }, { ...polygon, rings: [[polygon.rings[0][0], polygon.rings[0][0], polygon.rings[0][0], polygon.rings[0][0]]] }];
  for (const geometry of invalid) {
    const result = await createGeospatialClient({ settings, fetcher: propertyFetcher({ geometry }) }).getPropertyContext(point);
    assert.equal(result.parcelAnalysis.scope, 'address_point');
    assert.equal(result.parcelAnalysis.status, 'not_checked');
    assert.equal(result.zoning.records.length, 1);
    assert.match(result.warnings.join(' '), /split zoning elsewhere.*not been checked/);
  }
});

test('ambiguous parcels never select the first polygon and source truncation never becomes complete analysis', async () => {
  const ambiguous = await createGeospatialClient({ settings, fetcher: propertyFetcher({ parcelCount: 2 }) }).getPropertyContext(point);
  assert.equal(ambiguous.status, 'ambiguous_parcel');
  assert.equal(ambiguous.parcelAnalysis.scope, 'address_point');
  const incomplete = await createGeospatialClient({ settings, fetcher: propertyFetcher({ transferLimit: true }) }).getPropertyContext(point);
  assert.equal(incomplete.zoning.status, 'incomplete');
  assert.equal(incomplete.parcelAnalysis.status, 'incomplete');
});

const official = development.official_sources.find(source => source.jurisdiction_id === 'clearwater');
const officialSettings = { ...development, official_sources: [official], official_query: { ...development.official_query, page_size: 2, max_pages: 2 } };
const locateJurisdiction = async () => ({ status: 'verified', jurisdictionId: 'clearwater', jurisdiction: 'City of Clearwater', boundaryChecks: [] });
const feature = oid => ({ attributes: { OBJECTID: oid, CASE_NUM: `SYNTHETIC-${oid}`, Ord_Num: 'FIXTURE', ORD_Date: Date.UTC(2020, 0, 1), Zoning_Old: null, New_Zoning: null, TYPE: 'FIXTURE', last_edited_date: null, OWNER: 'must not appear' } });

test('official Clearwater planning cases paginate, retain official provenance, and never invent polygon distance', async () => {
  const calls = [];
  const client = createDevelopmentClient({ settings: officialSettings, locateJurisdiction, now: () => new Date('2026-09-12'), fetcher: async url => {
    const params = new URL(url).searchParams;
    calls.push(url);
    assert.equal(params.get('distance'), '1000');
    assert.equal(params.get('units'), 'esriSRUnit_Meter');
    assert.equal(params.get('returnGeometry'), 'false');
    return json(params.get('where') === 'OBJECTID > -1' ? { features: [feature(1), feature(2)], exceededTransferLimit: true } : { features: [feature(3)] });
  } });
  const result = await client.getNearbyDevelopment({ latitude: 27.9675, longitude: -82.8014 }, 1000);
  assert.equal(result.status, 'found');
  assert.equal(result.totalMatches, 3);
  assert.equal(result.totalMatchesExact, true);
  assert.equal(result.sourceSnapshotDate, null);
  assert.equal(result.authoritativeStatus, 'official city GIS records');
  assert.ok(result.records.every(record => record.distanceMeters === null && record.sourceUrl.startsWith(official.url)));
  assert.doesNotMatch(JSON.stringify(result), /must not appear|"OWNER"/);
  assert.equal(result.activityByYear[0].dateType, 'ordinance date');
  await client.getNearbyDevelopment({ latitude: 27.9675, longitude: -82.8014 }, 1000);
  assert.equal(calls.length, 2, 'Identical pages use the bounded cache.');
});

test('official schema errors and repeated pages fail closed, while capped valid pages remain explicitly partial', async () => {
  for (const mode of ['schema', 'repeat', 'truncated']) {
    const client = createDevelopmentClient({ settings: officialSettings, locateJurisdiction, fetcher: async url => {
      const offset = Math.max(0, Number(new URL(url).searchParams.get('where').split(' > ')[1]));
      if (mode === 'schema') return json({ features: [{ attributes: { OBJECTID: 1 } }] });
      return json({ features: [feature(mode === 'repeat' ? 1 : offset + 1), feature(mode === 'repeat' ? 2 : offset + 2)], exceededTransferLimit: true });
    } });
    const result = await client.getNearbyDevelopment({ latitude: 27.9675, longitude: -82.8014 });
    assert.equal(result.status, mode === 'truncated' ? 'partial' : 'unavailable');
    assert.equal(result.totalMatchesExact, false);
    if (mode !== 'truncated') assert.equal(result.records.length, 0);
  }
});

test('unverified jurisdictions cannot query an official adapter or trust caller-supplied city IDs', async () => {
  let calls = 0;
  const client = createDevelopmentClient({ settings: officialSettings, locateJurisdiction: async () => ({ status: 'unverified', jurisdictionId: null, boundaryChecks: [] }), fetcher: async () => { calls++; throw new Error('Unexpected request'); } });
  const result = await client.getNearbyDevelopment({ latitude: 27.9675, longitude: -82.8014, jurisdictionId: 'clearwater' });
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 0);
});

test('Pasco development navigation retains its own provenance without implying a searched Tampa snapshot', async () => {
  let calls = 0;
  const client = createDevelopmentClient({
    locateJurisdiction: async () => ({ status: 'verified', jurisdictionId: 'pasco', jurisdiction: 'Pasco County', boundaryChecks: [] }),
    fetcher: async () => { calls++; throw new Error('No development dataset is configured for Pasco.'); },
  });
  const result = await client.getNearbyDevelopment(point);
  assert.equal(result.status, 'missing_coverage');
  assert.equal(result.sourceId, 'pasco-permits');
  assert.equal(result.sourceUrl, development.official_fallbacks.pasco.url);
  assert.equal(result.authoritativeStatus, 'official agency navigation');
  assert.equal(result.sourceSnapshotDate, null);
  assert.equal(result.commit, null);
  assert.equal(result.retrievedAt, null);
  assert.equal(result.totalMatchesExact, false);
  assert.match(result.coverage, /Pasco County/);
  assert.match(result.distanceMethod, /No spatial record query/);
  assert.doesNotMatch(JSON.stringify(result), /Tampa|Haversine|independent snapshot/);
  assert.deepEqual(result.records, []);
  assert.equal(calls, 0);
});

test('St Petersburg distinguishes one available district from complete service outages', async () => {
  const sources = development.official_sources.filter(source => source.jurisdiction_id === 'st-petersburg');
  for (const available of [true, false]) {
    const calls = [];
    const client = createDevelopmentClient({
      locateJurisdiction: async () => ({ status: 'verified', jurisdictionId: 'st-petersburg', jurisdiction: 'City of St. Petersburg', boundaryChecks: [] }),
      fetcher: async url => {
        calls.push(url);
        return available && String(url).startsWith(sources[0].url + '/query?')
          ? json({ features: [] })
          : json({ error: { code: 400, message: 'Synthetic upstream outage' } });
      },
    });
    const result = await client.getNearbyDevelopment({ latitude: 27.7732, longitude: -82.6398 });
    assert.equal(result.status, available ? 'partial' : 'unavailable');
    assert.equal(result.totalMatchesExact, false);
    assert.equal(result.services.filter(service => service.status === 'unavailable').length, available ? 2 : 3);
    assert.deepEqual(result.records, []);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(url => sources.some(source => String(url).startsWith(source.url + '/query?'))));
  }
});
