import { resolveJurisdiction } from '../../coverage.mjs';

/** These are locality hints, never an official property-boundary determination. */
export function detectLocation(text, jurisdictionId = 'tampa-bay') {
  const streetSuffix = '(?:st(?!\\.?\\s+pete(?:rsburg)?\\b)|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|ter|terrace|pkwy|parkway)\\b\\.?';
  const streetName = '(?:[a-z0-9.-]+\\s+){0,6}?' + streetSuffix;
  const addressPattern = new RegExp('\\b\\d{1,6}\\s+' + streetName, 'g');
  const streetAddresses = [...text.matchAll(addressPattern)];
  const hasAddress = streetAddresses.length > 0;
  const startsWithAddress = streetAddresses[0]?.index === 0;
  const geographic = /\b(address|property|parcel|my lot|this lot|here|near me|nearby|next door|this street|my street|this block|my neighborhood|near my|my home)\b/.test(text) || /\b(?:at|on|near)\s+(?:\w+\s+){1,5}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/.test(text) || /\b\d{1,6}\s+(?:\w+\s+){0,4}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/.test(text);
  // Street names can contain city names; only the remaining locality text is a coverage hint.
  // The property service still checks the selected point against official boundaries.
  const localityText = text.replace(addressPattern, ' ').replace(new RegExp('\\b(?:at|on|near)\\s+' + streetName, 'g'), ' ');
  const jurisdiction = resolveJurisdiction(localityText, jurisdictionId);
  if (jurisdiction.jurisdictionReason === 'unspecified' && /\b(statewide|florida housing|floridahousingsearch)\b/.test(text)) jurisdiction.needsJurisdiction = false;
  const outsideCoverage = /\b(miami|orlando|jacksonville|new york|chicago|los angeles|tallahassee)\b/.test(localityText);
  return { addresses: streetAddresses.map(match => match[0]), hasAddress, startsWithAddress, geographic, outsideCoverage, jurisdiction };
}
