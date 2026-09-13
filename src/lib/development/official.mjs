import { createJsonReader } from '../geospatial/remote.mjs';

const clean = (value, max = 400) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
function date(value) {
  return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).valueOf()) ? new Date(value).toISOString() : null;
}

/** Only reviewed config supplies endpoints, fields and jurisdictions; caller input supplies a bounded point/radius. */
export function createOfficialDevelopmentReader({ fetcher, settings, now }) {
  const options = settings.official_query ?? {};
  const readJson = createJsonReader({ fetcher, timeoutMs: settings.timeout_ms, maxBytes: options.max_response_bytes ?? 1000000, ttlMs: options.cache_ttl_ms ?? 300000, maxEntries: options.max_cache_entries ?? 64 });
  async function query(source, point, radiusMeters) {
    const records = [];
    const seen = new Set();
    let retrievedAt = null;
    const pageSize = options.page_size ?? 100;
    let truncated = false;
    let lastId = -1;
    try {
      for (let page = 0; page < (options.max_pages ?? 4); page++) {
        // A numeric object-ID cursor avoids duplicate/omitted records in legacy
        // spatial resultOffset paging. The ID originates only in validated source data.
        const params = new URLSearchParams({ where: `OBJECTID > ${lastId}`, geometry: `${point.longitude},${point.latitude}`, geometryType: 'esriGeometryPoint', inSR: '4326', distance: String(radiusMeters), units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields: source.fields.join(','), returnGeometry: 'false', orderByFields: 'OBJECTID ASC', resultOffset: '0', resultRecordCount: String(pageSize), f: 'json' });
        const response = await readJson(`${source.url}/query?${params}`);
        retrievedAt = response.retrievedAt;
        const data = response.data;
        if (!Array.isArray(data.features) || data.features.length > pageSize || data.features.some(feature => !feature.attributes || !/^\d+$/.test(String(feature.attributes.OBJECTID)) || source.fields.some(field => !(field in feature.attributes)))) throw new Error('The official layer schema changed.');
        let additions = 0;
        for (const feature of data.features) {
          const attributes = feature.attributes;
          const oid = String(attributes.OBJECTID);
          if (seen.has(oid) || !Number.isSafeInteger(Number(oid)) || Number(oid) <= lastId) throw new Error('The service repeated or reordered a page; completeness cannot be verified.');
          seen.add(oid);
          lastId = Number(oid);
          additions++;
          const fields = source.record;
          const sourceUrl = `${source.url}/query?${new URLSearchParams({ objectIds: oid, outFields: source.fields.join(','), returnGeometry: 'false', f: 'pjson' })}`;
          const recordDate = date(attributes[fields.date]);
          records.push({ id: `${source.source_id}:${oid}`, recordId: clean(attributes[fields.id]) || oid, address: clean(attributes[fields.address]), projectName: clean(attributes[fields.name]), description: fields.description ? clean(attributes[fields.description], 1200) : '', recordType: clean(attributes[fields.type]) || source.title, status: clean(attributes[fields.status]) || 'Status not supplied', activityStage: '', date: recordDate, dateType: recordDate ? fields.date_type : 'date not supplied', sourceSnapshotAt: null, sourceId: source.source_id, sourceUrl, originalSourceUrl: sourceUrl, sourceEndpoint: source.url, locationCount: null, sourceMemberships: source.title, distanceMeters: null, distanceBasis: 'project_polygon_intersects_radius', futureDated: !!recordDate && new Date(recordDate) > now() });
        }
        truncated = !!data.exceededTransferLimit;
        if (!truncated) break;
        if (!additions) throw new Error('An incomplete response cannot advance.');
      }
      return { sourceId: source.source_id, title: source.title, url: source.url, coverage: source.coverage, status: truncated ? 'incomplete' : 'available', records, retrievedAt, truncated };
    } catch {
      // Do not turn partially read pages into a complete or empty search result.
      return { sourceId: source.source_id, title: source.title, url: source.url, coverage: source.coverage, status: 'unavailable', records: [], retrievedAt: null, truncated: false };
    }
  }

  return async function getOfficialDevelopment(location, point, radiusMeters) {
    const sources = (settings.official_sources ?? []).filter(source => source.jurisdiction_id === location.jurisdictionId);
    if (!sources.length) return null;
    const services = await Promise.all(sources.map(source => query(source, point, radiusMeters)));
    const records = services.flatMap(service => service.records);
    const unavailable = services.some(service => service.status === 'unavailable');
    const incomplete = services.some(service => service.status === 'incomplete');
    const found = services.some(service => service.status !== 'unavailable');
    const grouped = new Map();
    for (const record of records) {
      if (!record.date || record.futureDated) continue;
      const key = `${record.date.slice(0, 4)}|${record.dateType}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    return {
      status: !found ? 'unavailable' : unavailable || incomplete ? 'partial' : records.length ? 'found' : 'not_found',
      message: !found ? 'Official city development layers could not be retrieved. Open the source to verify records.' : unavailable || incomplete ? 'Some official layers were unavailable or limited the result. Returned records are incomplete; try a smaller radius or inspect the official sources.' : records.length ? `${records.length} published project or planning-case areas intersect the ${radiusMeters}-meter search radius.` : 'No project or planning-case areas were returned by the configured official layers. Other development and permits may exist.',
      sourceId: `${location.jurisdictionId}-official-development`, sourceUrl: sources[0].url, title: sources.length === 1 ? sources[0].title : `${location.jurisdiction} development projects`, sourceSnapshotDate: null, authoritativeStatus: 'official city GIS records', commit: null, radiusMeters, distanceMethod: 'Official ArcGIS spatial query: published project polygons intersect a search radius in meters around the selected address. No numeric distance is assigned to a polygon.', coverage: sources.map(source => source.coverage).join(' '), jurisdictionId: location.jurisdictionId, boundaryChecks: location.boundaryChecks,
      warnings: [...(settings.official_limitations ?? [])], services: services.map(service => ({ sourceId: service.sourceId, title: service.title, url: service.url, coverage: service.coverage, status: service.status, retrievedAt: service.retrievedAt, truncated: service.truncated })), records: records.slice(0, settings.max_results), totalMatches: records.length, totalMatchesExact: !unavailable && !incomplete, truncated: incomplete || records.length > settings.max_results, retrievedAt: services.map(service => service.retrievedAt).filter(Boolean).sort().at(-1) ?? null,
      activityByYear: [...grouped.entries()].map(([key, count]) => ({ year: key.split('|')[0], dateType: key.split('|')[1], count })).sort((a, b) => b.year.localeCompare(a.year)),
    };
  };
}
