import { intentText } from '../core/routing/normalize.mjs';

const STOP_WORDS = new Set('a an the my me i in is it be to of on at do does this that for and or can could would what which how where who are with have has from about want need please tell help get find show near by as if there any use may your you'.split(' '));
const SYNONYMS = {
  rent: ['rental', 'renter', 'tenant', 'rmap'], housing: ['housing', 'homeowner', 'affordable'],
  moving: ['move', 'rmap'], move: ['moving', 'rmap'], eviction: ['tenant', 'rental'],
  repair: ['rehabilitation', 'hrrp'], roof: ['rehabilitation', 'repair', 'hrrp'],
  buying: ['homebuyer', 'homeownership'], buy: ['homebuyer', 'homeownership'],
  zoning: ['zoning', 'zone'], flu: ['future', 'land', 'use'],
  development: ['construction', 'development'], permit: ['permitting', 'construction'],
  construction: ['development', 'permit'], phone: ['contact'], agency: ['contact'],
  homeless: ['homelessness', 'housing', 'assistance'], sleep: ['homelessness', 'housing'],
  'rm-24': ['zoning'], 'rs-50': ['zoning'],
};

function stem(token) {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokens(text, expand = false) {
  const words = intentText(text).split(/\s+/).filter(word => word.length > 1 && !STOP_WORDS.has(word));
  return (expand ? words.flatMap(word => [word, ...(SYNONYMS[word] ?? [])]) : words).map(stem);
}

