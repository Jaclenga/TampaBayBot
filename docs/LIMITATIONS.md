# Known limitations

TampaBayBot is an independent source-only alpha for housing-information navigation. It cannot make an eligibility decision, give an official zoning determination or approve a permit. This guide summarizes the boundaries a resident or operator needs to understand; [release readiness](RELEASE_READINESS.md) records the current evidence and remaining launch work.

The public source package starts with no evidence and cannot answer factual questions until its operator [loads and reviews sources](DISTRIBUTION.md). Results from the populated development checkout do not establish the quality of a newly acquired corpus.

## Information and answer coverage

- The [source registry](DATA_SOURCES.md) is a bounded collection of program pages, guidance and map services for Tampa Bay. It does not cover every program or contact, complete municipal codes, or comprehensive-plan text.
- Answers use deterministic retrieval and literal excerpts, with optional model-assisted evidence selection. They can be repetitive or relevant without fully resolving the question. An exact quotation can still be incomplete or unhelpful in context; a model can select valid evidence poorly.
- Explicit routing patterns and synonyms can miss unusual phrasing, mixed intents, acronyms and spelling errors.
- Authority weights do not establish legal precedence. Conflict detection addresses only directly opposing application-status statements for the same program. Exceptions, superseded rules and other contradictions require review.
- Some evaluation measures are labeled template/keyword proxies. The separate claim-quality suite measures exact authored claims and citation relations for 12 dated fixtures. Neither is a real-world accuracy estimate, source accuracy audit or guarantee of completeness for arbitrary questions.

## Freshness and availability

Retrieval date means a response was obtained then; its content can still be old or contradictory. A weekly source-refresh workflow stages acquisitions and publishes only a metadata review report. An operator must review and approve an exact candidate digest before applying it; scheduled acquisition never deploys new evidence automatically.

- Upstream websites/APIs can fail, rate-limit, change schema or change terms. Failed refreshes retain dated prior evidence. An outage does not prove a program or designation is absent.
- A recent retrieval can contain an old income table, an unresolved reopening projection or a map amendment needing staff review. Dated examples and source-specific caveats are maintained in [DATA_SOURCES.md](DATA_SOURCES.md).

Operators must assign a refresh owner, inspect scheduled failures and changes, and use the reviewed apply/build workflow in [source updates](SOURCE_UPDATES.md). Residents should verify time-sensitive information through the cited agency.

## Geographic limits

- Address selection is required. Locator scores are not probabilities. New/incomplete addresses, units and shared buildings can remain unresolved.
- Resource navigation covers selected sources for Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco. Other municipalities do not automatically inherit county programs or rules. Unspecified/conflicting cities require clarification.
- Live property layers cover Tampa, St. Petersburg, Clearwater and Pasco County. Pasco zoning and future land use are withheld wherever a parcel intersects a municipality or its municipal check fails. Official boundary intersection establishes which connected city applies; a mailing address, selected resource area, or regional coordinate guard does not.
- Pasco address candidates require explicit selection. An empty geocoder result outside connected locator coverage does not mean an address is invalid.
- Valid, bounded parcel polygons are used for whole-parcel zoning and future-land-use intersections. Missing or ambiguous geometry explicitly falls back to address-point context. Boundary touches and multiple results require agency review; intersections do not establish legal split-zoning areas.
- The MVP does not check every historic/overlay district, flood constraint, easement, deed restriction, utility condition, variance or site-specific approval.
- Multiple features, missing fields and transfer limits remain uncertainty states. No result is an official property or project determination.

Use the official maps and planners for whole-property decisions. See [GIS methods](GEOSPATIAL.md).

## Development records

The independent source is a pinned normalized core snapshot dated August 23, 2026, not a complete current inventory. Search excludes rows without accepted coordinates/identifiers and does not query every location of a multi-location activity.

The pinned development snapshot covers Tampa only. Separate official adapters query Clearwater planning cases, St. Petersburg district projects, and Pasco in-review zoning/comprehensive-plan cases. St. Petersburg and Pasco live checks passed on September 13, 2026; availability can change. Pasco layers include older entries, and St. Petersburg supplies no source update dates. These are limited published cases, not complete permit inventories. Every adapter verifies geography and labels its scope; absence or outage never means no development occurred.

The Tampa snapshot uses straight-line great-circle point distance and displays the nearest 30 records with total matches/truncation. Official city and county adapters return up to 30 project/case polygons intersecting the requested radius; they assign no numeric polygon distance. Neither method establishes walking distance, parcel-edge distance or a legal relationship. Source dates retain their different meanings, including Pasco GIS record edit dates; temporal groups are not measured construction-start trends.

A permit-like name or status does not demonstrate physical work started or finished. No match does not establish inactivity. Refreshing the pinned Tampa snapshot requires reviewing a newer normalized dataset, updating its commit/hash/snapshot metadata and rerunning integrity/geographic checks. A fresh official query does not establish that the publisher has updated each case's status.

## Accessibility, language and human review

WCAG 2.1 AA is a target, not verified conformance. Thirty human-audit responses remain pending independent review. Manual keyboard, screen-reader, 200% text resizing and resident usability checks also remain pending unless actual later results are recorded in [ACCESSIBILITY.md](ACCESSIBILITY.md) and audit artifacts.

The app is English-first. Separated UI strings are preparation for localization, not a completed translation system. Regulatory terminology has no verified translation. Official destinations and external PDFs/maps/forms have their own accessibility limitations.

## Privacy and operations

The app does not save questions or addresses to a database or browser storage. A bounded topic/program/jurisdiction context is kept temporarily in page memory for follow-up questions and cleared on reset or reload. Eligible questions and public excerpts go to the configured model provider when assistance is enabled. Address text goes to the configured Hillsborough and Pinellas locators; selected coordinates go to connected municipal-boundary and property services. Opening the optional map sends coordinates to OpenStreetMap. Transient caches, host logs and provider retention are separate. This is not a promise of anonymity or zero retention. [SECURITY.md](../SECURITY.md#data-flow-and-privacy) explains each boundary.

Identifier and instruction-pattern checks are limited: they can miss disclosures or reject unrelated text, and trusted extensions are not sandboxed. Validation constrains model output but cannot guarantee useful evidence selection. The recorded [Ollama tests](OLLAMA_TESTING.md) cover one model/configuration; other deployments need their own review. Keep `LLM_PROVIDER=none` for the default no-model path, and use the [model guide](LLM.md) for local/hosted configuration and cloud-forwarding limits.

Shared request/concurrency limits, a source-refresh schedule, monitoring, retention and an operational rollback process remain operator responsibilities. A [private vulnerability-reporting channel](../SECURITY.md#reporting-a-problem) exists, but no staffed incident-response guarantee is made. [Operations](OPERATIONS.md) and [release readiness](RELEASE_READINESS.md) describe configuration and the work needed before unrestricted resident access.

Historical Windows and Linux production-browser runs exposed a local-runtime transport failure after an unread upload was rejected. Current Windows application verification passes all 15 cases by testing stalled uploads against the exact compiled Worker through a direct route and retaining the static-assets route for resident, asset, accessibility and response-policy checks. This verifies the application behavior but does not establish how a hosted edge or Miniflare's defective local static-assets proxy behaves after an abandoned upload. The [follow-up report](BUG_FIX_FOLLOWUP_2026-09-12.md) preserves the earlier evidence.

Public source availability is separate from operating a public resident service. Authenticated hosted smoke testing and an operator's provider/deployment checks remain separate release steps, recorded in [release readiness](RELEASE_READINESS.md).

## Terms and independence

Public access does not imply unrestricted redistribution. External terms apply separately from MIT, and the project is not an official City, County or State service. [NOTICE.md](../NOTICE.md) records attribution and independence; the [distribution policy](DISTRIBUTION.md) governs source packages.
