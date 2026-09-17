import { factsForChunk } from '../../domain/facts.mjs';
import { makeEvidence, withFactEvidence } from '../../citations/evidence.mjs';
import { evidenceSafetyReason, sourceIsStale } from '../../retrieval/eligibility.mjs';
import { normalizeQuestion } from '../routing/normalize.mjs';

export function criticalQualificationChunks(source, chunks) {
  return chunks.filter(chunk => !evidenceSafetyReason(source, chunk) && factsForChunk(chunk, source).some(fact =>
    fact.factType === 'assistance_restriction' || fact.factType === 'application_status' && fact.value === 'closed'));
}

export function hasCriticalQualification(text) {
  const source = { source_id: 'qualification' };
  return factsForChunk({ id: 'qualification', source_id: source.source_id, text }, source).some(fact =>
    fact.factType === 'assistance_restriction' || (fact.factType === 'application_status' && fact.value === 'closed'));
}

export function requestedIncomeYear(plan, now) {
  if (plan.subjectCategory !== 'housing' || !plan.requestedFacts.includes('income_limit')) return null;
  const years = [...plan.normalizedQuery.matchAll(/\b(?:19|20)\d{2}\b/g)].filter(match =>
    !/(?:[$€£]|usd)\s*$/i.test(plan.normalizedQuery.slice(0, match.index)) &&
    !/^\s*(?:dollars?\b|usd\b|%)/i.test(plan.normalizedQuery.slice(match.index + match[0].length)));
  const explicitYears = [...new Set(years.map(match => Number(match[0])))];
  if (explicitYears.length > 1) return null;
  // "Use the 2025 limits today" asks about current applicability. In contrast,
  // "2025 income limits and are applications open today" has a separate status
  // clause; that clause must not replace the explicitly requested income year.
  // Split before normalization removes question marks and commas. Decimal and
  // thousands separators stay inside their clause so amounts do not split it.
  const clauses = String(plan.query ?? plan.normalizedQuery).normalize('NFKC').toLowerCase()
    .split(/[!?;]|[.,](?!\d)|\b(?:and|but)\b/).map(normalizeQuestion).filter(Boolean);
  const mentionsIncome = clause => /\b(?:income|ami|earnings?|salary)\b/.test(clause);
  const currentIncome = clauses.some((clause, index) => {
    if (!/\b(?:current|currently|today|latest|now)\b/.test(clause)) return false;
    const followsIncome = index > 0 && mentionsIncome(clauses[index - 1]);
    const refersToLimits = followsIncome && (/\b(?:use|apply|rely on)\s+(?:them|those|these|it)\b/.test(clause) ||
      /\b(?:they|those|these|it)\b[^.!?;]*\b(?:valid|applicable)\b/.test(clause));
    if (!mentionsIncome(clause) && !refersToLimits) return false;
    // "What were the current limits for 2025?" uses current relative to 2025.
    if (explicitYears.length && /\b(?:was|were)\b/.test(clause) && !/\b(?:today|now)\b/.test(clause)) return false;
    return true;
  });
  if (currentIncome) return now.getUTCFullYear();
  if (explicitYears.length) return explicitYears[0];
  return /\b(current|currently|today|latest)\b/.test(plan.normalizedQuery) ? now.getUTCFullYear() : null;
}

function incomeTables(source, chunks, includeDatedHeadings = false) {
  return chunks.filter(chunk => !evidenceSafetyReason(source, chunk)).flatMap(chunk =>
    factsForChunk(chunk, source).filter(fact => Number.isInteger(fact.effectiveYear) &&
      (fact.factType === 'income_limit' || includeDatedHeadings && fact.factType === 'effective_year' &&
        /\b(?:income\s+(?:limits?|guidelines?|requirements?|thresholds?)|(?:maximum|minimum|household|annual)\s+income|area median income|AMI)\b/i.test(fact.quote.replace(/[_-]/g, ' '))))
      .map(fact => ({ source, chunk, year: fact.effectiveYear, fact })));
}

/** A source preference cannot override the effective year explicitly requested. */
export function selectIncomeEvidence(plan, selected, chunks, now) {
  const year = requestedIncomeYear(plan, now);
  const primary = selected[0];
  if (year === null || !primary) return selected;
  const current = incomeTables(primary.source, chunks).filter(table => table.year === year && !sourceIsStale(table.source, table.chunk, now))
    .map(table => withFactEvidence({ ...primary, chunk: table.chunk, required: true }, table.fact)).filter(Boolean)[0];
  if (!current) return selected;
  const currentEvidence = makeEvidence(current, plan.query, 0, now);
  if (!currentEvidence) return selected;
  let unquotedRequiredQualification = false;
  const retained = selected.flatMap(hit => {
    if (hit.source.source_id !== primary.source.source_id) return [hit];
    const evidence = makeEvidence(hit, plan.query, 0, now);
    if (!evidence || evidence.quote === currentEvidence.quote) return [];
    const facts = factsForChunk(hit.chunk, hit.source);
    const quoteStart = hit.chunk.text.indexOf(evidence.quote);
    const overlaps = (fact, start, end) => {
      const factStart = hit.chunk.text.indexOf(fact.quote);
      return factStart < end && factStart + fact.quote.length > start;
    };
    const otherIncome = facts.filter(fact => fact.factType === 'income_limit' && fact.effectiveYear !== year);
    if (!otherIncome.some(fact => overlaps(fact, quoteStart, quoteStart + evidence.quote.length))) return [hit];
    const represented = facts.filter(fact => evidence.quote.includes(fact.quote));
    // Preserve qualifications from an older table without presenting its income
    // amount as the answer for the requested year.
    return represented.filter(fact => fact.factType === 'assistance_restriction' || fact.factType === 'application_status')
      .flatMap(fact => {
        const start = hit.chunk.text.indexOf(fact.quote);
        if (otherIncome.some(income => overlaps(income, start, start + fact.quote.length))) {
          // Keep the literal qualification visible, but do not answer from a
          // quotation that inseparably includes an unconfirmed income amount.
          unquotedRequiredQualification = true;
        }
        const qualification = withFactEvidence({ ...hit, required: true }, fact);
        if (!qualification) unquotedRequiredQualification = true;
        return qualification ? [qualification] : [];
      });
  });
  return [current, ...retained].map(hit => unquotedRequiredQualification ? { ...hit, unquotedRequiredQualification: true } : hit);
}

/** Effective year comes from quoted source text, never the download timestamp. */
export function outdatedIncomeResponse(answer, plan, selected, chunks, now) {
  const requestedYear = requestedIncomeYear(plan, now);
  if (requestedYear === null) return null;
  const source = selected[0]?.source;
  if (!source) return null;
  // A dated heading can establish that a table is old, but cannot establish
  // the income value needed to answer a request for that year.
  const dated = incomeTables(source, chunks, true).sort((a, b) => b.year - a.year);
  const displayed = answer.evidence[0];
  if (displayed?.source_id === source.source_id && !displayed.stale && dated.some(table =>
    table.fact.factType === 'income_limit' && table.year === requestedYear &&
    table.chunk.id === displayed.chunk_id && displayed.quote.includes(table.fact.quote))) return null;
  if (!dated.length || dated.some(table => table.year === requestedYear)) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'I found income information, but the available quotations do not establish the income limits for the requested year.';
    answer.meaning = 'Ask the responsible agency to confirm the current income limits before relying on this resource.';
    return answer;
  }
  const table = dated.find(table => table.year < requestedYear) ?? dated.at(-1);
  if (!table) return null;
  let evidence = answer.evidence.find(item => item.chunk_id === table.chunk.id);
  if (!evidence || !evidence.quote.includes(String(table.year))) {
    const factStart = table.chunk.text.indexOf(table.fact.quote);
    const yearOffset = table.fact.quote.indexOf(String(table.year));
    const start = factStart + Math.max(0, yearOffset - 280);
    const end = Math.min(table.chunk.text.length, start + 720);
    const index = evidence ? answer.evidence.indexOf(evidence) : answer.evidence.length;
    const focused = makeEvidence({ source, chunk: table.chunk, evidenceQuote: { start, end } }, plan.query, index, now);
    if (focused) {
      if (evidence) answer.evidence[index] = focused;
      else answer.evidence.push(focused);
      evidence = focused;
    }
  }
  answer.status = 'potentially_outdated';
  answer.answer = `The available ${source.title} income table is labeled ${table.year}. I cannot confirm that those figures are the requested eligibility limits. Check the latest limits with the program agency.` + (evidence ? ` [${evidence.id}]` : '');
  answer.warnings.push('A recently retrieved page can still contain an older income table. Retrieval date is not the effective date of a rule.');
  return answer;
}
