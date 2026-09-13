# Changelog

## Unreleased

- Add shared D1 request/concurrency/outbound budgets, absolute deadlines, protected aggregate metrics, truthful readiness, monitor alerts, maintenance and incident/rollback procedures.
- Translate property tools and reference pages into Spanish, retain source-language attributes and preserve language-switch focus. Use relative font sizes and verify actual browser zoom/text enlargement, keyboard-only flows and forced colors.
- Update current versus historical verification, authenticated hosted smoke, coordinate sharing and whole-parcel documentation.

Renamed the project to TampaBayBot, aligning application branding, package names, deployment examples, repository links and project-specific environment variables with `Jaclenga/TampaBayBot`. Previous environment variable names remain supported as compatibility aliases; historical deployment and audit records retain their original identifiers.

- Preserve short evidence facts such as assistance limits and require relevant program-status cautions to survive optional model selection.
- Add original fictional demo evidence, a demo screenshot, and source-independent unit/browser checks that run on a fresh public checkout. Missing release manifests now fail CI.
- Stage source updates for digest-bound review, validate and build approved candidates, and publish a single atomic corpus generation with recovery and rollback. Downloads use streaming limits, bounded retries and deadlines. Weekly automation publishes metadata-only review reports.
- Retain temporary topic and jurisdiction context for follow-up questions, with a reset control and existing privacy boundaries. Add Spanish housing navigation and interface text while preserving original source quotations.
- Add Pasco parcel and unincorporated zoning/land-use queries, whole-parcel intersections with explicit point fallback, Clearwater planning cases, and Pasco in-review zoning/comprehensive-plan cases. St. Petersburg district-project queries passed again on September 13, 2026 after the earlier upstream outage. Individual source failures remain explicit; planning cases do not establish construction or complete permit coverage.
- Document contributor manifest updates and strengthen release verification to reject downloaded evidence, populated historical reports, private configuration and unsupported payload paths even when their hashes match.
- Require matching fresh evidence for explicit factual questions, preserve multiple program restrictions, and handle Spanish application/coverage follow-ups. Missing facts no longer receive a general `answered` response.
- Retry approved source deployments with verified artifact copies, preserve changed-source provenance and publisher dates honestly, and reject private deployment receipts during manifest preparation.
- Correct Pasco agency-navigation provenance and prevent cold demo startup from reloading away a successful answer.

Consolidated the application, components, runtime libraries and Worker under `src/`, and moved the Sites build adapter under `scripts/build/`. Added a documented root layout plus canonical package, contribution and maintainer references to the public repository, `Jaclenga/TampaBayBot`.

Added the published alpha.4 factual-accuracy, citation-correctness and citation-completeness results to the project README and evaluation documentation, together with their benchmark scope and interpretation limits.

## v0.1.0-alpha.4 — 2026-09-12

Added a deterministic claim-quality suite for factual accuracy, citation correctness and citation completeness. Twelve checked-in cases cover Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco. The oracle stores exact-claim hashes and allowed source/chunk support pairs without bundling copied excerpts; runtime answers cannot access it. Mutation tests verify that fabricated claims, misattributed evidence, missing markers, partial coverage and extra unsupported claims fail the appropriate metric.

Moved the accessibility, data-source, limitations and methodology guides into `docs/`. The repository root now contains the project entry point, standard open-source governance and legal files, package manifests, and configuration required by the build tools.

The offline suite is version 1.2.0 and now contains 236 cases. All 236 code tests, 77 narrative cases, 236 offline cases and 4,370 applicable checks pass against the retained development corpus; 582 checks are N/A. The three claim metrics each pass 12/12 cases. Typecheck, lint, production build and the focused production evaluation-page browser case pass. These bounded fixtures do not establish open-ended semantic accuracy, current source truth or resident usefulness.

## v0.1.0-alpha.3 — 2026-09-12

Derived the health endpoint version from `package.json` so independently built artifacts always report the version recorded in their manifest. This corrects the final standalone CI failure discovered after alpha.2 was published; all earlier source, history-scan, install, audit, typecheck, lint, packaging and build checks in that run passed.

## v0.1.0-alpha.2 — 2026-09-12

Expanded resource navigation to Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco. A city/county selector and explicit source scopes keep programs, citations and official next steps in the appropriate jurisdiction; missing or conflicting locality prompts clarification. Added 20 source groups, bringing the retained collection to 33 groups and 1,044 evidence chunks.

Added live address, municipal-boundary, parcel, zoning and future-land-use adapters for St. Petersburg and Clearwater. Direct property layers cover the three named cities; Pasco and other municipalities retain explicit coverage gaps. Nearby development remains a Tampa-only snapshot and now requires verified Tampa boundary coverage before searching.

Regional validation: 227 code tests, all 77 narrative scenarios, and 224 offline evaluation cases with 4,322 applicable checks passed. Typecheck, lint, production build and all 15 production browser cases passed. The harness runs stalled-upload checks against the exact compiled Worker without Wrangler's defective local static-assets proxy; UI, asset and response-policy checks retain the production static-assets route. The upstream proxy defect and hosted relevance remain separate open questions. These results do not establish hosted operation or add regional real-model/human findings. See [current regional verification](docs/RELEASE_READINESS.md#v010-alpha3-tampa-bay-expansion).

### Earlier simplification

Simplified API error handling, property-selection resets, source-conflict selection, GIS field/date mapping, and shared model-response validation. Public response formats, source/citation ordering, provider configuration, guardrails, and timeout/cancellation behavior are preserved.

Refactor validation: 199 code tests and 205 offline evaluation cases passed, along with typecheck, lint and the production build. Before/after comparisons matched across 127 answer/retrieval probes, 540 model-completion shapes, and the cached development-record CSV. These checks did not add new real-model or human-quality findings.

The focused production browser sequence passed six checks and failed the next page request after interrupted uploads. A verified pre-refactor Sites build with identical runtime configuration reproduced the same ProxyWorker connection failure; the security check passed independently in a fresh candidate runtime. This existing local transport issue remains unresolved, and hosted impact remains unverified.

## v0.1.0-alpha.1 — 2026-09-12

Initial source-only alpha for contributors, local use and supervised testing. TampaBayBot is an independent Tampa housing-information navigator, not a government service or an official decision system.

- Added evidence retrieval and literal citation validation for housing, zoning/land use, permitting and agency navigation, with GIS and independent development-record adapters.
- Added optional native Ollama and OpenAI-compatible model adapters, disabled by default, plus six guardrail prompt inserts and five runtime guard stages.
- Added code, adversarial, evaluation and provider-testing tools, along with dependency remediation and a dedicated secret-history scanner.
- Added a minimalist blue-and-white interface inspired by Tampa.gov, with functional icons and text-only sharing metadata.
- Added a build for deployment into an operator's own Cloudflare account, source-only packaging and a [private vulnerability-reporting route](SECURITY.md#reporting-a-problem).

The public tree excludes downloaded third-party snapshots, extracted evidence, historical answer/review packets, screenshots, owner hosting metadata and private development history. It starts with empty evidence and evaluation states; operators acquire and review sources directly. [Distribution policy](docs/DISTRIBUTION.md).

The public source-release CI passed. The complete development browser suite retains one rejected-upload transport failure on both Windows and Linux local runtimes; hosted impact remains unverified. Independent human review, manual accessibility review and deployment operations remain pending. [Current release status and verification](docs/RELEASE_READINESS.md) distinguishes these scopes, including the recorded real Ollama tests and own-account deployment limits.

The later [Linux browser follow-up](https://github.com/Jaclenga/TampaBayBot/releases/download/v0.1.0-alpha.1/linux-browser-followup.json) adds evidence without changing the original alpha source tag. Detailed correction history remains in the [dated bug-fix record](docs/BUG_FIX_FOLLOWUP_2026-09-12.md).
