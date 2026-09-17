import { intentAliases } from '../../i18n/intent.mjs';

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
    .replace(/[^\p{L}\p{N}\p{M}$.-]+/gu, ' ')
    .trim().split(/\s+/).map(word => TYPO.get(word) ?? word).join(' ');
}

export function intentText(value) {
  return intentAliases(normalizeQuestion(value));
}

