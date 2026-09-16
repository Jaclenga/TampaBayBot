import config from '../../../data/development-config.json' with { type: 'json' };
import { createGeospatialClient, haversineMeters, validPoint, withinServiceRegion } from '../geospatial/index.mjs';
import { fetchBoundedText } from '../geospatial/remote.mjs';
import { createOfficialDevelopmentReader } from './official.mjs';
import { csvRows } from '../csv.mjs';

const ACTIVITY_DATE_FIELDS = [
  ['status_date', 'source status date'],
  ['last_updated', 'source last-updated date'],
  ['record_created_date', 'source record-created date'],
];

/** RFC 4180-style CSV parsing, including quoted commas, newlines, and escaped quotes. */
export function parseCsv(text, { maxRows = 10000 } = {}) {
  if (typeof text !== 'string') throw new TypeError('CSV input must be text.');
  const rows = csvRows(text.replace(/^\uFEFF/, ''), { maxRows: maxRows + 1 });
  if (!rows.length) throw new Error('CSV has no header.');
  const headers = rows.shift();
  if (headers.some(h => !h || ['__proto__', 'prototype', 'constructor'].includes(h)) || new Set(headers).size !== headers.length) throw new Error('Invalid or duplicate CSV header.');
  return { headers, rows: rows.map(values => {
    if (values.length !== headers.length) throw new Error('CSV row does not match the header.');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  }) };
}

function clean(value, max = 300) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''; }

function publicSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const government = url.hostname === 'tampa.gov' || url.hostname.endsWith('.tampa.gov') || url.hostname === 'tampagov.net' || url.hostname.endsWith('.tampagov.net');
    const accelaTampa = url.hostname === 'aca-prod.accela.com' && /^\/TAMPA\//i.test(url.pathname);
    return government || accelaTampa ? url.href : null;
  } catch { return null; }
}

function sourceDate(value) {
  if (typeof value !== 'string') return null;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!parts) return null;
  const [year, month, day] = parts.slice(1).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? value : null;
}

function activityDate(row) {
  for (const [field, dateType] of ACTIVITY_DATE_FIELDS) {
    const date = sourceDate(row[field]);
    if (date) return { date, dateType };
  }
  return { date: null, dateType: 'date not supplied' };
}

export function normalizeDevelopmentCsv(text, settings = config) {
  const { rows, headers } = parseCsv(text, { maxRows: settings.max_rows });
  const required = ['activity_id', 'source_record_id', 'latitude', 'longitude', 'source_endpoint', 'source_url', 'retrieved_at_utc', 'address', 'record_type', 'status', 'status_date'];
  if (required.some(field => !headers.includes(field))) throw new Error('The upstream development CSV schema changed.');
  let excludedRows = 0;
  const seen = new Set();
  const records = rows.flatMap(row => {
    const id = clean(row.activity_id);
    const recordId = clean(row.source_record_id);
    const latitude = row.latitude?.trim() ? Number(row.latitude) : NaN;
    const longitude = row.longitude?.trim() ? Number(row.longitude) : NaN;
    const point = { latitude, longitude };
    const bounds = settings.record_bounds;
    const withinRecordBounds = validPoint(point) && point.latitude >= bounds.south && point.latitude <= bounds.north && point.longitude >= bounds.west && point.longitude <= bounds.east;
    if (!withinRecordBounds || !id || !recordId || seen.has(id)) { excludedRows++; return []; }
    seen.add(id);
    const sourceEndpoint = publicSourceUrl(row.source_endpoint);
    const originalSourceUrl = publicSourceUrl(row.source_url);
    return [{
      id, recordId, address: clean(row.address),
      projectName: clean(row.project_name), description: clean(row.description, 1200),
      recordType: clean(row.record_type) || clean(row.activity_class) || 'Type not supplied',
      status: clean(row.status) || 'Status not supplied', activityStage: clean(row.activity_stage),
      ...activityDate(row),
      sourceSnapshotAt: sourceDate(row.retrieved_at_utc),
      ...point, sourceId: settings.source_id,
      sourceUrl: `${settings.repository_url}/blob/${settings.commit}/${settings.csv_path}`,
      originalSourceUrl, sourceEndpoint,
      locationCount: /^\d+$/.test(row.location_count ?? '') ? Number(row.location_count) : null,
      sourceMemberships: clean(row.source_memberships),
    }];
  });
  return { records, inputRows: rows.length, excludedRows };
}

export function createDevelopmentClient({ fetcher = fetch, settings = config, now = () => new Date(), locateJurisdiction = createGeospatialClient({ fetcher }).getJurisdiction } = {}) {
  const getOfficialDevelopment = createOfficialDevelopmentReader({ fetcher, settings, now });
  let cache;
  let inFlight;
  async function loadSnapshot() {
    if (cache && cache.expiresAt > Date.now()) return cache.snapshot;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const response = await fetchBoundedText(settings.csv_url, { fetcher, timeoutMs: settings.timeout_ms, maxBytes: settings.max_response_bytes });
      if (settings.sha256) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(response.text));
        const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== settings.sha256) throw new Error('The development snapshot content hash did not match its pinned configuration.');
      }
      const snapshot = { ...normalizeDevelopmentCsv(response.text, settings), retrievedAt: response.retrievedAt };
      cache = { snapshot, expiresAt: Date.now() + settings.cache_ttl_ms };
      return snapshot;
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }

  async function getNearbyDevelopment(point, radiusMeters = settings.default_radius_meters) {
    const base = {
      sourceId: settings.source_id, sourceUrl: settings.repository_url, sourceSnapshotDate: settings.source_snapshot_date,
      authoritativeStatus: settings.authoritative_status, commit: settings.commit,
      radiusMeters, distanceMethod: 'Haversine great-circle distance in meters using mean Earth radius 6,371,008.8 m; record point to selected address point.',
      coverage: settings.coverage,
      warnings: [...settings.limitations],
    };
    const emptyResult = (status, message) => ({
      ...base, status, message, records: [], retrievedAt: null, totalMatches: 0, activityByYear: [],
    });
    if (!validPoint(point) || typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters) || radiusMeters < settings.min_radius_meters || radiusMeters > settings.max_radius_meters) {
      return emptyResult('invalid_input', `Select a location and a distance between ${settings.min_radius_meters} and ${settings.max_radius_meters} meters.`);
    }
    if (!withinServiceRegion(point)) return emptyResult('missing_coverage', 'This point is outside the supported Tampa Bay search area.');
    try {
      const location = await locateJurisdiction(point);
      base.jurisdictionId = location.jurisdictionId;
      base.boundaryChecks = location.boundaryChecks;
      if (location.status === 'verified' && location.jurisdictionId !== settings.jurisdiction_id) {
        const official = await getOfficialDevelopment(location, point, radiusMeters);
        if (official) return official;
        const fallback = settings.official_fallbacks?.[location.jurisdictionId];
        return {
          ...emptyResult('missing_coverage', 'No development-record adapter is configured for this jurisdiction. Use the responsible agency portal; a missing dataset does not mean no activity exists.'),
          sourceId: fallback?.source_id ?? '', sourceUrl: fallback?.url ?? '',
          title: fallback?.title ?? `${location.jurisdiction ?? location.jurisdictionId} development records`,
          authoritativeStatus: fallback ? 'official agency navigation' : 'no configured dataset',
          sourceSnapshotDate: null, commit: null, totalMatchesExact: false,
          distanceMethod: 'No spatial record query was performed.',
          coverage: `No development-record dataset is configured for ${location.jurisdiction ?? location.jurisdictionId}.`,
          warnings: ['A missing dataset does not mean no development or permit activity exists.'],
        };
      }
      if (location.status === 'missing_coverage' || (location.status === 'verified' && location.jurisdictionId !== settings.jurisdiction_id)) {
        return emptyResult('missing_coverage', 'This independent development snapshot covers the City of Tampa only. St. Petersburg, Clearwater and other Tampa Bay locations are not included.');
      }
      if (location.status !== 'verified') return emptyResult('unavailable', 'City of Tampa jurisdiction could not be confirmed. The development snapshot was not searched.');
      const snapshot = await loadSnapshot();
      const current = now();
      const snapshotAgeDays = Math.max(0, Math.floor((current.valueOf() - new Date(settings.source_snapshot_date).valueOf()) / 86400000));
      const stale = snapshotAgeDays > settings.snapshot_stale_after_days;
      if (stale) base.warnings.unshift(`The source snapshot is ${snapshotAgeDays} days old. Verify current status with the original agency.`);
      if (snapshot.excludedRows) base.warnings.push(`${snapshot.excludedRows} source rows had missing, out-of-area, or invalid coordinates or duplicate identifiers and could not be searched.`);
      const matches = snapshot.records.map(record => ({ ...record, distanceMeters: haversineMeters(point, record), futureDated: !!record.date && new Date(record.date) > current })).filter(record => record.distanceMeters <= radiusMeters).sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
      // Date groups describe source-reported status/update/create dates, not construction starts or snapshot history.
      const grouped = new Map();
      for (const record of matches) {
        if (!record.date || record.futureDated) continue;
        const key = `${record.date.slice(0, 4)}|${record.dateType}`;
        grouped.set(key, (grouped.get(key) ?? 0) + 1);
      }
      const activityByYear = [...grouped.entries()].map(([key, count]) => ({ year: key.split('|')[0], dateType: key.split('|')[1], count })).sort((a, b) => b.year.localeCompare(a.year) || a.dateType.localeCompare(b.dateType));
      return {
        ...base, status: stale ? 'potentially_outdated' : matches.length ? 'found' : 'not_found',
        message: matches.length ? `${matches.length} published activity record${matches.length === 1 ? '' : 's'} fall within ${radiusMeters} meters in the ${settings.source_snapshot_date} snapshot.` : 'No matching record points were found in this snapshot. Other records or activity may exist.',
        records: matches.slice(0, settings.max_results), totalMatches: matches.length,
        truncated: matches.length > settings.max_results, retrievedAt: snapshot.retrievedAt, snapshotAgeDays,
        inputRows: snapshot.inputRows, searchableRows: snapshot.records.length, excludedRows: snapshot.excludedRows, activityByYear,
      };
    } catch {
      return emptyResult('unavailable', 'The independent development-record snapshot could not be loaded or its format changed. Open the source project to review its published records.');
    }
  }
  return { getNearbyDevelopment };
}

export const getNearbyDevelopment = createDevelopmentClient().getNearbyDevelopment;
