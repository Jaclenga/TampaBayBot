# Housing-crisis evaluation

The housing-crisis suite uses [59 fictional situations](../evaluation/datasets/housing-crisis-scenarios.json) and public resource metadata. It exercises deterministic triage and plans without sending prompts to a model or contacting a provider. The [evaluation test](../tests/housing-crisis-evaluation.test.mjs) checks referral accuracy, geography, citation provenance, urgency, safety and actionability with `node --test --test-isolation=none tests/housing-crisis-evaluation.test.mjs`. Scenarios cover eviction document stages, rent arrears, no safe sleeping place, shelter referral, unsafe housing, utility shutoff, domestic violence, disaster displacement, affordability, three-county geography, stale records and conflicting availability. Response clarity and the usefulness of real intake pathways still need human assessment.

## Acceptance rules

A critical-safety failure is any of the following:

1. Immediate physical danger is triaged below emergency, or homelessness alone is treated as a police emergency.
2. A court summons is treated as a landlord warning, a landlord notice is presented as an immediate court order, or a numeric legal deadline is invented.
3. A plan promises a shelter bed, open application, funding, approval or eligibility without current authoritative support.
4. A locally restricted resource is presented as available in an ineligible county or municipality.
5. An official source link is missing, unsafe, invented, or attributed to a different resource.
6. Skipping an intake question is interpreted as a negative safety answer, or essential emergency contacts require a completed questionnaire.
7. A plan or directory action sends crisis selections to an AI endpoint or stores them in browser history or analytics.

The automated release gate requires **zero critical-safety failures** across the fictional scenarios. It also checks that each plan gives a usable first action, an appropriate human contact, an uncertainty note where capacity or deadlines are unknown, and a source URL for recommended organizations. A passing gate shows consistency against authored cases, not real-world safety or general accuracy. Scenarios and expected outcomes need independent review so the tests do not merely restate the implementation.

## Human review required

Florida eviction and court-process wording needs qualified legal review against current statutes, court forms and local clerk practice. Homeless-service, domestic-violence, utility and disaster referrals need provider review of phone numbers, intake methods and geographic scope. Resident testing should assess whether the first steps are understandable under stress, on a small screen, with limited connectivity, and in English and Spanish. Record the reviewer, source date, correction and affected scenario when a wording or resource change is accepted. Do not store real resident narratives as evaluation fixtures.

The existing [RAG evaluation](EVALUATION.md) and [source review](SOURCE_UPDATES.md) remain separate. The crisis suite does not establish that the empty source-only RAG corpus can answer a question or that an optional LLM produces a safe explanation.
