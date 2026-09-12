import { normalizeQuestion } from '../core/router.mjs';

export function housingSituation(question) {
  const text = normalizeQuestion(question);
  if (/\b(homeless|sleep|shelter|nowhere to live|eviction|evicted)\b/.test(text)) return { situation: 'A place to stay or help keeping housing', preferredSourceIds: ['hillsborough-help', 'tampa-housing'] };
  if (/\b(repair|roof|hrrp|rehabilitation|fix)\b/.test(text)) return { situation: 'Repairs to a home you own', preferredSourceIds: ['tampa-hrrp', 'hillsborough-help'] };
  if (/\b(buy|buying|homebuyer|homeownership|down payment|ship)\b/.test(text)) return { situation: 'Buying a home or finding affordability resources', preferredSourceIds: ['florida-housing', 'hillsborough-help'] };
  if (/\b(affordable apartment|affordable rental|find an apartment|cheaper place)\b/.test(text)) return { situation: 'Finding an affordable rental', preferredSourceIds: ['florida-housing', 'hillsborough-help'] };
  if (/\b(behind|overdue|this month|back rent|past.due|arrears|already live|existing lease)\b/.test(text)) return { situation: 'Help with rent where you already live', preferredSourceIds: ['hillsborough-help', 'tampa-rmap'] };
  if (/\b(rent|rental|deposit|move|moving|rmap)\b/.test(text)) return { situation: 'Rent or moving costs', preferredSourceIds: ['tampa-rmap', 'hillsborough-help'] };
  return { situation: 'Finding housing help', preferredSourceIds: ['hillsborough-help', 'tampa-housing', 'florida-housing'] };
}

export function verificationQuestions(question) {
  const situation = housingSituation(question);
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
