# Release readiness

**As of September 12, 2026: v0.1.0-alpha.4 is a published source-only alpha. Readiness for an unrestricted resident-facing service is not established.**

This is the canonical record of release status, completed verification and remaining review. [Release notes](../CHANGELOG.md) summarize changes; dated bug scans and model reports preserve earlier observations. Documentation changes do not rerun those checks or change the frozen release tag.

## v0.1.0-alpha.4 evaluation and repository organization

This release adds a 12-case claim-quality suite for factual accuracy, citation correctness and citation completeness. The cases cover Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco through the ordinary guarded answer path with inference disabled. The independent oracle records claim hashes and allowed source/chunk pairs; it is validated against the retained corpus before scoring and is not supplied to the answer implementation. Detailed accessibility, source, limitations and methodology guides now live under `docs/` so the repository root remains focused on project, governance, package and build files.

On September 12, 2026, all 236 code tests, 77 narrative cases, 236 offline cases and 4,370 applicable checks passed; 582 checks were N/A. Each of the three claim metrics passed 12/12 cases. Typecheck, lint, production build and the focused production evaluation-page browser case passed. Mutation tests reject fabricated claims, valid but non-supporting citations, missing citations, partial coverage and extra unsupported claims. These are exact-claim results against dated development snapshots, not a blind holdout, open-ended semantic score, source-currentness audit or completed human review.

## Release scope

The [public alpha](https://github.com/Jaclenga/TampaBayBot/releases/tag/v0.1.0-alpha.4) contains the software, test definitions, publisher links and ingestion configuration. It starts with an empty evidence corpus and evaluation reports marked `not_run`. Downloaded third-party snapshots, derived answer packets and private development history are excluded. Operators must acquire and review sources before expecting cited answers; historical results do not certify a fresh corpus. See [distribution and regeneration](DISTRIBUTION.md).

The implementation supports housing-resource navigation, zoning/land-use lookup, permitting guidance, nearby development records and agency navigation. A program match is not an eligibility decision, a zoning designation is not permission to build, and proximity does not establish a legal relationship. Coverage and methods are documented in [data sources](DATA_SOURCES.md), [geospatial behavior](GEOSPATIAL.md), [methodology](METHODOLOGY.md) and [limitations](LIMITATIONS.md).

The default answer path is deterministic and extractive. Optional providers select complete supplied excerpts under application validation; six prompt inserts and five runtime stages support that boundary. [Model configuration](LLM.md) and [guardrail extensions](GUARDRAIL_INSERTS.md) describe the implementation and its limits.

## v0.1.0-alpha.3 Tampa Bay expansion

Alpha.3 added resource navigation for Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco. Selected areas and explicit source scopes constrain citations and official next steps; city names in street addresses, mailing-city ambiguity and conflicting jurisdictions do not establish coverage. Direct property layers cover Tampa, St. Petersburg and Clearwater. Pasco has narrative resources but no connected GIS adapter, other municipalities retain coverage gaps, and the development snapshot remains Tampa-only.

On September 12, 2026, 227 code tests, 77 narrative scenarios and 224 offline cases passed, with 4,322 applicable checks and 582 N/A. Typecheck, lint and the production build passed. All 32 first-party source groups regenerated exactly from retained snapshots; seven ingestion tests passed. The corpus contains 1,044 chunks across 33 groups, including the independent development source. These populated-development results are recorded for the source release, whose downloadable package intentionally starts without that acquired evidence.

The current Windows production browser sequence recorded 15 passed, zero failed, skipped or flaky. The harness uses the normal built static-assets route for resident, accessibility, asset and response-policy behavior. Its stalled-upload test uses the same compiled Worker through a direct no-assets route, then verifies the Worker remains healthy. This separation avoids a reproduced Wrangler/Miniflare local static-assets proxy defect without skipping, retrying or weakening the application assertions. It does not prove how the defective local proxy or a hosted Cloudflare edge behaves after an abandoned upload.

The built Worker also passed 11 live HTTP checks: addresses and verified property layers at three public civic locations, city-scoped narrative answers, and explicit missing development coverage for both Pinellas cities even when a caller supplied a false Tampa context. A source-only candidate passed manifest verification and four packaging tests; it preserves regional fetch configuration while excluding downloaded evidence, private history and hosting configuration.

The [regional verification record](TAMPA_BAY_VERIFICATION.json) identifies the tested corpus and distinct validation scopes. Optional real Ollama results below remain pre-expansion observations; no new real-model inference or independent human review is claimed. The public alpha includes the expansion; the private hosted preview remains a separate deployment.

## Recorded verification

These historical alpha observations are dated September 12, 2026. The [portable alpha verification record](ALPHA_VERIFICATION.json) summarizes those development checks. [Release receipts](https://github.com/Jaclenga/TampaBayBot/releases/tag/v0.1.0-alpha.1) identify the public source commit, manifest, scans and CI; the later [Linux browser follow-up](https://github.com/Jaclenga/TampaBayBot/releases/download/v0.1.0-alpha.1/linux-browser-followup.json) adds evidence without rewriting the original tag.

| Scope | Recorded result | Evidence and interpretation |
| --- | --- | --- |
| Local development code | 197 tests passed; zero failed or skipped. Typecheck, lint and production build passed. | [Alpha record](ALPHA_VERIFICATION.json). Includes four packaging/sanitization tests added after the earlier 193-test model run. |
| Offline engineering evaluation | 205 cases and 3,902 applicable checks passed; 582 checks were N/A. The 77 legacy scenarios also passed. | [Evaluation suite](EVAL_SUITE.md): navigation 77, guardrails 45, providers 55, input/corpus variations 28. These hand-authored checks are not a general factual-accuracy percentage. Comparison/mutation tests also cover lost checks and changed expectations. |
| Source regeneration | 12/12 first-party groups regenerated from preserved snapshots; five ingestion tests passed. | [Frozen alpha verification](https://github.com/Jaclenga/TampaBayBot/blob/v0.1.0-alpha.1/docs/ALPHA_VERIFICATION.json) identifies the historical 257-chunk corpus. Current source reports and ingestion tests have since changed; neither old nor new downloaded evidence is included in public source packages. |
| Synthetic provider integration | 32 checks passed across `none`, Ollama and OpenAI-compatible modes. | `evaluation/llm-runtime/latest.json`; localhost fixture providers, no real inference. |
| Real local Ollama | 24 repeated native cases, nine app HTTP checks and two compatibility cases passed. | [Exact model, acceptance, latency and scope](OLLAMA_TESTING.md). Ollama 0.24.0 / Meta Llama 3 8B; not rerun for packaging changes. Human usefulness remains unscored. |
| Dependencies | Full audit including development tools: zero findings; production-only audit: zero findings. Clean install and dependency-tree checks passed. | Dependency remediation (development artifact omitted from source-only release). The vulnerable upstream parser was replaced with a bounded PNG/GIF reader; ten parser regressions passed. Zero advisory findings does not establish universal security. |
| Independent deployment artifacts | 18 local checks passed: nine with populated evidence and nine with the empty source distribution. | Actual Wrangler upload dry-runs and local production Worker HTTP; [deployment guide](DEPLOYMENT.md). Upload into an operator's own external Cloudflare account remains unverified. |
| Public source-distribution CI | Passed on Linux; a fresh Windows clone also passed its source-release checks. | [Public CI run](https://github.com/Jaclenga/TampaBayBot/actions/runs/34708412605): manifest/history scan, clean install/audit, typecheck, lint, four release tests, standalone build and nine deployment checks. It does **not** run the populated-corpus or complete browser suites. |
| Complete production browser suites | Windows: 13 passed, one failed, zero skipped. Later Linux development CI: 13 passed, one failed, zero skipped or flaky. | All four production security tests passed. The rejected-upload follow-up request returned 500 instead of 400. [Dated investigation](BUG_FIX_FOLLOWUP_2026-09-12.md) and [Linux receipt](https://github.com/Jaclenga/TampaBayBot/releases/download/v0.1.0-alpha.1/linux-browser-followup.json). The complete suite is not passing. |
| Accessibility automation | Nine archived axe scans reported zero violations/incomplete checks; checked reflow, focus and security flows passed. | [Accessibility scope and manual checklist](ACCESSIBILITY.md). Automation does not establish WCAG conformance; the full browser failure above remains. |
| Local GIS/UI/API observations | Live City Hall property lookup and 106 nearby records passed the recorded smoke checks. | Local API record (development artifact omitted from source-only release), GIS record (development artifact omitted from source-only release) and [geospatial method](GEOSPATIAL.md). The pinned development adapter accepted 3,269 points from 3,323 activities; whole-parcel constraints and a complete/current development inventory are outside scope. |
| Answer review | Agent review of 30 responses completed; independent human ratings remain pending. | [Evaluation and review process](EVALUATION.md). An agent review is not an independent human audit. |
| Private Sites hosting | Publication and the anonymous access gate were observed; home/API returned 401. | Private deployment record (development artifact omitted from source-only release). Authenticated hosted smoke remains pending. This is separate from deployment into an operator's own Cloudflare account. |

Later Linux development CI passed installation, audit, typecheck, lint, code tests, source checks, evaluation, build and synthetic provider integration before failing the browser assertion. Tracking `public/.gitkeep` resolved its earlier missing-directory failure. The public aggregate receipt preserves these results without publishing private CI identifiers.

The public source history and working tree recorded zero Gitleaks findings on Windows and Linux, including a passed detection/redaction self-test. The separate private development archive retains 11 unallowlisted tokenlike strings embedded in third-party HTML and is not clean. No raw provenance bytes were removed to obtain the public result. [Secret-scan procedure and scope](../evaluation/security/SECRET_SCAN.md).

## Open runtime issue

Rejecting an unread or incomplete upload can break a following request in the local Workerd/Miniflare static-assets path. It is observed in historical Windows and Linux application runs; the earlier minimal Worker reproduction was on Windows. Hosted Cloudflare impact remains unverified. Current browser verification therefore tests the exact compiled application Worker directly for incomplete uploads and keeps all UI, asset and response-policy checks on the static-assets route. All 15 application cases pass under that explicit split, while the upstream proxy diagnostic remains open. [Reproduction, attempted remedies and evidence](BUG_FIX_FOLLOWUP_2026-09-12.md#local-runtime-transport-issue).

## Remaining review and operational work

1. **Runtime and hosted verification:** establish whether the local static-assets upload defect is relevant to the intended hosted deployment. Complete an actual own-account Cloudflare deployment and hosted smoke, or authenticated smoke for the private Sites build, as applicable. A dry-run or split local application check is not that verification.
2. **Independent human review:** complete the prepared 30-response audit against original sources and the rubric; publish ratings, corrections and unresolved issues. Assess the usefulness of any selected real model with people before enabling it for residents.
3. **Accessibility and resident tasks:** complete keyboard, screen-reader, browser/text zoom, mobile and resident usability checks. Record device/browser/assistive-technology combinations in [accessibility](ACCESSIBILITY.md).
4. **Source freshness:** recheck time-sensitive program information, including RMAP phase/income data and HRRP availability. Assign refresh ownership and a schedule; unresolved source ambiguity stays visible.
5. **Deployment operations:** configure access policy, shared rate/concurrency limits, monitoring, log retention, operator contact and rollback procedures. Verify any provider's disclosure, retention and cost controls. [Security](../SECURITY.md) and [deployment](DEPLOYMENT.md) describe the operator boundary.

Keep the documented scope visible during supervised testing. Full code interpretation, verified regulatory translation, complete current development coverage and official determinations remain outside the alpha.

## Updating this record

Record the date, tested source/corpus, environment, actual result and artifact for new verification. Preserve failed and unavailable checks; planned work is not a completed run. Reacquiring sources or changing a provider requires its own evidence, and later documentation edits do not certify either.

Use [development setup and commands](DEVELOPMENT.md), [evaluation commands](EVAL_SUITE.md), [production browser setup](ACCESSIBILITY.md#automated-checks), [real-model testing](OLLAMA_TESTING.md) and [deployment verification](DEPLOYMENT.md) to reproduce the relevant scope. This record supports source inspection, local use and supervised testing; it does not imply deployment approval or completed human review.
