import config from '../../data/gis-config.json' with { type: 'json' };
import { createJsonReader } from './remote.mjs';

export function validPoint(point) {
  return !!point && typeof point.latitude === 'number' && typeof point.longitude === 'number'
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180;
}

// This broad guard only rejects distant coordinates. The City polygon establishes coverage.
export function withinServiceRegion(point) {
  return validPoint(point) && point.latitude >= 27.55 && point.latitude <= 28.25
    && point.longitude >= -82.9 && point.longitude <= -82.0;
}

export function haversineMeters(a, b) {
  if (!validPoint(a) || !validPoint(b)) throw new TypeError('Valid numeric latitude and longitude are required.');
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

function cleanText(value, max = 200) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function dateFromEpoch(value) {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(new Date(value).valueOf()) ? new Date(value).toISOString() : null;
}

function recordFor(kind, attributes, layer, retrievedAt) {
  const a = attributes;
  const id = String(a.OBJECTID ?? '');
  const label = kind === 'parcel' ? cleanText(a.FOLIO) : kind === 'zoning' ? cleanText(a.ZONECLASS) : kind === 'futureLandUse' ? cleanText(a.FLUE) : cleanText(a.Municipality);
  const description = kind === 'zoning' ? cleanText(a.ZONEDESC) : kind === 'futureLandUse' ? cleanText(a.FLU_DESC) : kind === 'parcel' ? cleanText(a.SITE_ADDR) : 'City jurisdiction boundary';
  const sourceUrl = `${layer.url}/query?${new URLSearchParams({ objectIds: id, outFields: layer.fields.join(','), returnGeometry: 'false', f: 'pjson' })}`;
  return {
    id, label, description,
    parcelId: kind === 'parcel' ? cleanText(a.FOLIO) : null,
    pin: kind === 'parcel' ? cleanText(a.PIN) : null,
    address: kind === 'parcel' ? cleanText(a.SITE_ADDR) : null,
    sourceId: layer.source_id, sourceUrl, layerUrl: layer.url,
    retrievedAt, sourceUpdatedAt: dateFromEpoch(a.LASTUPDATE),
    attributes: Object.fromEntries(layer.fields.map(field => [field, a[field] ?? null])),
  };
}

export function createGeospatialClient({ fetcher = fetch, settings = config } = {}) {
  const readJson = createJsonReader({ fetcher, timeoutMs: settings.timeout_ms, maxBytes: settings.max_response_bytes, ttlMs: settings.cache_ttl_ms, maxEntries: settings.max_cache_entries });

  async function lookupAddress(address) {
    if (typeof address !== 'string' || address.trim().length < 5 || address.length > 200 || /[<>\u0000-\u001f]/.test(address) || !/\d/.test(address) || !/[a-z]/i.test(address)) {
      return { status: 'invalid_input', candidates: [], message: 'Enter a street number and street name, with a city or ZIP code if you know it.', retrievedAt: null };
    }
    const params = new URLSearchParams({ [settings.geocoder.single_line_field]: address.trim(), outSR: '4326', outFields: 'Match_addr,Addr_type', maxLocations: String(settings.geocoder.max_candidates), f: 'json' });
    try {
      const { data, retrievedAt } = await readJson(`${settings.geocoder.url}/findAddressCandidates?${params}`);
      if (!Array.isArray(data.candidates) || (data.spatialReference?.latestWkid ?? data.spatialReference?.wkid) !== 4326) throw new Error('Unexpected geocoder schema or coordinate system.');
      const seen = new Set();
      const candidates = data.candidates.flatMap(candidate => {
        const point = { latitude: candidate.location?.y, longitude: candidate.location?.x };
        const type = candidate.attributes?.Addr_type;
        if (!withinServiceRegion(point) || !Number.isFinite(candidate.score) || candidate.score < settings.geocoder.minimum_score || !['PointAddress', 'Subaddress'].includes(type) || !cleanText(candidate.address)) return [];
        const id = `${point.latitude.toFixed(7)},${point.longitude.toFixed(7)}:${cleanText(candidate.address)}`;
        if (seen.has(id)) return [];
        seen.add(id);
        return [{ id, address: cleanText(candidate.address), ...point, score: candidate.score, matchType: type, sourceId: settings.geocoder.source_id, sourceUrl: settings.geocoder.url, retrievedAt }];
      }).slice(0, settings.geocoder.max_candidates);
      return {
        status: candidates.length > 1 ? 'ambiguous_address' : candidates.length ? 'selection_required' : 'not_found', candidates, retrievedAt,
        message: candidates.length > 1 ? 'More than one address matched. Select the location you mean before viewing property information.' : candidates.length ? 'Check the matched address, then select it to look up this location.' : 'No reliable address-point match was found. Try the complete street address and ZIP code.',
      };
    } catch {
      return { status: 'unavailable', candidates: [], retrievedAt: null, message: 'The City address service could not be reached or returned an unreadable result. Try again or use the official Tampa map.' };
    }
  }

  async function queryLayer(kind, point) {
    const layer = settings.layers[kind];
    const params = new URLSearchParams({ geometry: `${point.longitude},${point.latitude}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: layer.fields.join(','), returnGeometry: 'false', resultRecordCount: '6', f: 'json' });
    const source = { sourceId: layer.source_id, sourceUrl: layer.url, agency: layer.agency, title: layer.title };
    try {
      const { data, retrievedAt } = await readJson(`${layer.url}/query?${params}`);
      if (!Array.isArray(data.features) || data.features.some(f => !f.attributes || f.attributes.OBJECTID == null)) throw new Error('Unexpected layer schema.');
      const records = data.features.slice(0, 6).map(feature => recordFor(kind, feature.attributes, layer, retrievedAt));
      // Missing mapped designations must not become empty successful answers.
      if (records.some(record => !record.label)) throw new Error('Required layer designation is missing.');
      return { ...source, status: data.exceededTransferLimit ? 'incomplete' : records.length > 1 ? 'ambiguous' : records.length ? 'found' : 'not_found', records, retrievedAt, message: records.length ? null : 'No intersecting feature was returned for this address point.' };
    } catch {
      return { ...source, status: 'unavailable', records: [], retrievedAt: null, message: `${layer.title} could not be retrieved. This does not mean the property has no designation.` };
    }
  }

  async function getPropertyContext(candidate) {
    const warnings = [
      'This lookup uses the selected address point. A parcel can cross mapped boundaries; confirm the whole property with the responsible agency.',
      'Mapped zoning and future land use do not establish permission to build or an official determination.',
    ];
    if (!validPoint(candidate) || typeof candidate.address !== 'string' || !cleanText(candidate.address)) {
      return { status: 'invalid_input', message: 'Select a matched address before looking up property information.', address: '', jurisdiction: 'Unverified', warnings, evidence: [] };
    }
    const base = { address: cleanText(candidate.address), latitude: candidate.latitude, longitude: candidate.longitude, warnings };
    if (!withinServiceRegion(candidate)) return { ...base, status: 'missing_coverage', message: 'This location is outside the Tampa area supported by this lookup.', jurisdiction: 'Outside supported area', evidence: [] };
    const [boundary, parcel] = await Promise.all([queryLayer('boundary', candidate), queryLayer('parcel', candidate)]);
    const boundaryVerified = boundary.status === 'found' && boundary.records[0]?.label.toLowerCase() === 'tampa';
    const noCoverage = boundary.status === 'not_found';
    const blockedLayer = kind => ({ status: noCoverage ? 'missing_coverage' : 'unavailable', records: [], sourceId: settings.layers[kind].source_id, sourceUrl: settings.layers[kind].url, title: settings.layers[kind].title, agency: settings.layers[kind].agency, retrievedAt: null, message: noCoverage ? 'This point is outside the mapped City of Tampa boundary. County or another city may handle land-use questions.' : 'City jurisdiction could not be confirmed, so a Tampa designation is not assigned.' });
    const [zoning, futureLandUse] = boundaryVerified ? await Promise.all([queryLayer('zoning', candidate), queryLayer('futureLandUse', candidate)]) : [blockedLayer('zoning'), blockedLayer('futureLandUse')];
    const results = [boundary, parcel, zoning, futureLandUse];
    const evidence = results.flatMap(layer => layer.records.map(record => ({ sourceId: record.sourceId, source_id: record.sourceId, title: layer.title, agency: layer.agency, url: record.sourceUrl, layerUrl: record.layerUrl, recordId: record.id, retrievedAt: record.retrievedAt, sourceUpdatedAt: record.sourceUpdatedAt, snippet: `${record.label}${record.description ? ` — ${record.description}` : ''}` })));
    if (parcel.status === 'ambiguous' || parcel.status === 'incomplete') warnings.push('Multiple parcels intersect this address point. No single parcel is selected; verify the parcel identifier with the Property Appraiser.');
    if ([zoning, futureLandUse].some(layer => layer.status === 'ambiguous' || layer.status === 'incomplete')) warnings.push('More than one mapped designation intersects this point. All returned matches are shown; official review is needed.');
    const status = noCoverage ? 'missing_coverage' : parcel.status === 'ambiguous' || parcel.status === 'incomplete' ? 'ambiguous_parcel' : results.every(layer => layer.status === 'found') ? 'found' : 'partial';
    return { ...base, status, message: status === 'found' ? 'Public map records were found at the selected address point.' : status === 'missing_coverage' ? 'The City boundary layer places this point outside Tampa. Use the responsible county or municipality for zoning.' : 'Some property information needs verification. Review the individual source results.', jurisdiction: boundaryVerified ? 'City of Tampa' : noCoverage ? 'Outside City of Tampa boundary' : 'Unverified', boundary, parcel, zoning, futureLandUse, evidence };
  }

  return { lookupAddress, getPropertyContext };
}

const defaultClient = createGeospatialClient();
export const lookupAddress = defaultClient.lookupAddress;
export const getPropertyContext = defaultClient.getPropertyContext;
