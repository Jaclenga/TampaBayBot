import { requestedDetails, requestedDetailScore } from '../../retrieval/details.mjs';
import { hasCriticalQualification, outdatedIncomeResponse } from './qualifications.mjs';
import { factsForChunk } from '../../domain/facts.mjs';

export function jurisdictionResponse(answer, route) {
  answer.status = 'needs_jurisdiction';
  answer.needsAddress = false;
  answer.answer = route.jurisdictionReason === 'unsupported_municipality'
    ? 'I do not have a verified city-specific collection for the municipality you named. Confirm its local programs and rules with that city; county rules may not apply inside city limits.'
    : route.jurisdictionReason === 'conflict'
      ? 'The question and selected location name different jurisdictions. Confirm the city or county you want to use before I provide local programs or rules.'
      : 'I need the city or county to find the right local programs, rules, and agency. Select a jurisdiction or name it in your question.';
  answer.meaning = 'Any resources shown here are broadly applicable navigation. They do not establish local program eligibility, property jurisdiction, or permission to build.';
  return answer;
}

export function officialJudgmentResponse(answer) {
  answer.needsAddress = false;
  answer.status = 'official_judgment';
  answer.answer = 'I cannot make an official eligibility, legal, zoning, or permitting determination. Use the responsible agency to request a decision; any cited resources are starting points.';
  answer.meaning = 'The agency needs the relevant household or project details and current rules. A source page or nearby record does not establish approval.';
  return answer;
}

export function unsupportedResponse(answer, unsupported) {
  answer.status = 'insufficient_evidence';
  answer.answer = `I could not verify the ${unsupported} you named in this jurisdiction's collection. Any sources shown are places to check; they do not establish that it exists.`;
  answer.meaning = 'Confirm the exact name and jurisdiction with the responsible agency before relying on it.';
  if (answer.needsJurisdiction) answer.needsAddress = false;
  return answer;
}

function unquotedQualificationResponse(answer) {
  answer.status = 'insufficient_evidence';
  answer.answer = 'I found relevant guidance, but the available quotations cannot preserve all application conditions or restrictions.';
  answer.meaning = 'Ask the responsible agency to confirm the application conditions and restrictions before relying on this resource.';
  return answer;
}

export function finishResponse(answer, { plan, selected, chunks, date, unsupported, conflict }) {
  const route = plan.route;
  const query = plan.query;
  const main = answer.evidence[0];
  if (unsupported) return unsupportedResponse(answer, unsupported);
  if (conflict) {
    if (conflict.unquotable) return unquotedQualificationResponse(answer);
    answer.status = 'conflicting_evidence';
    answer.answer = 'The available official sources disagree about whether applications are open. I cannot resolve that conflict from these snapshots. [E1] [E2]';
    answer.meaning = 'Ask the program agency to confirm current availability before applying. Both source statements are shown below.';
    return answer;
  }
  const outdated = outdatedIncomeResponse(answer, plan, selected, chunks, date);
  if (outdated) return outdated;
  if (route.subjectCategory === 'zoning' && /\b(what does|what is|define|meaning|mean|definition|maximum|how many|setback|height limit)\b/.test(route.normalized) && /\b(rm-?24|rs-?50|nt-?\d|ns-?\d|nsm-?\d|ldr|lmdr|mdr|hdr|mhdr|far|adu|setback|density|variance|overlay|maximum|how many|height limit)\b/.test(route.normalized) && !route.officialJudgment) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'This collection does not contain a verified definition or rule that answers that detail. Use the official zoning source and ask planning staff to confirm the meaning and requirements.';
    answer.meaning = 'A map label alone is not enough to establish a numerical limit or permission to build.';
    return answer;
  }
  if (route.officialJudgment) return officialJudgmentResponse(answer);
  if (route.needsJurisdiction && route.subjectCategory !== 'navigation') return jurisdictionResponse(answer, route);
  if (route.needsAddress) {
    answer.status = 'needs_location';
    answer.answer = route.hasAddress
      ? 'I found sources to start with. Confirm the address and jurisdiction in the property lookup before relying on property-specific information.'
      : 'Enter a full street address in the property lookup so the location and jurisdiction can be checked. I cannot identify a property from this question alone.';
    answer.meaning = route.subjectCategory === 'development'
      ? 'Nearby records describe recorded activity. Distance alone does not show that a record applies to a property or establishes what is allowed there.'
      : 'The official source and the property lookup are starting points. Ask the responsible planning or permitting staff to verify requirements for a specific property.';
    return answer;
  }
  if (route.subjectCategory === 'development' || (route.subjectCategory === 'permitting' && /\b(my permit|permit (?:is )?approved|permit status)\b/.test(route.normalized))) {
    answer.status = 'insufficient_evidence';
    answer.answer = route.subjectCategory === 'development'
      ? 'I cannot establish activity or predict future development from these general pages. Use the property lookup to find dated nearby records, then verify the original record with the agency.'
      : 'I cannot confirm a permit decision from general permit guidance. Find the specific record in the official permit resource and verify its status with the permitting agency.';
    answer.meaning = 'An application, a permit decision, and completed construction are different events. A general source page cannot establish a specific record status.';
    return answer;
  }
  if (main.stale) {
    answer.status = 'potentially_outdated';
    answer.answer = 'The best matching source snapshot may be outdated. I cannot confirm that its program availability or instructions still apply.';
    answer.meaning = `The preserved ${main.title} excerpt is shown below. Check the live page with the agency before acting.`;
    return answer;
  }
  if (route.subjectCategory === 'navigation' && !/\b(housing|zoning|permit|development)\b/.test(route.normalized)) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'Tell me what you are trying to do, such as finding housing help, checking a property, or applying for a permit. I need that detail to identify the right agency.';
    answer.evidence = [];
    answer.nextSteps = [];
    answer.coverage.citedSourceCount = 0;
    return answer;
  }
  const fields = plan.requestedFacts.filter(field => ['amount', 'fee', 'duration', 'deadline'].includes(field));
  const details = answer.evidence.filter(item => item.source_id === main.source_id && !item.stale && requestedDetailScore(query, item.quote) > 0);
  if (fields.some(field => !details.some(item => requestedDetails(query, item.quote).includes(field)))) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'I found relevant guidance, but the available source quotations do not establish every amount, fee, time period, or deadline you asked for.';
    answer.meaning = 'Ask the responsible agency to confirm the missing detail before relying on this resource.';
    return answer;
  }
  if (selected.some(hit => hit.unquotedRequiredQualification)) return unquotedQualificationResponse(answer);
  if (plan.subjectCategory === 'housing' && plan.requestedFacts.includes('application_status') &&
      !answer.evidence.some(item => item.source_id === main.source_id && !item.stale &&
        factsForChunk({ id: item.chunk_id, source_id: item.source_id, text: item.quote }, { source_id: item.source_id })
          .some(fact => fact.factType === 'application_status'))) {
    answer.status = 'insufficient_evidence';
    answer.answer = 'I found relevant guidance, but the available quotations do not confirm whether applications are open or closed.';
    answer.meaning = 'Ask the responsible agency to confirm current availability before applying.';
    return answer;
  }
  answer.status = 'answered';
  answer.answer = `Start with ${main.title}. The source says: “${main.quote}” [${main.id}]`;
  if (fields.length || answer.requiredEvidenceIds?.length) {
    const required = new Set(answer.requiredEvidenceIds ?? [main.id]);
    const context = answer.evidence.filter(item => item.source_id === main.source_id && item.id !== main.id && !item.stale &&
      (required.has(item.id) || details.includes(item) || hasCriticalQualification(item.quote)));
    answer.requiredEvidenceIds = [main.id];
    for (const item of context) {
      answer.answer += `\n\nThe same source gives this detail: “${item.quote}” [${item.id}]`;
      answer.requiredEvidenceIds.push(item.id);
    }
  }
  answer.meaning = route.subjectCategory === 'housing'
    ? 'This resource may be relevant to your situation. Use its official application or contact path and check the questions below; this is not an eligibility decision.'
    : route.subjectCategory === 'development'
      ? 'For observed activity, use public record details and dates. A record does not establish the rules or development rights for another property.'
      : route.subjectCategory === 'zoning'
        ? 'Use the official source to check the designation and ask planning staff to explain how it applies to your property. This response does not interpret the code for a specific project.'
        : route.subjectCategory === 'permitting'
          ? 'Use the permit resource to find the right application path. Ask permitting staff to confirm the requirements for your project.'
          : 'Use the official link below to reach the source or the agency responsible for it.';
  if (/\b(latest|today|right now|current|currently|recent)\b/.test(route.normalized)) answer.warnings.push('This answer uses the dated source snapshot shown in the evidence; it is not a live confirmation of current availability or record status.');
  return answer;
}
