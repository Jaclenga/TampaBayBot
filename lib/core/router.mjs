const TYPO = new Map(Object.entries({
  assitance: 'assistance', assistence: 'assistance', asistance: 'assistance',
  hosuing: 'housing', houseing: 'housing', houisng: 'housing',
  zonning: 'zoning', zoneing: 'zoning', zoining: 'zoning',
  permitt: 'permit', permitts: 'permits', permting: 'permitting',
  developement: 'development', devlopment: 'development',
  applcation: 'application', aplication: 'application',
  evicton: 'eviction', eviciton: 'eviction', morgage: 'mortgage',
  appartments: 'apartments', appartment: 'apartment',
  reen: 'rent', rnt: 'rent', tmapa: 'tampa', flordia: 'florida',
}));

export function normalizeQuestion(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$.-]+/g, ' ')
    .trim().split(/\s+/).map(word => TYPO.get(word) ?? word).join(' ');
}

export function routeQuestion(question) {
  const text = normalizeQuestion(question);
  const addressPattern = /\b\d{1,6}\s+(?:[a-z0-9]+\s+){0,5}?(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/g;
  const streetAddresses = [...text.matchAll(addressPattern)];
  const hasAddress = streetAddresses.length > 0;
  const startsWithAddress = streetAddresses[0]?.index === 0;
  const scores = { housing: 0, zoning: 0, permitting: 0, development: 0, navigation: 0 };
  const patterns = {
    housing: [ /\b(rent|rental|renter|tenant|eviction|homeless|housing|affordable|landlord|mortgage|rmap|hrrp|ship)\b/g, /\b(home repair|down payment|buy a home|buy my first home|pay for (a )?home|pay for (my )?housing|move in|moving costs|sleep tonight|place to sleep|roof repair|fix my roof|paying for housing)\b/g ],
    zoning: [ /\b(zoning|zone|rezoning|variance|setback|density|adu|duplex|triplex|far|flu|overlay)\b/g, /\b(land use|comprehensive plan|land development code|rm-?24|rs-?50|build.*backyard|allowed.*property|build on.*lot)\b/g ],
    permitting: [ /\b(permit|permits|permitting|inspection|inspections|contractor|fence|shed|renovation|remodel|electrical|plumbing|reroof)\b/g, /\b(new construction|replace.*water heater|roof replacement|build.*garage)\b/g ],
    development: [ /\b(development|developments|construction|rezonings)\b/g, /\b(being built|going up|nearby|near me|next door|public records|record status|permit history|building activity|recent activity|historical activity|development records|past permits|last year|activity over time)\b/g ],
    navigation: [ /\b(contact|department|agency|phone|form|office|verify|website|who|where)\b/g ],
  };
  for (const [category, expressions] of Object.entries(patterns)) {
    scores[category] = expressions.reduce((sum, expression) => sum + [...text.matchAll(expression)].length * 3, 0);
  }
  if (/\b(help|assistance)\b/.test(text) && /\b(pay|paying|money|home|bill|bills)\b/.test(text)) scores.housing += 5;
  if (/\b(application|apply)\b/.test(text) && /\b(house|housing|rent|grant|assistance|program)\b/.test(text)) scores.housing += 4;
  if (/\b(grant|program|deposit|fund)\b/.test(text)) scores.housing += 2;
  if (/\b(permit records|permit history|development records|past permits|approved.*last year)\b/.test(text)) scores.development += 8;
  if (/\b(land use|zoning)\b/.test(text)) scores.zoning += 4;
  if (/\b(new construction)\b/.test(text) && /\b(permit|permits|application|requirements)\b/.test(text)) scores.permitting += 4;
  if (/\b(flu|far|rm-?24|rs-?50)\b/.test(text)) scores.zoning += 5;
  const subjectCategory = Object.entries(scores).filter(([key]) => key !== 'navigation')
    .sort((a, b) => b[1] - a[1])[0];
  const directNavigation = /\b(who (handles|do i|should i|can i)|which (agency|department|office)|contact (the|a|city)|phone number|official form|where (can i |do i )?verify)\b/.test(text);
  let category = subjectCategory[1] > 0 ? subjectCategory[0] : 'navigation';
  if (subjectCategory[1] === 0 && startsWithAddress) category = 'zoning';
  if (directNavigation) category = 'navigation';
  const geographic = /\b(address|property|parcel|my lot|this lot|here|near me|nearby|next door|this street|my street|this block|my neighborhood|near my|my home)\b/.test(text) || /\b(?:at|on|near)\s+(?:\w+\s+){1,5}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/.test(text) || /\b\d{1,6}\s+(?:\w+\s+){0,4}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/.test(text);
  const topic = category === 'navigation' && subjectCategory[1] > 0 ? subjectCategory[0] : category;
  const needsAddress = geographic && ['zoning', 'development', 'permitting'].includes(topic);
  const outOfScope = (Math.max(...Object.values(scores)) === 0 && !startsWithAddress && !/\b(help|start|lost|confused|go|apply|tampa|hillsborough)\b/.test(text)) || /\b(pizza|song|recipe|sports score|football|weather|stock price)\b/.test(text);
  // Street names can contain city names; only the remaining locality text is a coverage hint.
  // The property service still checks the selected point against the official City boundary.
  const localityText = text.replace(addressPattern, ' ');
  const outsideCoverage = /\b(miami|orlando|jacksonville|new york|chicago|los angeles|st\.? petersburg|saint petersburg|pinellas|clearwater|tallahassee|pasco)\b/.test(localityText);
  const officialJudgment = /\b(am i eligible|do i qualify|guarantee|guaranteed|legally|legal advice|sue|official (determination|approval)|approve my|certify|am i allowed|is it legal|can i (build|evict)|prove i can build|will (the city|i) approve|definitely (eligible|allowed)|tell me i qualify|automatically qualify)\b/.test(text);
  return { category, subjectCategory: topic, needsAddress, hasAddress, outOfScope, outsideCoverage, officialJudgment, normalized: text };
}
