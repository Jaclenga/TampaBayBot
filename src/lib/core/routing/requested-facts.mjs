import { requestedDetails } from '../../retrieval/details.mjs';

const SEMANTIC_FIELDS = [
  ['income_limit', /\b(?:income|ami|earnings?|salary)\b/],
  ['eligibility', /\b(?:eligible|eligibility|qualify|qualifies|requirements?|documents?)\b/],
  ['contact', /\b(?:contact|phone|telephone|call|which agency|which department|which office|who handles)\b/],
];

function requestsApplicationStatus(text) {
  // Opening a form or portal is an action, not a statement about intake.
  const availability = text.replace(/\bopen\s+(?:(?:the|an?|my|this|that)\s+)?(?:(?:online|housing|rental)\s+)*(?:portal|website|page|link|form|account|application|browser)\b/g, '');
  if (/\b(?:open|closed|reopen|reopening|applications? status|accepting applications?)\b/.test(availability)) return true;
  if (/\b(?:apply|applications?|accepting)\b[^.]*\b(?:now|today|currently|yet)\b|\b(?:now|today|currently|still)\s+(?:apply|accepting|can i apply)\b|\bwhen (?:can|may|will|do) (?:i|we) apply\b/.test(availability)) return true;
  // Asking which program to approach identifies a resource, not its current
  // intake status. Keep the explicit availability checks above authoritative.
  if (/\b(?:what|which)\s+(?:[a-z-]+\s+){0,4}programs?\s+can i apply (?:to|for)\b/.test(text)) return false;
  // Method questions can be answered from application instructions without
  // claiming that intake is open. Explicit availability above still wins when
  // a resident asks about both method and status in the same question.
  const method = /\b(?:in[ -]person|online|by (?:mail|post|email|phone|telephone|fax)|over the phone|(?:through|on) (?:the )?(?:website|portal)|at (?:the )?(?:office|counter|city hall)|(?:where|how) (?:can|do|should) i apply|en persona|en linea|por correo)\b/;
  return !method.test(text) && /\bcan i apply\b/.test(text);
}

/** Keep factual intent explicit. Numeric IDs remain compatible with retrieval;
 * semantic IDs match the structured fact layer. Neither supplies factual values. */
export function detectRequestedFacts(question, normalized) {
  return [...new Set([
    ...requestedDetails(question),
    ...(requestsApplicationStatus(normalized) ? ['application_status'] : []),
    ...SEMANTIC_FIELDS.filter(([, pattern]) => pattern.test(normalized)).map(([id]) => id),
  ])];
}
