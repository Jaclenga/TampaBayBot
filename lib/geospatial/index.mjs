import config from '../../data/gis-config.json' with { type: 'json' };
import { createJsonReader } from './remote.mjs';

export function validPoint(point) {
  return !!point && typeof point.latitude === 'number' && typeof point.longitude === 'number'
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180;
}

// A broad distance guard only. Municipal polygons, never this envelope, establish jurisdiction.
export function withinServiceRegion(point) {
  const bounds = config.region_bounds;
  return validPoint(point) && point.latitude >= bounds.south && point.latitude <= bounds.north
    && point.longitude >= bounds.west && point.longitude <= bounds.east;
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

function layerSource(layer) {
  return { sourceId: layer.source_id, sourceUrl: layer.url, agency: layer.agency, title: layer.title };
}

function recordFor(kind, attributes, layer, retrievedAt) {
  const fields = layer.record;
  const id = String(attributes.OBJECTID);
  const label = cleanText(attributes[fields.label]);
  const description = fields.description ? cleanText(attributes[fields.description]) : kind === 'boundary' ? 'City jurisdiction boundary' : '';
  const sourceUrl = `${layer.url}/query?${new URLSearchParams({ objectIds: id, outFields: layer.fields.join(','), returnGeometry: 'false', f: 'pjson' })}`;
  return {
    id, label, description,
    parcelId: kind === 'parcel' ? cleanText(attributes[fields.parcelId]) : null,
    pin: kind === 'parcel' && fields.pin ? cleanText(attributes[fields.pin]) : null,
    address: kind === 'parcel' && fields.address ? cleanText(attributes[fields.address]) : null,
    sourceId: layer.source_id, sourceUrl, layerUrl: layer.url,
    retrievedAt, sourceUpdatedAt: dateFromEpoch(attributes[fields.updatedAt]),
    attributes: Object.fromEntries(layer.fields.map(field => {
      const value = attributes[field];
      return [field, typeof value === 'string' ? cleanText(value, 400) : typeof value === 'number' && Number.isFinite(value) ? value : null];
    })),
  };
}

function evidenceFor(results) {
  return results.flatMap(layer => layer.records.map(record => ({ sourceId: record.sourceId, source_id: record.sourceId, title: layer.title, agency: layer.agency, url: record.sourceUrl, layerUrl: record.layerUrl, recordId: record.id, retrievedAt: record.retrievedAt, sourceUpdatedAt: record.sourceUpdatedAt, snippet: `${record.label}${record.description ? ` — ${record.description}` : ''}` })));
}

export function createGeospatialClient({ fetcher = fetch, settings = config } = {}) {
  const readJson = createJsonReader({ fetcher, timeoutMs: settings.timeout_ms, maxBytes: settings.max_response_bytes, ttlMs: settings.cache_ttl_ms, maxEntries: settings.max_cache_entries });
  const supportedJurisdictions = settings.jurisdictions.map(({ id, name }) => ({ id, name }));

  async function geocode(address, geocoder) {
    const source = { sourceId: geocoder.source_id, sourceUrl: geocoder.url, agency: geocoder.agency, coverage: geocoder.coverage };
    const params = new URLSearchParams({ [geocoder.single_line_field]: address.trim(), outSR: '4326', outFields: 'Match_addr,Addr_type', maxLocations: String(geocoder.max_candidates), f: 'json' });
    try {
      const { data, retrievedAt } = await readJson(`${geocoder.url}/findAddressCandidates?${params}`);
      if (!Array.isArray(data.candidates) || (data.spatialReference?.latestWkid ?? data.spatialReference?.wkid) !== 4326) throw new Error('Unexpected geocoder schema or coordinate system.');
      const candidates = data.candidates.slice(0, geocoder.max_candidates).flatMap(candidate => {
        const point = { latitude: candidate.location?.y, longitude: candidate.location?.x };
        const type = candidate.attributes?.Addr_type;
        const matchedAddress = cleanText(candidate.address);
        if (!withinServiceRegion(point) || !Number.isFinite(candidate.score) || candidate.score < geocoder.minimum_score || !['PointAddress', 'Subaddress'].includes(type) || !matchedAddress) return [];
        const id = `${point.latitude.toFixed(7)},${point.longitude.toFixed(7)}:${matchedAddress}`;
        return [{ id, address: matchedAddress, ...point, score: candidate.score, matchType: type, sourceId: geocoder.source_id, sourceUrl: geocoder.url, retrievedAt }];
      });
      return { ...source, status: 'available', candidates, retrievedAt };
    } catch {
      return { ...source, status: 'unavailable', candidates: [], retrievedAt: null };
    }
  }

  async function lookupAddress(address) {
    if (typeof address !== 'string' || address.trim().length < 5 || address.length > 200 || /[<>\u0000-\u001f]/.test(address) || !/\d/.test(address) || !/[a-z]/i.test(address)) {
      return { status: 'invalid_input', candidates: [], services: [], warnings: [], message: 'Enter a street number and street name, with a city or ZIP code if you know it.', retrievedAt: null };
    }
    const responses = await Promise.all(settings.geocoders.map(geocoder => geocode(address, geocoder)));
    const seen = new Set();
    const candidates = responses.flatMap(result => result.candidates).sort((a, b) => b.score - a.score).filter(candidate => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id); return true;
    }).slice(0, settings.max_candidates);
    const unavailable = responses.some(result => result.status === 'unavailable');
    const services = responses.map(result => ({ sourceId: result.sourceId, sourceUrl: result.sourceUrl, agency: result.agency, coverage: result.coverage, status: result.status, retrievedAt: result.retrievedAt }));
    const retrievedAt = responses.map(result => result.retrievedAt).filter(Boolean).sort().at(-1) ?? null;
    return {
      status: candidates.length > 1 ? 'ambiguous_address' : candidates.length ? 'selection_required' : unavailable ? 'unavailable' : 'not_found', candidates, services, retrievedAt,
      warnings: unavailable ? ['Some address services could not be checked. The available matches may be incomplete.'] : [],
      message: candidates.length > 1 ? 'More than one address matched. Select the location you mean before viewing property information.' : candidates.length ? 'Check the matched address, then select it to look up this location.' : unavailable ? 'An official address service could not be reached or returned an unreadable result. Try again or use the responsible city or county map.' : 'No reliable address-point match was found. Try the complete street address and ZIP code. Direct address lookup currently covers Hillsborough and Pinellas services; Pasco property lookup is not configured.',
    };
  }

  async function queryLayer(kind, point, layer) {
    const params = new URLSearchParams({ geometry: `${point.longitude},${point.latitude}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: layer.fields.join(','), returnGeometry: 'false', resultRecordCount: '6', f: 'json' });
    const source = layerSource(layer);
    try {
      const { data, retrievedAt } = await readJson(`${layer.url}/query?${params}`);
      if (!Array.isArray(data.features) || data.features.some(f => !f.attributes || !/^\d+$/.test(String(f.attributes.OBJECTID)))) throw new Error('Unexpected layer schema.');
      const records = data.features.slice(0, 6).map(feature => recordFor(kind, feature.attributes, layer, retrievedAt));
      if (records.some(record => !record.label)) throw new Error('Required layer designation is missing.');
      return { ...source, status: data.exceededTransferLimit || data.features.length > 6 ? 'incomplete' : records.length > 1 ? 'ambiguous' : records.length ? 'found' : 'not_found', records, retrievedAt, message: records.length ? null : 'No intersecting feature was returned for this address point.' };
    } catch {
      return { ...source, status: 'unavailable', records: [], retrievedAt: null, message: `${layer.title} could not be retrieved. This does not mean the property has no designation.` };
    }
  }

  async function getJurisdiction(point) {
    const base = { jurisdictionId: null, jurisdiction: 'Unverified', boundaryChecks: [], supportedJurisdictions };
    if (!validPoint(point)) return { ...base, status: 'invalid_input' };
    if (!withinServiceRegion(point)) return { ...base, status: 'missing_coverage', jurisdiction: 'Outside supported area' };
    const boundaryChecks = await Promise.all(settings.jurisdictions.map(async jurisdiction => {
      const result = await queryLayer('boundary', point, jurisdiction.layers.boundary);
      if (result.records.some(record => record.label.toLowerCase() !== jurisdiction.boundary_label.toLowerCase())) {
        return { ...result, jurisdictionId: jurisdiction.id, status: 'unavailable', records: [], message: 'The boundary service returned an unexpected municipality. Jurisdiction needs verification.' };
      }
      return { ...result, jurisdictionId: jurisdiction.id };
    }));
    const matches = boundaryChecks.filter(layer => layer.status === 'found');
    const uncertainIntersection = boundaryChecks.some(layer => ['ambiguous', 'incomplete'].includes(layer.status));
    if (matches.length === 1 && !uncertainIntersection) {
      const boundary = matches[0];
      const jurisdiction = settings.jurisdictions.find(item => item.id === boundary.jurisdictionId);
      return { ...base, status: 'verified', jurisdictionId: jurisdiction.id, jurisdiction: jurisdiction.name, boundary, boundaryChecks };
    }
    const noCoverage = boundaryChecks.every(layer => layer.status === 'not_found');
    return { ...base, status: noCoverage ? 'missing_coverage' : 'unverified', jurisdiction: noCoverage ? 'Outside configured municipal coverage' : 'Unverified', boundaryChecks };
  }

  async function getPropertyContext(candidate) {
    const warnings = [
      'This lookup uses the selected address point. A parcel can cross mapped boundaries; confirm the whole property with the responsible agency.',
      'Mapped zoning and future land use do not establish permission to build or an official determination.',
    ];
    if (!validPoint(candidate) || typeof candidate.address !== 'string' || !cleanText(candidate.address)) {
      return { status: 'invalid_input', message: 'Select a matched address before looking up property information.', address: '', jurisdiction: 'Unverified', jurisdictionId: null, warnings, evidence: [], coverage: { status: 'unverified', supportedJurisdictions } };
    }
    const located = await getJurisdiction(candidate);
    const { jurisdictionId, jurisdiction, boundaryChecks } = located;
    const coverage = { status: located.status, supportedJurisdictions };
    const base = { address: cleanText(candidate.address), latitude: candidate.latitude, longitude: candidate.longitude, warnings, jurisdictionId, jurisdiction, boundaryChecks, coverage };
    if (located.status !== 'verified') {
      const noCoverage = located.status === 'missing_coverage';
      const message = noCoverage ? 'Direct property lookup is configured for Tampa, St. Petersburg and Clearwater. This point is outside their mapped boundaries; contact the responsible municipality or county.' : 'Municipal jurisdiction could not be confirmed. No parcel or land-use designation is assigned; review the boundary source results.';
      const blocked = kind => ({ status: noCoverage ? 'missing_coverage' : 'unavailable', records: [], sourceId: '', sourceUrl: '', title: kind, agency: 'Responsible municipality or county', retrievedAt: null, message });
      return { ...base, status: noCoverage ? 'missing_coverage' : 'partial', message, parcel: blocked('Parcel'), zoning: blocked('Zoning'), futureLandUse: blocked('Future Land Use'), evidence: evidenceFor(boundaryChecks) };
    }
    const selected = settings.jurisdictions.find(item => item.id === jurisdictionId);
    const { boundary } = located;
    const [parcel, zoning, futureLandUse] = await Promise.all(['parcel', 'zoning', 'futureLandUse'].map(kind => queryLayer(kind, candidate, selected.layers[kind])));
    const results = [boundary, parcel, zoning, futureLandUse];
    const ambiguousParcel = parcel.status === 'ambiguous' || parcel.status === 'incomplete';
    if (ambiguousParcel) warnings.push('Multiple parcels intersect this address point. No single parcel is selected; verify the parcel identifier with the Property Appraiser.');
    if ([zoning, futureLandUse].some(layer => layer.status === 'ambiguous' || layer.status === 'incomplete')) warnings.push('More than one mapped designation intersects this point. All returned matches are shown; official review is needed.');
    if (parcel.status === 'found' && parcel.records[0].address && parcel.records[0].address.toLowerCase() !== base.address.toLowerCase()) warnings.push('The parcel site address differs from the selected address. This can happen on shared sites; confirm the parcel identifier before relying on it.');
    const status = ambiguousParcel ? 'ambiguous_parcel' : results.every(layer => layer.status === 'found') ? 'found' : 'partial';
    return { ...base, status, message: status === 'found' ? 'Public map records were found at the selected address point.' : 'Some property information needs verification. Review the individual source results.', boundary, parcel, zoning, futureLandUse, evidence: evidenceFor(results) };
  }

  return { lookupAddress, getJurisdiction, getPropertyContext };
}

const defaultClient = createGeospatialClient();
export const lookupAddress = defaultClient.lookupAddress;
export const getJurisdiction = defaultClient.getJurisdiction;
export const getPropertyContext = defaultClient.getPropertyContext;
