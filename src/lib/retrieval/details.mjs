import { intentText } from '../core/routing/normalize.mjs';

const DETAIL_FIELDS = [
  { id: 'amount', query: /\b(?:maximum|max|minimum|min|how much|amount)\b/, body: /\b(?:maximum|max|minimum|min|up to|amount|limit)\b/, kind: /\$|\b(?:dollars?|usd)\b/ },
  { id: 'fee', query: /\b(?:fee|fees|cost|costs)\b/, body: /\b(?:fee|fees|cost|costs|charge)\b/, kind: /\$|\b(?:dollars?|usd|no fee|free of charge)\b/ },
  { id: 'duration', query: /\b(?:how long|duration|loan term)\b/, body: /\b(?:term|period|for|loan)\b/, kind: /\b(?:days?|months?|years?)\b/ },
  { id: 'deadline', query: /\b(?:deadline|due date)\b/, body: /\b(?:deadline|due|by)\b/, kind: /\b\d{4}\b/ },
];

// Numeric-detail questions inspect the same published passages repeatedly.
// Strings are immutable; bound the per-isolate cache to keep memory predictable.
const normalizedBodyCache = new Map();

function normalizedBody(text) {
  const value = String(text ?? '');
  if (value.length > 8192) return intentText(value);
  const cached = normalizedBodyCache.get(value);
  if (cached !== undefined) return cached;
  const normalized = intentText(value);
  if (normalizedBodyCache.size >= 256) normalizedBodyCache.delete(normalizedBodyCache.keys().next().value);
  normalizedBodyCache.set(value, normalized);
  return normalized;
}

function detailContext(question, requestedFacts) {
  const query = intentText(question);
  const benefitQuestion = /\b(?:assistance|benefit|grant|aid)\b/.test(query);
  const feeQuestion = /\b(?:fees?|costs?)\b/.test(query) &&
    (!benefitQuestion || /\bfees?\b|\bcost (?:of|to)\b/.test(query));
  const fields = DETAIL_FIELDS.filter(field => (requestedFacts ? requestedFacts.includes(field.id) : field.query.test(query)) &&
    (field.id !== 'amount' || !feeQuestion || benefitQuestion && /\b(?:and|also)\b/.test(query)) &&
    (field.id !== 'fee' || feeQuestion && /\b(?:how much|what (?:is|are)|amount|maximum|max|minimum|min)\b/.test(query)));
  return { query, fields };
}

function detailsInBody({ query, fields }, text) {
  if (fields.length === 0) return [];
  const body = normalizedBody(text);
  if (!/\d|\b(?:no fee|free of charge)\b/.test(body)) return [];
  // An income threshold and a benefit amount are different facts even when both
  // contain a dollar figure and the same word "maximum".
  const income = /\b(?:income|ami|earnings?|salary)\b/;
  const fees = /\b(?:fee|fees|cost|costs|charge)\b/;
  return fields.filter(field => {
    if (!field.body.test(body) || !field.kind.test(body)) return false;
    if (['amount', 'fee'].includes(field.id)) {
      if (income.test(query) !== income.test(body)) return false;
      if (field.id === 'fee' && !fees.test(body)) return false;
      if (field.id === 'amount' && /\bfees?\b/.test(body) && !/\b(?:assistance|benefit|grant|aid)\b/.test(body)) return false;
      if (/\b(?:maximum|max)\b/.test(query) && /\b(?:minimum|min)\b/.test(body) && !/\b(?:maximum|max|up to)\b/.test(body)) return false;
      if (/\b(?:minimum|min)\b/.test(query) && /\b(?:maximum|max|up to)\b/.test(body) && !/\b(?:minimum|min)\b/.test(body)) return false;
    }
    return true;
  }).map(field => field.id);
}

/** Fields explicitly requested as facts, optionally limited to those a quote supports. */
export function requestedDetails(question, text, requestedFacts) {
  const context = detailContext(question, requestedFacts);
  return text === undefined ? context.fields.map(field => field.id) : detailsInBody(context, text);
}

/** Compile question-side checks once when ranking many passages. */
export function requestedDetailScorer(question, requestedFacts) {
  const context = detailContext(question, requestedFacts);
  return text => detailsInBody(context, text).length;
}

/** Match the requested factual field in the passage itself, not its page title. */
export function requestedDetailScore(question, text, requestedFacts) {
  return requestedDetails(question, text, requestedFacts).length;
}
