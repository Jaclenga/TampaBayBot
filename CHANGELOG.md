# Changelog

## v0.1.0-alpha.2 — 2026-09-12

Expanded resource navigation to Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco. A city/county selector and explicit source scopes keep programs, citations and official next steps in the appropriate jurisdiction; missing or conflicting locality prompts clarification. Added 20 source groups, bringing the retained collection to 33 groups and 1,044 evidence chunks.

Added live address, municipal-boundary, parcel, zoning and future-land-use adapters for St. Petersburg and Clearwater. Direct property layers cover the three named cities; Pasco and other municipalities retain explicit coverage gaps. Nearby development remains a Tampa-only snapshot and now requires verified Tampa boundary coverage before searching.

Regional validation: 227 code tests, all 77 narrative scenarios, and 224 offline evaluation cases with 4,322 applicable checks passed. Typecheck, lint, production build and all 15 production browser cases passed. The harness runs stalled-upload checks against the exact compiled Worker without Wrangler's defective local static-assets proxy; UI, asset and response-policy checks retain the production static-assets route. The upstream proxy defect and hosted relevance remain separate open questions. These results do not establish hosted operation or add regional real-model/human findings. See [current regional verification](docs/RELEASE_READINESS.md#v010-alpha2-tampa-bay-expansion).

### Earlier simplification

Simplified API error handling, property-selection resets, source-conflict selection, GIS field/date mapping, and shared model-response validation. Public response formats, source/citation ordering, provider configuration, guardrails, and timeout/cancellation behavior are preserved.

Refactor validation: 199 code tests and 205 offline evaluation cases passed, along with typecheck, lint and the production build. Before/after comparisons matched across 127 answer/retrieval probes, 540 model-completion shapes, and the cached development-record CSV. These checks did not add new real-model or human-quality findings.

The focused production browser sequence passed six checks and failed the next page request after interrupted uploads. A verified pre-refactor Sites build with identical runtime configuration reproduced the same ProxyWorker connection failure; the security check passed independently in a fresh candidate runtime. This existing local transport issue remains unresolved, and hosted impact remains unverified.

## v0.1.0-alpha.1 — 2026-09-12

Initial source-only alpha for contributors, local use and supervised testing. ParcelPrivateer is an independent Tampa housing-information navigator, not a government service or an official decision system.

- Added evidence retrieval and literal citation validation for housing, zoning/land use, permitting and agency navigation, with GIS and independent development-record adapters.
- Added optional native Ollama and OpenAI-compatible model adapters, disabled by default, plus six guardrail prompt inserts and five runtime guard stages.
- Added code, adversarial, evaluation and provider-testing tools, along with dependency remediation and a dedicated secret-history scanner.
- Added a minimalist blue-and-white interface inspired by Tampa.gov, with functional icons and text-only sharing metadata.
- Added a build for deployment into an operator's own Cloudflare account, source-only packaging and a [private vulnerability-reporting route](SECURITY.md#reporting-a-problem).

The public tree excludes downloaded third-party snapshots, extracted evidence, historical answer/review packets, screenshots, owner hosting metadata and private development history. It starts with empty evidence and evaluation states; operators acquire and review sources directly. [Distribution policy](docs/DISTRIBUTION.md).

The public source-release CI passed. The complete development browser suite retains one rejected-upload transport failure on both Windows and Linux local runtimes; hosted impact remains unverified. Independent human review, manual accessibility review and deployment operations remain pending. [Current release status and verification](docs/RELEASE_READINESS.md) distinguishes these scopes, including the recorded real Ollama tests and own-account deployment limits.

The later [Linux browser follow-up](https://github.com/Jaclenga/ParcelPrivateer/releases/download/v0.1.0-alpha.1/linux-browser-followup.json) adds evidence without changing the original alpha source tag. Detailed correction history remains in the [dated bug-fix record](docs/BUG_FIX_FOLLOWUP_2026-09-12.md).
