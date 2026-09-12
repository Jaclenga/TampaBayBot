# Known limitations

ParcelPrivateer v0.1 is a review build. It provides source navigation and informational geographic context; it is not an eligibility decision, legal opinion, zoning determination or permit approval.

## Information and answer coverage

- The seed corpus has 12 first-party source groups and 257 chunks, not every program, ordinance, application or contact. It does not contain the complete current Tampa municipal code or comprehensive-plan text.
- Answers use deterministic retrieval and literal excerpts, with optional model-assisted evidence selection. They can be repetitive or relevant without fully resolving the question. An exact quotation can still be incomplete or unhelpful in context; a model can select valid evidence poorly.
- Explicit routing patterns and synonyms can miss unusual phrasing, mixed intents, acronyms and spelling errors.
- Authority weights do not establish legal precedence. Conflict detection addresses only directly opposing application-status statements for the same program. Exceptions, superseded rules and other contradictions require review.
- Some evaluation measures are labeled template/keyword proxies. They are not real-world accuracy estimates, source accuracy audits or guarantees of completeness.

## Freshness and availability

Retrieval date means a response was obtained then; its content can still be old or contradictory. No automatic background source-refresh job is configured by this repository.

- RMAP describes new move-in costs, while its displayed income table is labeled 2025. Do not present those amounts as verified 2026 limits or promise assistance for existing rent arrears.
- HRRP says new applications are not being accepted while projecting a summer 2026 reopening. September retrieval does not establish reopening; check with the program.
- Plan Hillsborough reports quarterly map updates and asks users to verify individual parcels. Recent amendments may need staff review.
- Upstream websites/APIs can fail, rate-limit, change schema or change terms. Failed refreshes retain dated prior evidence. An outage does not prove a program or designation is absent.

Operators must assign a refresh owner, run ingestion at the configured interval, review changes and rerun the benchmark. Residents should verify time-sensitive information through the cited agency.

## Geographic limits

- Address selection is required. Locator scores are not probabilities. New/incomplete addresses, units and shared buildings can remain unresolved.
- Official boundary intersection establishes City coverage; a Tampa postal address or regional coordinate guard does not.
- Queries intersect the selected address point, not the entire parcel polygon. Split zoning, boundary edges and shared sites can need manual review.
- The MVP does not check every historic/overlay district, flood constraint, easement, deed restriction, utility condition, variance or site-specific approval.
- Multiple features, missing fields and transfer limits remain uncertainty states. No result is an official property or project determination.

Use the official maps and planners for whole-property decisions. See [GIS methods](docs/GEOSPATIAL.md).

## Development records

The independent source is a pinned normalized core snapshot dated August 23, 2026, not a complete current inventory. Search excludes rows without accepted coordinates/identifiers and does not query every location of a multi-location activity.

Distance is straight-line great-circle point distance, not walking distance, parcel-edge distance or a legal relationship. The nearest 30 records are returned with total matches/truncation. Source dates have different meanings; temporal groups are not measured construction-start trends.

A permit-like name or status does not demonstrate physical work started or finished. No match does not establish inactivity. Refreshing requires reviewing a newer normalized dataset, updating the pinned commit/hash/snapshot metadata and rerunning integrity/geographic checks.

## Accessibility, language and human review

WCAG 2.1 AA is a target, not verified conformance. Thirty human-audit responses remain pending independent review. Manual keyboard, screen-reader, 200% text resizing and resident usability checks also remain pending unless actual later results are recorded in [ACCESSIBILITY.md](ACCESSIBILITY.md) and audit artifacts.

The app is English-first. Separated UI strings are preparation for localization, not a completed translation system. Regulatory terminology has no verified translation. Official destinations and external PDFs/maps/forms have their own accessibility limitations.

## Privacy and operations

Questions and addresses are not saved to an application database or browser storage. An enabled model provider receives eligible resident questions and bounded public-source excerpts; the question can contain an address or personal details the resident typed. Provider logging, retention and any cloud forwarding are separate from the application's storage policy. Location requests go to City GIS. Transient server caches can retain URLs/responses; hosting/proxy logs are configured separately. This does not establish anonymity or zero retention.

Built-in privacy checks recognize selected Social Security/account/payment-card/access-key patterns, not every identifier or personal detail. They can miss disclosures or match unrelated numbers and do not redact a permitted question before model transfer. Recognizable instruction attacks skip model use while preserving navigation; legitimate questions about income, disability and other sensitive circumstances remain supported. [Custom guardrail hooks](docs/GUARDRAIL_INSERTS.md) add operator policies but run as trusted server code, not sandboxed plug-ins. Timeouts cannot terminate a hook that ignores cancellation or blocks the event loop, and adding an external check creates another data-flow responsibility.

`LLM_PROVIDER=none` remains the default. An optional model cannot add unsupported prose/citations or change conservative answer states, but literal-output validation does not establish selection usefulness. Adapter fixtures and synthetic local-provider tests do not establish real-model quality, local hardware performance or remote-provider reliability. Choose and evaluate the actual model/version before enabling it for residents.

A hosted worker cannot reach a resident's local Ollama through `localhost`. Local inference requires an accessible local server and locally running model weights; Ollama cloud-model forwarding can still send requests remotely even when the configured endpoint is loopback. Provider credentials and deployed settings must use server-side runtime secrets/bindings. See [LLM setup and data flow](docs/LLM.md).

No per-user runtime rate limit, staffed incident process, automatic source-refresh schedule, production monitoring policy or operational rollback process is established by this review build. Configure them before unrestricted public launch. Same-origin checks, bounded requests, fixed source URLs and integrity checks address narrower risks.

The final production-browser run on Windows has one unresolved local-runtime transport failure: rejecting an unread oversized upload can cause the next pooled request to fail in Miniflare's static-assets path. It reproduces with a minimal Worker without application code. The application retains its byte/time limits; no unbounded drain or success-masking retry was added. Available tested runtime versions did not fix it. Hosted and Linux behavior remain unverified; see [the follow-up report](docs/BUG_FIX_FOLLOWUP_2026-09-12.md).

A private review deployment is recorded in the deployment receipt (development artifact omitted from source-only release); authenticated hosted smoke testing and provider-specific deployment verification remain separate release steps. Exact remaining actions are in [release readiness](docs/RELEASE_READINESS.md).

## Terms and independence

Public accessibility does not imply unrestricted redistribution. External terms apply separately from the MIT software license. The project is not sponsored by or affiliated with the City, County, Planning Commission, Florida Housing or State. Important decisions require verification with the responsible agency.
