import { intentText } from '../core/router.mjs';
import { housingNeeds } from './needs.mjs';

export { housingNeeds } from './needs.mjs';

const LOCAL_SOURCES = {
  'st-petersburg': {
    urgent: ['st-petersburg-renters', 'pinellas-family-housing'],
    repair: ['st-petersburg-rehab', 'pinellas-housing-directory'],
    buy: ['florida-housing', 'pinellas-housing-directory'],
    rental: ['florida-housing', 'st-petersburg-renters'],
    rent: ['st-petersburg-renters', 'pinellas-family-housing', 'pinellas-housing-directory'],
    general: ['st-petersburg-renters', 'pinellas-housing-directory', 'florida-housing'],
  },
  clearwater: {
    urgent: ['clearwater-housing', 'pinellas-family-housing'],
    repair: ['clearwater-rehab', 'pinellas-housing-directory'],
    buy: ['florida-housing', 'pinellas-housing-directory'],
    rental: ['florida-housing', 'clearwater-housing'],
    rent: ['clearwater-housing', 'pinellas-family-housing', 'pinellas-housing-directory'],
    general: ['clearwater-housing', 'pinellas-housing-directory', 'florida-housing'],
  },
  'pinellas-county': {
    urgent: ['pinellas-family-housing', 'pinellas-housing-directory'],
    repair: ['pinellas-housing-directory'],
    buy: ['florida-housing', 'pinellas-housing-directory'],
    rental: ['florida-housing', 'pinellas-housing-directory'],
    rent: ['pinellas-family-housing', 'pinellas-housing-directory'],
    general: ['pinellas-housing-directory', 'florida-housing'],
  },
  'pasco-county': {
    urgent: ['pasco-help', 'pasco-housing'],
    repair: ['pasco-rehab', 'pasco-housing'],
    buy: ['florida-housing', 'pasco-housing'],
    rental: ['florida-housing', 'pasco-housing'],
    rent: ['pasco-help', 'pasco-housing'],
    general: ['pasco-housing', 'pasco-help', 'florida-housing'],
  },
};

export function housingSituation(question, { jurisdictionId = 'tampa-bay' } = {}) {
  const text = intentText(question);
  const needs = housingNeeds(question);
  const sourcesFor = (kind, tampaSources) => jurisdictionId === 'tampa' ? tampaSources
      : jurisdictionId === 'hillsborough-county' ? (['buy', 'rental'].includes(kind) ? ['florida-housing', 'hillsborough-help'] : ['hillsborough-help'])
      : jurisdictionId === 'tampa-bay' ? ['florida-housing']
      : LOCAL_SOURCES[jurisdictionId]?.[kind] ?? [];
  const choices = [];
  if (needs.includes('shelter')) choices.push(['A place to stay or help keeping housing', 'urgent', ['hillsborough-help', 'tampa-housing']]);
  if (needs.includes('repair') || needs.includes('accessibility')) choices.push(['Repairs to a home you own', 'repair', ['tampa-hrrp', 'hillsborough-help']]);
  if (needs.includes('buy')) choices.push(['Buying a home or finding affordability resources', 'buy', ['florida-housing', 'hillsborough-help']]);
  if (needs.includes('rental')) choices.push(['Finding an affordable rental', 'rental', ['florida-housing', 'hillsborough-help']]);
  if (needs.includes('rent')) choices.push(/\b(behind|overdue|this month|back rent|past.due|arrears|already live|existing lease)\b/.test(text)
    ? ['Help with rent where you already live', 'rent', ['hillsborough-help', 'tampa-rmap']]
    : ['Rent or moving costs', 'rent', ['tampa-rmap', 'hillsborough-help']]);
  if (needs.includes('move')) choices.push(['Rent or moving costs', 'rent', ['tampa-rmap', 'hillsborough-help']]);
  if (needs.includes('utilities')) choices.push(['Help with household utility bills', 'rent', ['hillsborough-help']]);
  if (!choices.length) choices.push(['Finding housing help', 'general', ['hillsborough-help', 'tampa-housing', 'florida-housing']]);
  const [situation, kind] = choices[0];
  return {
    situation, kind,
    preferredSourceIds: [...new Set(choices.flatMap(([, needKind, tampaSources]) => sourcesFor(needKind, tampaSources)))],
  };
}

export function verificationQuestions(question, options) {
  const situation = housingSituation(question, options);
  return {
    situation: situation.situation,
    requirementsToVerify: [
      'Is the program accepting applications today?',
      'Does it cover the address and the kind of help you need?',
      'What income, household, and other eligibility rules apply?',
      'Which documents and application steps does the agency require?',
    ],
  };
}
