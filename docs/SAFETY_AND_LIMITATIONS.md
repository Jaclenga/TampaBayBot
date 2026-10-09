# Housing-crisis safety and limitations

TampaBayBot is a navigation aid. It cannot dispatch emergency help, interpret a court document for an individual, determine eligibility, reserve shelter space, confirm program funding, or provide legal advice. A resource match is a starting point for contacting a qualified organization. The official source and the organization should confirm current details before a resident acts on them.

## Safety decisions

- Immediate physical danger calls for emergency services. The [National 911 Program](https://www.911.gov/) describes 911 as the emergency contact. A person who lacks a place to sleep needs a shelter or coordinated-entry intake channel; homelessness alone is not a reason to direct someone to police.
- Domestic violence calls for privacy-aware specialist support and a safe way to leave the page. The directory provides local provider contacts. It does not claim that a hotline can guarantee a bed or that any particular safety step is right for every survivor.
- An eviction summons or other court paper deserves prompt attention. The plan directs the resident to read the actual paper, contact the appropriate clerk and seek legal aid. It never computes a deadline from an assumed service date or says that a landlord warning itself requires immediate departure. [Florida Courts self-help](https://help.flcourts.gov/) is general information, not legal advice.
- A shutoff notice, serious housing hazard, disaster displacement or loss of housing within days is triaged separately from long-term affordability questions. Triage uses explicit rules and user selections, not a model judgment. A skipped question is not treated as a negative answer.

The application avoids confrontational instructions, unsupported legal outcomes, promised shelter openings, invented eligibility decisions and unsourced deadlines. It makes uncertain availability explicit. Human legal aid, shelter intake, utility providers and court staff are the appropriate next contacts for consequential decisions.

## Privacy boundary

The optional intake uses broad selections and can be skipped. It does not require an address, name, case number, household income, immigration status or document upload. Do not include these details in a question unless they are necessary for the official organization you contact. Crisis selections and plans are not stored in browser history, local storage, analytics or the usage-limit database. Existing chat questions may be sent with reviewed source passages to an enabled model provider; see [model data flow](LLM.md) and [security and privacy](../SECURITY.md). The provider and hosting platform have their own retention policies.

The directory's `verifiedAt` date records a check of public pages and contact listings. It is not a phone confirmation of funding, bed capacity, application acceptance or hours unless a record says otherwise. A stale or unavailable source must be labeled and checked with the publisher. See [resource verification](RESOURCE_VERIFICATION.md).

## Review before public use

The current source-only checkout has no downloaded RAG evidence. The static directory and deterministic plan can still supply official links, but they do not prove that a public chat answer is complete. Automated tests and accessibility scans are development checks. A qualified Florida housing attorney or legal-aid reviewer should review eviction wording and deadline handling; local service providers should check intake referrals; residents and assistive-technology users should test the actual hosted experience. Confirm the Pages-to-Worker binding, model fallback, privacy/logging settings and emergency directory on the deployed URL before claiming production readiness.
