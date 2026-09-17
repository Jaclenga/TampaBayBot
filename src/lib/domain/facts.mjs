/** Conservative, deterministic semantic annotations. Literal evidence remains authoritative.
 * Unknown wording is deliberately left unclassified; facts never determine eligibility. */
export const FACT_TYPES = Object.freeze([
  'application_status', 'income_limit', 'effective_year', 'benefit_amount',
  'eligibility', 'assistance_restriction', 'contact',
]);

const incomeContext = /\b(?:income\s+(?:limits?|guidelines?|requirements?|thresholds?)|(?:maximum|minimum|household|annual)\s+income|area median income|AMI)\b/i;
const money = /(?:\$\s*\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*(?:\.\d{2})?\s+dollars?\b)/gi;
const year = /\b(?:19|20)\d{2}\b/g;
const monthName = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const dayOfMonth = '(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?';
const date = new RegExp(`\\b(?:(?:19|20)\\d{2}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.](?:19|20)\\d{2}|${monthName}\\s+${dayOfMonth}(?:(?:,\\s*|\\s+)(?:19|20)\\d{2})?|${dayOfMonth}\\s+${monthName}(?:\\s+(?:19|20)\\d{2})?)\\b`, 'gi');
const householdCount = /\b(?:(?:households?|famil(?:y|ies))[-\s]+(?:of\s+|size(?:\s+of)?\s*:?\s*)\d+(?:\s*(?:[-–]|to)\s*\d+)?|\d+(?:\s*(?:[-–]|to)\s*\d+)?\s*[- ]?\s*(?:people|persons?|members?|adults?|children|dependents?|households?|families)\b)/gi;
const closed = /\b(?:not (?:currently |now )?accepting (?:new )?applications|applications? (?:are |is )?(?:currently |now )?(?:closed|paused))\b/i;
const open = /\b(?:applications? (?:are |is )?(?:currently |now )?open|(?:is |are |now |currently )(?:currently |now )?accepting (?:new )?applications)\b|^accepting (?:new )?applications\b/i;
const qualified = /\b(?:must|shall)\b|\b(?:not eligible|eligible (?:applicants|households|residents)|only\b[^.!?]*\bqualif(?:y|ies)|qualif(?:y|ies) only)\b/i;
const restriction = /\bnot eligible\b|\b(?:move.in|existing leases?|occupied units?)\b[^.!?]{0,70}\bonly\b|\b(?:assistance|benefits?|program)\s+(?:is |are )?(?:available |provided )?(?:for|to)\b[^.!?]{0,70}\bonly\b|\bonly\s+(?:owner.occupied|eligible)\b|\b(?:program|assistance|benefit)\b[^.!?]{0,40}\b(?:limited|restricted) to\b/i;

function applicationState(quote) {
  if (quote.endsWith('?')) return null;
  const match = quote.match(closed) ?? quote.match(open);
  if (!match) return null;
  // Conditional, projected and explicitly negated wording is not a current status.
  const before = quote.slice(0, match.index)
    // These introduce a present-tense notice, not a hypothetical status. Keep
    // the rest of the clause so an enclosing "if" or negation still rejects it.
    .replace(/\buntil further notice\b\s*,?/gi, '')
    .replace(/\b(?:should|must|may)\s+(?:be (?:aware|advised)|note|understand)\s+that\b/gi, '');
  if (/\b(?:if|when|whether|unless|until|previously|formerly|expected|planned|projected|will|would|could|may|might|should|not|never)\b/i.test(before)) return null;
  const after = quote.slice(match.index + match[0].length);
  if (/\b(?:if|unless|provided that|assuming)\b/i.test(after)) return null;
  return closed.test(match[0]) ? 'closed' : 'open';
}

function sentences(text) {
  // Split only after sentence punctuation followed by whitespace. Decimal values,
  // email addresses, and all returned quotations retain the original spelling.
  return text.split(/(?<=[.!?])\s+(?=[A-Z])|\n+/u).map(part => part.trim()).filter(Boolean);
}

/** Boundary annotations use the same conservative sentence rule as extraction.
 * Both normalization and corpus validation can rederive this from literal text. */
export function startsAtSentenceBoundary(previousText, text) {
  return /[.!?]\s*$/u.test(previousText) && /^[A-Z]/u.test(text);
}

function structuredFacts(text, add, deriveStatementFacts) {
  let record;
  try { record = JSON.parse(text); } catch { return false; }
  if (!record || Array.isArray(record) || typeof record !== 'object') return false;
  const entries = Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[_-]+/g, ' ').trim(), value]);
  const effective = entries.find(([key, value]) => /^(?:effective year|income limits? year)$/.test(key) && /^(?:19|20)\d{2}$/.test(String(value)));
  const effectiveYear = effective ? Number(effective[1]) : undefined;
  for (const [key, value] of entries) {
    if (!['string', 'number'].includes(typeof value)) continue;
    if (/^(?:application status|applications status)$/.test(key)) {
      const status = String(value).toLowerCase().trim();
      if (['open', 'closed', 'paused'].includes(status)) add('application_status', status === 'paused' ? 'closed' : status, text);
    } else if (/^(?:effective year|income limits? year)$/.test(key) && /^(?:19|20)\d{2}$/.test(String(value))) {
      add('effective_year', Number(value), text, { effectiveYear: Number(value) });
    } else if (/^(?:income limit|maximum income|household income limit)$/.test(key)) {
      add('income_limit', value, text, effectiveYear ? { effectiveYear } : {});
    } else if (/^(?:benefit amount|maximum assistance|maximum benefit|assistance amount)$/.test(key)) {
      add('benefit_amount', value, text, effectiveYear ? { effectiveYear } : {});
    } else if (/^(?:eligibility|eligibility requirements|qualifications)$/.test(key) && typeof value === 'string' && value.trim()) {
      add('eligibility', value, text);
    } else if (/^(?:assistance restriction|program restriction)$/.test(key) && typeof value === 'string' && value.trim()) {
      add('assistance_restriction', value, text);
    } else if (/^(?:contact|email|phone|telephone|contact email|contact phone)$/.test(key) && String(value).trim()) {
      add('contact', value, text);
    }
    // Narrative values carry the same explicit facts as HTML/PDF paragraphs.
    // Analyze decoded strings but quote the complete literal JSON record: a
    // decoded quote/newline may not exist verbatim in the serialized evidence.
    if (typeof value === 'string') for (const statement of sentences(value)) deriveStatementFacts(statement, text);
  }
  return true;
}

/** Same derivation is used at ingestion and for older corpora without annotations.
 * Source metadata identifies the program; it never supplies a factual value. */
export function deriveFacts(chunk, source) {
  if (!chunk || !source || chunk.source_id !== source.source_id || typeof chunk.text !== 'string' || typeof chunk.id !== 'string') return [];
  const facts = [];
  const seen = new Set();
  const add = (factType, value, quote, extra = {}) => {
    if (!quote || !chunk.text.includes(quote)) return;
    const fact = { programId: source.program_id ?? source.topic_id ?? source.source_id,
      sourceId: source.source_id, evidenceChunkId: chunk.id, factType, value, confidence: 'explicit', quote, ...extra };
    const key = JSON.stringify(fact);
    if (seen.has(key)) return;
    seen.add(key);
    facts.push(fact);
  };
  const deriveStatementFacts = (statement, quote = statement) => {
    const status = applicationState(statement);
    if (status) add('application_status', status, quote);
    if (incomeContext.test(statement)) {
      const amounts = [...statement.matchAll(money)];
      const yearSpans = [...statement.matchAll(year)]
        .filter(match => !amounts.some(amount => match.index >= amount.index && match.index < amount.index + amount[0].length));
      const years = yearSpans.map(match => Number(match[0]));
      const effectiveYear = new Set(years).size === 1 ? years[0] : undefined;
      // Dates and household counts label a table; neither supplies its limit.
      // Preserve actual amounts, including currency that resembles a year.
      const labels = [...yearSpans, ...statement.matchAll(date), ...statement.matchAll(householdCount)];
      const hasIncomeValue = amounts.length > 0 || [...statement.matchAll(/\d+/g)]
        .some(match => !labels.some(span => match.index >= span.index && match.index < span.index + span[0].length));
      if (hasIncomeValue) add('income_limit', statement, quote, effectiveYear ? { effectiveYear } : {});
      if (effectiveYear) add('effective_year', effectiveYear, quote, { effectiveYear });
    }
    if (/\b(?:assistance|benefit|grant|award|loan)\b/i.test(statement) && !incomeContext.test(statement) && !/\b(?:fees?|application costs?)\b/i.test(statement)) {
      for (const match of statement.matchAll(money)) add('benefit_amount', match[0], quote);
    }
    if (!statement.endsWith('?')) {
      if (qualified.test(statement)) add('eligibility', statement, quote);
      if (restriction.test(statement)) add('assistance_restriction', statement, quote);
    }
    for (const match of statement.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b(?:\s*(?:ext\.?|x)\s*\d+)?/gi)) add('contact', match[0], quote);
  };
  if (structuredFacts(chunk.text, add, deriveStatementFacts)) return facts;
  const statements = sentences(chunk.text);
  // Ingestion records whether the original unit ends a sentence immediately
  // before this chunk. Unknown legacy boundaries still discard the fragment,
  // which may follow a negation in the preceding chunk.
  if (chunk.locator?.text_start > 0 && chunk.locator.starts_at_sentence_boundary !== true) statements.shift();
  for (const statement of statements) deriveStatementFacts(statement);
  return facts;
}

/** Never trust an annotation merely because its quote is literal. Rederivation
 * also checks the meaning, program identity and source/evidence relationship. */
export function factsForChunk(chunk, source) {
  return deriveFacts(chunk, source);
}

export function factAnnotationsMatch(chunk, source) {
  return chunk.facts === undefined || JSON.stringify(chunk.facts) === JSON.stringify(deriveFacts(chunk, source));
}
