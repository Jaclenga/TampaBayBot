/** Selected resource context; these IDs are not a property-boundary finding. */
export const JURISDICTIONS = Object.freeze([
  { id: 'tampa-bay', label: 'Tampa Bay' },
  { id: 'tampa', label: 'Tampa' },
  { id: 'st-petersburg', label: 'St. Petersburg' },
  { id: 'clearwater', label: 'Clearwater' },
  { id: 'hillsborough-county', label: 'Hillsborough County' },
  { id: 'pinellas-county', label: 'Pinellas County' },
  { id: 'pasco-county', label: 'Pasco County' },
].map(Object.freeze));

const IDs = new Set(JURISDICTIONS.map(({ id }) => id));
const CITY_COUNTY = { tampa: 'hillsborough-county', 'st-petersburg': 'pinellas-county', clearwater: 'pinellas-county' };
const PLACE_PATTERNS = [
  ['st-petersburg', /\b(?:st\.?|saint)\s+(?:petersburg|pete)\b|\bstpete\b/],
  ['clearwater', /\bclearwater\b/],
  ['tampa', /\btampa\b(?!\s+bay\b)/],
  ['hillsborough-county', /\bhillsborough(?:\s+county)?\b/],
  ['pinellas-county', /\bpinellas(?:\s+county)?\b/],
  ['pasco-county', /\bpasco(?:\s+county)?\b/],
];
// These names must not be mistaken for an incorporated city we index or for
// unincorporated county jurisdiction. Broad regional resources remain usable.
const OTHER_MUNICIPALITY = /\b(?:pinellas park|(?:st\.?|saint)\s+pete(?:rsburg)?\s+beach|dunedin|largo|safety harbor|tarpon springs|oldsmar|seminole|gulfport|treasure island|plant city|temple terrace|dade city|new port richey|port richey|zephyrhills|belleair(?: beach| bluffs| shore)?|indian rocks beach|indian shores|madeira beach|north redington beach|redington beach|redington shores|san antonio|st\.? leo|saint leo)\b/;

function cityIsUnconfirmed(text, cityId) {
  const cityPattern = PLACE_PATTERNS.find(([id]) => id === cityId)[1].source;
  return /\bunincorporated\b|\b(?:outside|not (?:within|inside|in)) (?:the )?city limits\b/.test(text) ||
    new RegExp('\\b(?:outside(?: of)?|not in|not within|not inside|dont live in|do not live in)\\s+(?:(?:the|city|of)\\s+){0,3}(?:' + cityPattern + ')').test(text) ||
    new RegExp('(?:' + cityPattern + ')\\s+(?:postal|mailing)\\s+address\\b').test(text);
}

export function isJurisdictionId(value) {
  return typeof value === 'string' && IDs.has(value);
}

/** Missing scope metadata fails closed; county membership is never inferred. */
export function sourceCoversJurisdiction(source, jurisdictionId) {
  return isJurisdictionId(jurisdictionId) && Array.isArray(source?.jurisdiction_ids) && source.jurisdiction_ids.includes(jurisdictionId);
}

/** localityText has street names removed by the router before place matching. */
export function resolveJurisdiction(localityText, selected = 'tampa-bay') {
  const text = String(localityText ?? '').toLowerCase();
  let jurisdictionId = 'tampa-bay';
  let jurisdictionReason = null;
  if (!isJurisdictionId(selected)) jurisdictionReason = 'invalid_selection';
  else if (OTHER_MUNICIPALITY.test(text)) jurisdictionReason = 'unsupported_municipality';
  else {
    const mentioned = PLACE_PATTERNS.filter(([, expression]) => expression.test(text)).map(([id]) => id);
    const unconfirmedCities = mentioned.filter(id => CITY_COUNTY[id] && cityIsUnconfirmed(text, id));
    const cities = mentioned.filter(id => CITY_COUNTY[id] && !unconfirmedCities.includes(id));
    const counties = mentioned.filter(id => !CITY_COUNTY[id]);
    if (unconfirmedCities.includes(selected) || cities.length > 1 || counties.length > 1 || (cities.length && counties.length && CITY_COUNTY[cities[0]] !== counties[0])) {
      jurisdictionReason = 'conflict';
    } else {
      const named = cities[0] ?? counties[0];
      if (!named) jurisdictionId = selected;
      else if (selected === 'tampa-bay' || selected === named || CITY_COUNTY[named] === selected) jurisdictionId = named;
      else if (CITY_COUNTY[selected] === named) jurisdictionId = selected;
      else jurisdictionReason = 'conflict';
      if (!jurisdictionReason && jurisdictionId === 'tampa-bay') jurisdictionReason = 'unspecified';
    }
  }
  return {
    jurisdictionId,
    jurisdictionLabel: JURISDICTIONS.find(({ id }) => id === jurisdictionId).label,
    needsJurisdiction: jurisdictionReason !== null,
    jurisdictionReason,
  };
}
