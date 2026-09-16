# Known limitations

TampaBayBot is an independent source-only alpha for housing-information navigation. It cannot decide eligibility, give an official zoning determination or approve a permit. The package starts without evidence; an operator must [load and review sources](DISTRIBUTION.md). Historical development results do not establish the quality of a new corpus. [Release readiness](RELEASE_READINESS.md) records verification and remaining launch work.

## Information and answer coverage

- The [source registry](DATA_SOURCES.md) covers selected Tampa Bay program pages, guidance and maps, not every program/contact, complete municipal codes or comprehensive-plan text.
- Literal excerpts can be repetitive, incomplete or unhelpful. Optional model selection can choose valid evidence poorly. Routing can miss unusual phrasing, mixed intents, acronyms and spelling errors.
- Authority weights do not establish legal precedence. Conflict detection catches only directly opposing application-status statements for the same program; exceptions, supersession and other contradictions require review.
- [Evaluation](EVALUATION.md) includes template/keyword proxies and a separate claim-quality suite with 12 dated fixtures. Neither measures general real-world accuracy, audits source accuracy or guarantees completeness.

## Freshness and availability

Retrieval dates do not establish current content. Sources may retain old income tables, unresolved reopening projections or map amendments needing staff review. Websites/APIs can fail, rate-limit or change schema/terms. [Failed-candidate rules](SOURCE_UPDATES.md#acquire-a-candidate) retain dated prior evidence only for unchanged source definitions. Outages do not prove a program or designation is absent.

Weekly refreshes stage acquisitions and publish a metadata review report. An operator must approve the exact candidate digest before applying it; acquisition never deploys evidence automatically. Operators need a refresh owner and the [reviewed apply/build workflow](SOURCE_UPDATES.md). Residents should confirm time-sensitive information with the cited agency.

## Geographic limits

- Every address candidate requires selection. Scores are not probabilities, and new/incomplete addresses, units or shared buildings can remain unresolved. No geocoder match does not establish an invalid address.
- Resource navigation covers selected sources for Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco. Other municipalities do not inherit county coverage; missing/conflicting cities require clarification.
- Live property layers cover Tampa, St. Petersburg, Clearwater and Pasco County. Official boundaries establish coverage, not mailing addresses or resource selections. Pasco zoning/land use is withheld when a parcel intersects a municipality or the municipal check fails.
- Valid parcel polygons support whole-parcel intersections; missing/ambiguous geometry falls back to labeled address-point context. Boundary touches, multiple results, missing fields and transfer limits require review. Intersections do not establish legal split-zoning areas.
- The app does not check every historic/overlay district, flood constraint, easement, deed restriction, utility condition, variance or site-specific approval.

Use the official maps and planners for whole-property decisions. See [GIS methods](GEOSPATIAL.md).

## Development records

The independent Tampa source is a pinned August 23, 2026 snapshot. It excludes rows without accepted coordinates/identifiers and does not search every location of a multi-location activity. Separate official adapters cover Clearwater planning cases, St. Petersburg district projects and Pasco in-review zoning/comprehensive-plan cases. These are limited published records, not complete current inventories. Pasco includes older entries; St. Petersburg provides no source update dates.

Tampa results use representative-point distance; official adapters use radius/polygon intersections without numeric polygon distance. Both return at most 30 records. Neither establishes walking/parcel-edge distance or a legal relationship. Date groups preserve different source meanings and are not construction-start trends. A permit/status does not prove work started or finished; no match or an outage does not prove inactivity.

[GIS methods](GEOSPATIAL.md#tampa-development-records-adapter) defines distance, truncation, dated checks and snapshot-refresh requirements. A fresh query alone does not establish updated case status.

## Accessibility, language and human review

WCAG 2.1 AA conformance is unverified. Thirty human-audit responses and manual keyboard, screen-reader, 200% text resizing and resident usability checks remain pending unless later results are recorded in [ACCESSIBILITY.md](ACCESSIBILITY.md) and audit artifacts.

Question, property and reference interfaces support English and Spanish. Source titles, quotations and records retain their original language; regulatory text is not silently translated. Spanish wording still needs independent fluent-speaker and resident review. External PDFs, maps, forms and agency sites have their own accessibility limits.

## Privacy and operations

Questions and addresses are not saved to a database or browser storage. Bounded follow-up context stays in page memory until reset/reload. Enabled models receive eligible questions and public excerpts; locators receive address text, property services receive coordinates, and opening the optional map sends coordinates to OpenStreetMap. Caches, host logs and provider retention are separate; this does not promise anonymity or zero retention. [Security](../SECURITY.md#data-flow-and-privacy) details these flows.

Identifier/instruction screening can miss disclosures or reject unrelated text; trusted extensions are not sandboxed. Model tests cover specific configurations, and localhost does not guarantee local inference. [LLM.md](LLM.md) covers provider review and cloud forwarding; `LLM_PROVIDER=none` is the default.

Operators own shared request/concurrency limits, refreshes, monitoring, retention and rollback. The [private reporting channel](../SECURITY.md#reporting-a-problem) carries no staffed incident-response guarantee. [Operations](OPERATIONS.md) describes the required controls.

Windows/Linux local production runs exposed a transport failure after rejected unread uploads. Current Windows verification passes 15 cases using the compiled Worker directly for stalled uploads and the static-assets route for other checks. This does not verify hosted-edge or local static-assets-proxy behavior after abandoned uploads; see the [investigation](BUG_FIX_FOLLOWUP_2026-09-12.md).

Public source availability is separate from a public resident service. Authenticated hosted smoke and operator provider/deployment checks remain release steps in [release readiness](RELEASE_READINESS.md).

## Terms and independence

Public access does not imply unrestricted redistribution. External terms apply separately from MIT, and the project is not an official City, County or State service. [NOTICE.md](../NOTICE.md) records attribution and independence; the [distribution policy](DISTRIBUTION.md) governs source packages.
