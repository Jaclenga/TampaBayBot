/**
 * Normalize authored GIS and development configuration URLs for link monitoring.
 * These records describe operational endpoints. A reachable URL does not verify
 * the data, eligibility, project status, or contact details returned by it.
 */

function slug(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`);
  const result = value.replace(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!result) throw new Error(`Invalid ${label}`);
  return result;
}

function checkedUrl(value, id) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`Invalid endpoint URL: ${id}`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error(`Invalid endpoint URL: ${id}`);
  }
  return parsed.href;
}

function record({ id, url, organization, categories, jurisdiction, authority, role, title, sourceId }) {
  if (typeof organization !== 'string' || !organization.trim()) throw new Error(`Missing organization: ${id}`);
  const officialUrl = checkedUrl(url, id); // Compatibility name used by the shared link checker.
  return {
    catalog: 'operational', resource_id: slug(id, 'resource ID'),
    title: title || id, organization: organization.trim(),
    categories, category: categories[0], jurisdiction: [jurisdiction], authority,
    official_url: officialUrl, source_ids: sourceId ? [sourceId] : [],
    link_only: true,
    last_content_reviewed_at: null, review_status: 'needs_review',
    next_review_at: null, review_interval_days: null,
    last_link_checked_at: null, link_status: 'not_checked',
    known_issues: [], reviewed_content_hash: null,
    links: [{ role, url: officialUrl }],
  };
}

function gisRecords(gisConfig) {
  if (!Array.isArray(gisConfig?.geocoders) || !Array.isArray(gisConfig?.jurisdictions)) {
    throw new Error('GIS configuration must include geocoders and jurisdictions');
  }
  const result = [];
  for (const geocoder of gisConfig.geocoders) {
    const sourceId = slug(geocoder.source_id, 'GIS geocoder source ID');
    const area = slug(geocoder.id, 'GIS geocoder jurisdiction');
    result.push(record({ id: `gis-${sourceId}-geocoder-${area}`, url: geocoder.url,
      organization: geocoder.agency, categories: ['property'], jurisdiction: area,
      authority: 'official', role: 'geocoder', title: `${area} address geocoder`, sourceId }));
  }
  for (const area of gisConfig.jurisdictions) {
    const areaId = slug(area.id, 'GIS jurisdiction ID');
    if (!area.layers || typeof area.layers !== 'object' || Array.isArray(area.layers)) {
      throw new Error(`Missing GIS layers: ${areaId}`);
    }
    for (const [layerName, layer] of Object.entries(area.layers)) {
      const sourceId = slug(layer?.source_id, 'GIS layer source ID');
      const name = slug(layerName, 'GIS layer name');
      const categories = ['zoning', 'future-land-use'].includes(name) ? ['zoning']
        : ['boundary', 'municipalities'].includes(name) ? ['property', 'zoning'] : ['property'];
      result.push(record({ id: `gis-${sourceId}-${areaId}-${name}`, url: layer.url,
        organization: layer.agency, categories, jurisdiction: areaId,
        authority: 'official', role: `gis_${name.replaceAll('-', '_')}`,
        title: layer.title ?? `${area.name ?? areaId} ${layerName}`, sourceId }));
    }
  }
  return result;
}

function developmentRecords(developmentConfig) {
  if (!Array.isArray(developmentConfig?.official_sources) ||
      !developmentConfig?.official_fallbacks || typeof developmentConfig.official_fallbacks !== 'object') {
    throw new Error('Development configuration must include official sources and fallbacks');
  }
  const result = [];
  const rootId = slug(developmentConfig.source_id, 'development source ID');
  const rootArea = slug(developmentConfig.jurisdiction_id, 'development jurisdiction');
  result.push(record({ id: `development-${rootId}-repository`, url: developmentConfig.repository_url,
    organization: 'Tampa Development Records (independent project)', categories: ['development'],
    jurisdiction: rootArea, authority: 'independent', role: 'repository',
    title: 'Development snapshot repository', sourceId: rootId }));
  result.push(record({ id: `development-${rootId}-snapshot-csv`, url: developmentConfig.csv_url,
    organization: 'Tampa Development Records (independent project)', categories: ['development'],
    jurisdiction: rootArea, authority: 'independent', role: 'snapshot_csv',
    title: 'Pinned development snapshot CSV', sourceId: rootId }));
  for (const source of developmentConfig.official_sources) {
    const sourceId = slug(source.source_id, 'development official source ID');
    const area = slug(source.jurisdiction_id, 'development official jurisdiction');
    result.push(record({ id: `development-${sourceId}`, url: source.url,
      organization: source.agency, categories: ['development'], jurisdiction: area,
      authority: 'official', role: 'development_layer', title: source.title, sourceId }));
  }
  for (const [areaKey, fallback] of Object.entries(developmentConfig.official_fallbacks)) {
    const sourceId = slug(fallback?.source_id, 'development fallback source ID');
    const area = slug(areaKey, 'development fallback jurisdiction');
    result.push(record({ id: `development-${sourceId}`, url: fallback.url,
      organization: `${area === 'pasco' ? 'Pasco County' : area} government`,
      categories: ['development', 'permitting'], jurisdiction: area,
      authority: 'official', role: 'official_fallback', title: fallback.title, sourceId }));
  }
  return result;
}

/**
 * Return one link-only record per unique authored URL. `existingUrls` can avoid
 * duplicate records for URLs already monitored in the housing/RAG catalogs.
 * Stable IDs derive from source, jurisdiction, and service roles, never from
 * observed HTTP status or verification dates.
 */
export function operationalResourceRecords({ gisConfig, developmentConfig, existingUrls = [] } = {}) {
  const excluded = new Set(existingUrls);
  const records = [...gisRecords(gisConfig), ...developmentRecords(developmentConfig)]
    .filter(item => !excluded.has(item.official_url))
    .sort((left, right) => left.resource_id.localeCompare(right.resource_id));
  const byUrl = new Map();
  const ids = new Set();
  for (const item of records) {
    if (ids.has(item.resource_id)) throw new Error(`Duplicate operational resource ID: ${item.resource_id}`);
    ids.add(item.resource_id);
    const prior = byUrl.get(item.official_url);
    if (!prior) { byUrl.set(item.official_url, item); continue; }
    if (prior.authority !== item.authority) throw new Error(`Conflicting endpoint authority: ${item.official_url}`);
    prior.categories = [...new Set([...prior.categories, ...item.categories])].sort();
    prior.category = prior.categories[0];
    prior.jurisdiction = [...new Set([...prior.jurisdiction, ...item.jurisdiction])].sort();
    prior.source_ids = [...new Set([...prior.source_ids, ...item.source_ids])].sort();
    prior.links[0].role = [...new Set([...prior.links[0].role.split('+'), item.links[0].role])].sort().join('+');
  }
  return [...byUrl.values()];
}
