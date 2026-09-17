import { retrieve } from '../../retrieval/search.mjs';
import { requestedDetails } from '../../retrieval/details.mjs';
import { evidenceSafetyReason, usableChunk } from '../../retrieval/eligibility.mjs';
import { sourceMatchesTopic } from '../../retrieval/scope.mjs';
import { housingSituation } from '../../housing/navigation.mjs';
import { programCandidates } from '../../housing/programs.mjs';
import { factsForChunk } from '../../domain/facts.mjs';
import { makeEvidence, withFactEvidence } from '../../citations/evidence.mjs';
import { classifyAnswerSections, preferredSections, supplementalSections, guidancePriorities } from '../../domain/answer-policy.mjs';
import { criticalQualificationChunks } from './qualifications.mjs';

function sectionChunk(source, chunks, sections, plan, supplemental = false) {
  if (!sourceMatchesTopic(source, plan.route)) return null;
  for (const section of sections) {
    const chunk = chunks.find(item => !evidenceSafetyReason(source, item) &&
      (usableChunk(item) || supplemental && factsForChunk(item, source).length > 0) && classifyAnswerSections(source, item).includes(section));
    if (chunk) return chunk;
  }
  return null;
}

function sameCitation(left, right, question, now) {
  return left.source.source_id === right.source.source_id && left.chunk.id === right.chunk.id &&
    makeEvidence(left, question, 0, now)?.quote === makeEvidence(right, question, 0, now)?.quote;
}

function requireCitation(selected, hit, question, now, first = false) {
  const existing = selected.findIndex(item => sameCitation(item, hit, question, now));
  if (existing >= 0) {
    selected[existing] = { ...selected[existing], ...hit, required: true };
    if (first) selected.unshift(...selected.splice(existing, 1));
  } else if (first) selected.unshift({ ...hit, required: true });
  else selected.splice(1, 0, { ...hit, required: true });
}

function requiredFactHit(primary, chunk, fact, selected, question, now) {
  const focused = withFactEvidence({ source: primary.source, chunk, score: primary.score, required: true }, fact);
  if (!focused) return null;
  // Keep neighboring qualifications when the entire passage fits. Otherwise a
  // separately focused citation protects a distant statement from rescoring.
  if (chunk.text.length <= 720) return { ...focused, evidenceQuote: { start: 0, end: chunk.text.length } };
  const covered = selected.find(hit => hit.chunk.id === chunk.id && hit.source.source_id === primary.source.source_id &&
    makeEvidence(hit, question, 0, now)?.quote.includes(fact.quote));
  return covered ? { ...covered, required: true } : focused;
}

/** Query-aware selection consumes domain metadata; it has no municipality/source IDs. */
export function selectEvidence(hits, plan, sources, chunks, now, unsupported) {
  const question = plan.query;
  const ranked = [...hits];
  const named = plan.entities.filter(entity => entity.type === 'program' && entity.sourceId).map(entity => entity.sourceId);
  const priority = [...new Set([...named, ...(plan.subjectCategory === 'housing' ? housingSituation(question, plan.route).preferredSourceIds : guidancePriorities(plan))])];
  if (plan.subjectCategory === 'housing') ranked.sort((a, b) => {
    const ai = priority.indexOf(a.source.source_id);
    const bi = priority.indexOf(b.source.source_id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b.score - a.score;
  });
  // Every matching source may declare section preferences. Priorities only order
  // sources; adding a program must not require adding an engine branch.
  for (const source of sources) {
    const existing = ranked.findIndex(item => item.source.source_id === source.source_id);
    if (existing < 0) continue;
    const chunk = sectionChunk(source, chunks, preferredSections(source, plan), plan);
    if (chunk) ranked[existing] = { ...ranked[existing], chunk };
  }
  for (const sourceId of [...priority].reverse()) {
    const source = sources.find(item => item.source_id === sourceId);
    if (!source) continue;
    const chunk = sectionChunk(source, chunks, preferredSections(source, plan), plan);
    const existing = ranked.find(item => item.source.source_id === sourceId);
    if (chunk) ranked.unshift({ source, chunk, score: existing?.score ?? 1, matches: 1 });
    else if (existing) ranked.unshift(existing);
  }
  const selected = [];
  let unquotedRequiredQualification = false;
  const hasPrioritySource = ranked.some(hit => priority.includes(hit.source.source_id));
  for (const hit of ranked) {
    if (hasPrioritySource && !priority.includes(hit.source.source_id)) continue;
    if (selected.some(item => item.source.source_id === hit.source.source_id)) continue;
    if (selected.length && !priority.includes(hit.source.source_id) && hit.score < ranked[0].score * 0.3) continue;
    selected.push(hit);
    if (selected.length === 3) break;
  }
  const primary = selected[0];
  const fields = plan.requestedFacts.filter(field => ['amount', 'fee', 'duration', 'deadline'].includes(field));
  if (primary) {
    const primaryChunks = chunks.filter(chunk => !evidenceSafetyReason(primary.source, chunk));
    if (plan.requestedFacts.includes('application_status')) {
      for (const chunk of primaryChunks) {
        const fact = factsForChunk(chunk, primary.source).find(item => item.factType === 'application_status');
        const statusHit = fact && requiredFactHit(primary, chunk, fact, selected, question, now);
        if (statusHit) {
          requireCitation(selected, statusHit, question, now, true);
          break;
        }
        if (fact) unquotedRequiredQualification = true;
      }
    }
    if (fields.length) {
      const details = retrieve(question, { sources: [primary.source], chunks: primaryChunks, queryPlan: plan, now, limit: primaryChunks.length }).hits
        .filter(hit => hit.detailScore > 0).sort((a, b) => Number(a.stale) - Number(b.stale) || b.detailScore - a.detailScore || b.score - a.score);
      for (const field of fields) {
        const detail = details.find(hit => requestedDetails(question, hit.chunk.text).includes(field));
        if (detail) requireCitation(selected, detail, question, now);
      }
    }
    if (fields.length || plan.requestedFacts.some(field => ['application_status', 'income_limit'].includes(field))) {
      const critical = [...new Set(criticalQualificationChunks(primary.source, primaryChunks))];
      const seen = new Set();
      for (const chunk of critical.reverse()) {
        const facts = factsForChunk(chunk, primary.source).filter(fact => fact.factType === 'assistance_restriction' ||
          fact.factType === 'application_status' && fact.value === 'closed');
        for (const fact of facts.reverse()) {
          const identity = JSON.stringify([fact.factType, fact.value, fact.quote]);
          if (seen.has(identity)) continue;
          seen.add(identity);
          const qualification = requiredFactHit(primary, chunk, fact, selected, question, now);
          if (qualification) requireCitation(selected, qualification, question, now, true);
          else unquotedRequiredQualification = true;
        }
      }
    }
  }
  for (const source of sources) for (const section of supplementalSections(source, plan, selected.some(hit => hit.source.source_id === source.source_id))) {
    const chunk = sectionChunk(source, chunks, [section], plan, true);
    if (chunk && !selected.some(hit => hit.chunk.id === chunk.id)) selected.push({ source, chunk, score: 1 });
  }
  if (plan.subjectCategory === 'housing' && !plan.route.needsJurisdiction && !unsupported && !fields.length) {
    for (const hit of programCandidates(question, hits, { limit: hits.length })) {
      if (selected.length >= 8) break;
      if (!selected.some(item => item.chunk.id === hit.chunk.id)) selected.push(hit);
    }
  }
  // An omitted qualification cannot silently become an unqualified answer.
  // Keep this on every hit so subsequent year-based promotion retains it.
  return unquotedRequiredQualification ? selected.map(hit => ({ ...hit, unquotedRequiredQualification: true })) : selected;
}
