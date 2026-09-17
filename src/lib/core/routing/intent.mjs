/** Independent subject and navigation signals; does not resolve geography or risk. */
export function detectIntent(text) {
  const scores = { housing: 0, zoning: 0, permitting: 0, development: 0, navigation: 0 };
  const patterns = {
    housing: [ /\b(rent|rental|renter|tenant|eviction|homeless|housing|affordable|landlord|mortgage|rmap|hrrp|ship|rehab|rehabilitation)\b/g, /\b(home repair|down payment|buy a home|buy my first home|pay for (a )?home|pay for (my )?housing|move in|moving costs|sleep tonight|place to sleep|roof repair|fix my roof|paying for housing)\b/g ],
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
  if (/\b(grants?|programs?|deposits?|funds?)\b/.test(text)) scores.housing += 2;
  if (/\b(accessibility|accessible|wheelchair|ramps?|utilities|electricity|water)\b/.test(text) &&
      /\b(help|assistance|programs?|grants?|pay|bills?)\b/.test(text)) scores.housing += 4;
  if (/\b(permit records|permit history|development records|past permits|approved.*last year)\b/.test(text)) scores.development += 8;
  if (/\b(land use|zoning)\b/.test(text)) scores.zoning += 4;
  if (/\b(new construction)\b/.test(text) && /\b(permit|permits|application|requirements)\b/.test(text)) scores.permitting += 4;
  if (/\b(flu|far|rm-?24|rs-?50|nt-?\d|ns-?\d|nsm-?\d|ldr|lmdr|mdr|hdr|mhdr)\b/.test(text)) scores.zoning += 5;
  const subjectCategory = Object.entries(scores).filter(([key]) => key !== 'navigation')
    .sort((a, b) => b[1] - a[1])[0];
  const directNavigation = /\b(who (handles|do i|should i|can i)|which (agency|department|office)|contact (the|a|city)|phone number|official form|where (can i |do i )?verify)\b/.test(text);
  let category = subjectCategory[1] > 0 ? subjectCategory[0] : 'navigation';
  if (directNavigation) category = 'navigation';
  return { scores, category, subjectCategory: subjectCategory[1] > 0 ? subjectCategory[0] : category, directNavigation };
}
