import { intentText } from '../core/router.mjs';

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
  const result = (situation, kind, tampaSources) => {
    const preferredSourceIds = jurisdictionId === 'tampa' ? tampaSources
      : jurisdictionId === 'hillsborough-county' ? (['buy', 'rental'].includes(kind) ? ['florida-housing', 'hillsborough-help'] : ['hillsborough-help'])
      : jurisdictionId === 'tampa-bay' ? ['florida-housing']
      : LOCAL_SOURCES[jurisdictionId]?.[kind] ?? [];
    return { situation, kind, preferredSourceIds: [...preferredSourceIds] };
  };
  if (/\b(homeless|sleep|shelter|nowhere to live|eviction|evicted)\b/.test(text)) return result('A place to stay or help keeping housing', 'urgent', ['hillsborough-help', 'tampa-housing']);
  if (/\b(repair|roof|hrrp|rehab|rehabilitation|fix|home preservation)\b/.test(text)) return result('Repairs to a home you own', 'repair', ['tampa-hrrp', 'hillsborough-help']);
  if (/\b(buy|buying|homebuyer|homeownership|down payment|ship)\b/.test(text)) return result('Buying a home or finding affordability resources', 'buy', ['florida-housing', 'hillsborough-help']);
  if (/\b(affordable apartment|affordable rental|find an apartment|cheaper place)\b/.test(text)) return result('Finding an affordable rental', 'rental', ['florida-housing', 'hillsborough-help']);
  if (/\b(behind|overdue|this month|back rent|past.due|arrears|already live|existing lease)\b/.test(text)) return result('Help with rent where you already live', 'rent', ['hillsborough-help', 'tampa-rmap']);
  if (/\b(rent|rental|deposit|move|moving|rmap)\b/.test(text)) return result('Rent or moving costs', 'rent', ['tampa-rmap', 'hillsborough-help']);
  return result('Finding housing help', 'general', ['hillsborough-help', 'tampa-housing', 'florida-housing']);
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
