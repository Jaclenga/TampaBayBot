# Release readiness

**As of September 16, 2026: the repaired retained-corpus evaluation passes all 236 offline cases and 77 narrative cases; program-recall omissions remain. The latest local verification is recorded below; v0.1.0-alpha.4 remains the historical published source-only release tag. Local changes do not establish publication or deployment. Readiness for an unrestricted resident-facing service is not established.**

This is the canonical record of release status, completed verification and remaining review. [Release notes](../CHANGELOG.md) summarize changes; dated bug scans and model reports preserve earlier observations. Documentation changes do not rerun those checks or change the frozen release tag.

## September 16, 2026 complexity reduction

The follow-up refactor separates format parsers from shared input/output validation, replaces manual worker-settlement state with a single awaited cleanup path, shares the repeated qualification response, and avoids repeated income-fact extraction and fact-deduplication scans. Public contracts, evidence ordering, limits and failure codes are preserved. Three additional worker lifecycle regressions cover successful termination, cleanup failures and construction time within the deadline.

`npm run check` passed typecheck, lint, all 469 source tests and the production build. The unchanged retained corpus passed 236/236 offline cases, 77/77 narrative cases and all three 12/12 exact-claim quality measures. Comparison with the preceding security-fix run reported no regressions or provenance changes. Direct comparison with that implementation also matched 128 normalization results/failures, 81 chunk results/failures and facts from all 1,044 retained chunks. Strict program recall still exits 1 with unchanged omissions (65/72 retrieval at 15, 66/72 final evidence; all six controls pass).

Reports are retained under ignored `work/evals/complexity-20260916-offline/`, with comparison and recall in the corresponding `-comparison/` and `-recall/` directories; the direct comparison is in `work/complexity-20260916/behavior-comparison.json`. The active source-only corpus remains unchanged. No new acquisition, real-model call, browser run or deployment is claimed for this refactor; the preceding browser and HTTP security checks are recorded below.

## September 16, 2026 local security fixes

The three findings from the agent-assisted code review are repaired: unsupported page/form/action uploads are refused before framework parsing; source downloads stop at redirects instead of following unreviewed targets; and normalization/chunk expansion has incremental output limits plus a terminable parsing worker. Failure paths preserve the active corpus. Updated [operations](OPERATIONS.md#shared-controls) and [source-update guidance](SOURCE_UPDATES.md#acquire-a-candidate) describe admission rules, processing budgets, stable failure codes and reviewed URL changes.

`npm run check` passed typecheck, lint, all 466 source tests and the production build. All 11 source browser tests passed. Four HTTP security tests passed against the compiled Worker through the direct local no-assets transport, including unfinished JSON uploads, immediate page/form/action rejection, disabled image-processing routes and response policy headers. Unit tests also cover shared maintenance, redirect destinations, repeated HTML/CSV/metadata expansion, PDF extraction, worker deadlines and cancellation. An independent agent integration review found no additional blocker.

The unchanged retained corpus again passed 77/77 narrative and 236/236 offline cases, with all 4,370 applicable checks and all three 12/12 exact-claim quality measures. Comparison against the preceding passing repair run reported no regressions or provenance changes. Strict program recall still exits 1 for the existing omissions: retrieval at 15 remains 65/72 and final evidence 66/72, with all six controls passing. Offline reports are preserved under ignored `work/evals/security-fixes-20260916-offline/`, with comparison and recall in the corresponding `-comparison/` and `-recall/` directories. HTTP results are in `work/security-fix-20260916/http-results.json`.

These checks used local synthetic inputs and the dated retained evidence, with no new acquisition, real-model calls, hosted upload/load test or deployment. The separate static-assets interrupted-upload issue below remains open; the four direct-Worker checks do not certify that proxy or hosted behavior. The active source-only corpus remains unchanged.

## September 16, 2026 local architecture verification

The [answer architecture refactor](ARCHITECTURE.md) adds QueryPlan signals, declarative source section preferences, evidence-linked facts during ingestion, distinct retrieval stages with diagnostics, and explicit non-exhaustive coverage. The answer entrypoint coordinates smaller selection, qualification, response and next-step components. Literal citations, reviewed publication, geographic confirmation and optional model fallback remain the trust boundaries.

The follow-up bug scan fixes program switching and alias recall, preserves required quotation spans, separates dollar amounts from dates, validates the year actually quoted, retains complete continuation sentences, and extracts advisory and structured narrative closure notices. Additional cases cover unquotable qualifications, conflicting application statuses, old amounts embedded in restrictions and income headings without values. The fixes add 33 regression tests.

Final local verification passed all 422 source tests, typecheck, lint and production build through `npm run check`, plus all 11 source browser tests. Browser checks include keyboard operation, narrow layouts, forced colors, browser zoom, text resizing and Spanish. Routing was compared with the previous implementation on 840 generated cases; retrieval hits and scores matched on 79 synthetic queries before intentional semantic improvements. These are engineering regressions over synthetic evidence; no new source-currentness audit, populated-corpus benchmark, real-model run, independent human review or deployment is claimed. The repository-wide TypeScript migration remains deferred.

## September 16, 2026 retained-corpus evaluation rerun

**The initial rerun failed; the repairs and passing follow-up are recorded below.** The implementation was tested in an isolated source copy against the unchanged September 12 snapshot: 33 sources, 1,044 chunks, generation `e44828a7d15c5425117fc9986de5a491f298ae3faab05590a184354de061f1be`. Quality and recall support hashes validated before evaluation. The active source-only corpus stayed unchanged, and no source acquisition or real-model call occurred.

| Check | Result |
| --- | --- |
| Strict narrative benchmark | 75/77 cases passed; `h05` and `h18` failed. |
| Complete offline suite | 230/236 cases and 4,358/4,370 applicable checks passed; 582 checks were not applicable. |
| Exact-claim quality | Factual accuracy and citation correctness: 11/12 each; citation completeness: 12/12. |
| Program recall | Retrieval at 15: 65/72 pairs; final evidence: 66/72 pairs; all 6 controls passed. Strict recall exited 1 for unchanged omissions. |

The six offline failures covered three issues: application-method wording was treated as an open/closed-status question (`h05`); asking to use 2025 income limits "today" returned `answered`, with a dated heading mistaken for an income value (`h18` and three formatting variants); and the Clearwater permit first-step instruction was rejected as too short, causing a later application step to replace the authored claim/support pair (`clearwater-permit`). The retained implementation selected the expected Clearwater instruction on the same snapshot. These failures showed that the passing source and browser suites above did not establish corpus compatibility.

Full reports are preserved in ignored `work/evals/architecture-20260916-offline/` and `work/evals/architecture-20260916-recall/`. They describe dated engineering evidence, not current publisher truth. [Program recall](PROGRAM_RECALL.md#september-16-2026-rerun) records the unchanged omissions and comparison scope.

### Regression repairs and follow-up evaluation

Application methods now require instructions without implying intake availability; requests for an alternative program support resource discovery. Explicit open/closed questions still require status evidence. Current use of a previous year's income limits requires current-year evidence, while a historical income question retains its year even beside a current application-status question. Calendar dates and household counts cannot supply an income value. Short numbered steps require a complete action and object plus source context; headings and unsafe or out-of-scope evidence remain excluded.

The repaired source was evaluated against the same retained corpus and unchanged benchmark expectations:

| Check | Follow-up result |
| --- | --- |
| Strict narrative benchmark | 77/77 passed. |
| Complete offline suite | 236/236 cases and 4,370/4,370 applicable checks passed; 582 checks were not applicable. |
| Exact-claim quality | Factual accuracy, citation correctness and citation completeness: 12/12 each. |
| Program recall | Retrieval at 15: 65/72 pairs; final evidence: 66/72 pairs; all 6 controls passed. Strict recall still exited 1 for the existing omissions. |

All six initial failures are repaired. A separate Pasco alternative-program question also returns `answered` again with its retained LIHEAP citation. The failed reports remain intact; passing reports and the input receipt are in ignored `work/evals/regression-repair-final-20260916-offline/`, with recall in `work/evals/regression-repair-final-20260916-recall/`. The active corpus remained unchanged, with no source acquisition or model calls. This restores the prior bounded evaluation results; it does not resolve the separate program-recall gaps or establish current publisher truth.

The follow-up adds 18 source regression tests, including punctuation, historical/current-year wording, program discovery and method/status combinations. `npm run check` passed all 440 source tests, typecheck, lint and the production build; all 11 source browser checks passed on the final code. The [development regression gate](DEVELOPMENT.md#behavior-change-regression-gate) now requires populated-corpus comparison for routing, retrieval, fact and answer changes when reviewed evidence is available.

The preserved comparison in `work/evals/regression-repair-final-20260916-comparison/` exits 1 for 21 response-shape flags on `h05` and `h18`: corrected statuses change check applicability and citation cardinalities. Manual review confirmed unchanged authored expectations and input hashes, no candidate check failures and no changed check results in previously passing cases. These flags were reviewed rather than suppressed or relabeled as a passing comparison.

## September 16, 2026 documentation verification

The documentation was checked against the current modules, HTTP contracts and npm scripts. All local Markdown links and heading anchors resolved. A new source-only package installed 514 locked packages from the local cache using Node 24.13.1 and npm 11.8.0, then passed all 422 source tests and the documented manifest refresh/verification commands. The isolated demo served its fictional home page and executed the development guide's API example with cited evidence, follow-up context and the documented local readiness response. The custom-provider example passed accepted-selection, clarification-bypass and invalid-output-fallback checks; all six quoted guardrail blocks matched their exported versions.

API, architecture, contributor and model guidance now describe the current fields, required citations and selection limits. Historical screenshot/report references and local-versus-published verification are distinguished. External publisher availability, real-model calls and cloud deployment were not revalidated by this documentation check.

## Current development changes

Current source now includes offline synthetic application/browser tests, mandatory semantic release validation, a contributor manifest command, a fictional demo, staged atomic source updates with scheduled metadata reports, short factual evidence retrieval, temporary follow-up context, Spanish question/navigation support, and expanded GIS adapters. The tagged alpha observations below describe earlier source and are not rerun claims for these changes. [Source updates](SOURCE_UPDATES.md), [demo](DEMO.md), and [live coverage verification](HISTORY.md#geographic-coverage) document their exact scope.

Current code includes shared D1 request/concurrency/outbound controls, protected aggregate monitoring, meaningful readiness and an incident runbook. Spanish now covers property tools and reference pages. Live September 13 checks returned official St. Petersburg district projects and Pasco planning cases. Independent human and screen-reader reviews remain pending; the specific hosted interrupted-upload question remains unverified.

The September 13 private Sites smoke passed authenticated home, health and question requests, including the requested assistance amount/restrictions, jurisdiction follow-up and Spanish; anonymous access returned 401. The duplicate root application folder that hid the real routes was removed. This completed smoke is distinct from hosted GIS, browser/CSP, load and interrupted-upload verification. [Operations](OPERATIONS.md), [accessibility](ACCESSIBILITY.md) and [coverage](HISTORY.md#geographic-coverage) record the expanded controls and verification boundaries.

### Selected review updates: 1–3 and 6–8

| Review item | Current behavior and regression coverage |
| --- | --- |
| 1. Requested facts | Short factual rows remain usable with source context. Explicit amount, fee, duration and deadline questions require matching fresh evidence; missing details return uncertainty. Long excerpts retain the requested fact, and optional providers must preserve the amount and separate application restrictions. See `tests/resident-workflows.test.mjs`. |
| 2. Offline public checks | `npm test` / `test:source` run original synthetic fixtures without the development corpus. Eleven Chromium checks exercise keyboard citations, actual browser zoom/text enlargement, mobile/forced-colors layout, temporary clarification context and Spanish property/reference flows. A fresh start must not reload and lose the answer. A missing source manifest fails public CI. |
| 3. Source updates | Weekly acquisition produces a metadata review report. Exact-digest approval precedes validation, build and atomic local application. `source:deploy` retries an approved build and checks its generation and artifact bytes. Failed downloads, changed source definitions, recovery and rollback have separate regression coverage. Deployment remains an explicit operator action. See [source updates](SOURCE_UPDATES.md). |
| 6. Follow-ups | Only a bounded topic/program/jurisdiction object remains in page memory. English and Spanish clarification and application/coverage follow-ups preserve the subject; reset, reload and new topics clear context. No prior freeform question text is stored. |
| 7. Language and region | Spanish question routing and navigation preserve original source quotations. Pasco property and whole-parcel map checks and the Clearwater development adapter remain covered by synthetic GIS tests. Pasco planning cases and St. Petersburg district projects have separate official adapters with successful September 13 spatial queries, explicit coverage and unchanged original record text. See [coverage](HISTORY.md#geographic-coverage) for dated live checks and upstream limits. |
| 8. Contributor workflow | The isolated fictional demo and its labeled screenshot are included. `release:manifest` validates actual empty evidence/report content before updating hashes. Private deployment JSON receipts remain excluded even when their manifest hashes are recomputed. [Contributing](../CONTRIBUTING.md) documents ordinary source pull requests. |

The September 13 offline evaluation passed all **236 cases and 4,370 applicable checks**, including all 77 narrative cases and the 12 exact-claim quality cases; 582 checks were not applicable. The retained corpus was not reacquired. This run checks software regressions against dated evidence, not current publisher truth or resident usefulness. The subsequent operations/accessibility pass added shared controls, readiness, monitoring, language coverage and browser-accessibility checks. Independent human/screen-reader review and the hosted interrupted-upload question remain open below.

The operations/accessibility regression pass completed **329 development tests**, **11 source-browser cases**, typecheck, lint and a compiled Worker/D1 HTTP smoke. The real local database enforced HTTP 429 with Retry-After and protected metrics access. Readiness correctly reported 11 stale retained GIS excerpts among 1,044 chunks; shared controls were ready. No source timestamps were rewritten or corpus reacquired to make that report green.

## Historical v0.1.0-alpha.4 evaluation and repository organization

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

The [regional verification record](HISTORY.md#release-verification) identifies the tested corpus and distinct validation scopes. Optional real Ollama results below remain pre-expansion observations; no new real-model inference or independent human review is claimed. The public alpha includes the expansion; the private hosted preview remains a separate deployment.

## Recorded verification

These historical alpha observations are dated September 12, 2026. The [portable alpha verification record](HISTORY.md#release-verification) summarizes those development checks. [Release receipts](https://github.com/Jaclenga/TampaBayBot/releases/tag/v0.1.0-alpha.1) identify the public source commit, manifest, scans and CI; the later [Linux browser follow-up](https://github.com/Jaclenga/TampaBayBot/releases/download/v0.1.0-alpha.1/linux-browser-followup.json) adds evidence without rewriting the original tag.

| Scope | Recorded result | Evidence and interpretation |
| --- | --- | --- |
| Local development code | 197 tests passed; zero failed or skipped. Typecheck, lint and production build passed. | [Alpha record](HISTORY.md#release-verification). Includes four packaging/sanitization tests added after the earlier 193-test model run. |
| Offline engineering evaluation | 205 cases and 3,902 applicable checks passed; 582 checks were N/A. The 77 legacy scenarios also passed. | [Evaluation suite](EVAL_SUITE.md): navigation 77, guardrails 45, providers 55, input/corpus variations 28. These hand-authored checks are not a general factual-accuracy percentage. Comparison/mutation tests also cover lost checks and changed expectations. |
| Source regeneration | 12/12 first-party groups regenerated from preserved snapshots; five ingestion tests passed. | [Frozen alpha verification](https://github.com/Jaclenga/TampaBayBot/blob/v0.1.0-alpha.1/docs/ALPHA_VERIFICATION.json) identifies the historical 257-chunk corpus. Current source reports and ingestion tests have since changed; neither old nor new downloaded evidence is included in public source packages. |
| Synthetic provider integration | 32 checks passed across `none`, Ollama and OpenAI-compatible modes. | `evaluation/llm-runtime/latest.json`; localhost fixture providers, no real inference. |
| Real local Ollama | 24 repeated native cases, nine app HTTP checks and two compatibility cases passed. | [Exact model, acceptance, latency and scope](HISTORY.md#ollama-testing). Ollama 0.24.0 / Meta Llama 3 8B; not rerun for packaging changes. Human usefulness remains unscored. |
| Dependencies | Full audit including development tools: zero findings; production-only audit: zero findings. Clean install and dependency-tree checks passed. | Dependency remediation (development artifact omitted from source-only release). The vulnerable upstream parser was replaced with a bounded PNG/GIF reader; ten parser regressions passed. Zero advisory findings does not establish universal security. |
| Independent deployment artifacts | 18 local checks passed: nine with populated evidence and nine with the empty source distribution. | Actual Wrangler upload dry-runs and local production Worker HTTP; [deployment guide](DEPLOYMENT.md). Upload into an operator's own external Cloudflare account remains unverified. |
| Public source-distribution CI | Passed on Linux; a fresh Windows clone also passed its source-release checks. | [Public CI run](https://github.com/Jaclenga/TampaBayBot/actions/runs/34708412605): manifest/history scan, clean install/audit, typecheck, lint, four release tests, standalone build and nine deployment checks. It does **not** run the populated-corpus or complete browser suites. |
| Complete production browser suites | Windows: 13 passed, one failed, zero skipped. Later Linux development CI: 13 passed, one failed, zero skipped or flaky. | All four production security tests passed. The rejected-upload follow-up request returned 500 instead of 400. [Dated investigation](HISTORY.md#runtime-investigation) and [Linux receipt](https://github.com/Jaclenga/TampaBayBot/releases/download/v0.1.0-alpha.1/linux-browser-followup.json). That historical complete suite did not pass; the later split application checks are described below. |
| Accessibility automation | Nine archived axe scans reported zero violations/incomplete checks; checked reflow, focus and security flows passed. | [Accessibility scope and manual checklist](ACCESSIBILITY.md). Automation does not establish WCAG conformance; the full browser failure above remains. |
| Local GIS/UI/API observations | Live City Hall property lookup and 106 nearby records passed the recorded smoke checks. | Local API record (development artifact omitted from source-only release), GIS record (development artifact omitted from source-only release) and [geospatial method](GEOSPATIAL.md). The pinned development adapter accepted 3,269 points from 3,323 activities; whole-parcel constraints and a complete/current development inventory are outside scope. |
| Answer review | Agent review of 30 responses completed; independent human ratings remain pending. | [Evaluation and review process](EVALUATION.md). An agent review is not an independent human audit. |
| Private Sites hosting | Publication and the anonymous access gate were observed; home/API returned 401. | Private deployment record (development artifact omitted from source-only release). Authenticated smoke was pending at that historical checkpoint; the September 13 completed checks are described above. Independent Cloudflare deployment is a separate optional hosting path. |

Later Linux development CI passed installation, audit, typecheck, lint, code tests, source checks, evaluation, build and synthetic provider integration before failing the browser assertion. Tracking `public/.gitkeep` resolved its earlier missing-directory failure. The public aggregate receipt preserves these results without publishing private CI identifiers.

The public source history and working tree recorded zero Gitleaks findings on Windows and Linux, including a passed detection/redaction self-test. The separate private development archive retains 11 unallowlisted tokenlike strings embedded in third-party HTML and is not clean. No raw provenance bytes were removed to obtain the public result. [Secret-scan procedure and scope](../evaluation/security/SECRET_SCAN.md).

## Open runtime issue

Rejecting an unread or incomplete upload can break a following request in the local Workerd/Miniflare static-assets path. It is observed in historical Windows and Linux application runs; the earlier minimal Worker reproduction was on Windows. Hosted Cloudflare impact remains unverified. Current browser verification therefore tests the exact compiled application Worker directly for incomplete uploads and keeps all UI, asset and response-policy checks on the static-assets route. All 15 application cases pass under that explicit split, while the upstream proxy diagnostic remains open. [Reproduction, attempted remedies and evidence](HISTORY.md#runtime-investigation).

## Remaining review and operational work

1. **Runtime and hosted verification:** authenticated private Sites smoke is complete. Establish whether the local static-assets interrupted-upload defect is relevant to the intended host; complete broader hosted browser/GIS and operational exercises as applicable. An own-account Cloudflare deployment is needed only if that is the intended host, not as a prerequisite for using Sites.
2. **Independent human review:** complete the prepared 30-response audit against original sources and the rubric; publish ratings, corrections and unresolved issues. Assess the usefulness of any selected real model with people before enabling it for residents.
3. **Accessibility and resident tasks:** new browser checks cover keyboard-only flows, actual Chromium 200%/400% zoom, 200% default-font scaling, narrow screens and forced colors. Human screen-reader and resident task review remains pending; agent browser checks do not substitute for it. [Accessibility](ACCESSIBILITY.md) records exact methods and limits.
4. **Source freshness:** recheck time-sensitive program information, including RMAP phase/income data and HRRP availability. Assign ownership of the scheduled metadata reports and reviewed apply workflow; unresolved source ambiguity stays visible.
5. **Deployment operations:** shared controls, monitor/retention implementation and the owner incident/rollback runbook are provided in [operations](OPERATIONS.md). Independent operators must configure their DB and runtime secrets. Hosting-level network controls, alert notification delivery and any enabled provider's spending/retention policy remain separate operator responsibilities. Keep access restricted during outstanding review.

Keep the documented scope visible during supervised testing. Full code interpretation, verified regulatory translation, complete current development coverage and official determinations remain outside the alpha.

## Updating this record

Record the date, tested source/corpus, environment, actual result and artifact for new verification. Preserve failed and unavailable checks; planned work is not a completed run. Reacquiring sources or changing a provider requires its own evidence, and later documentation edits do not certify either.

Use [development setup and commands](DEVELOPMENT.md), [evaluation commands](EVAL_SUITE.md), [production browser setup](ACCESSIBILITY.md#automated-checks), [real-model testing](LLM.md#reproduce-integration-checks) and [deployment verification](DEPLOYMENT.md) to reproduce the relevant scope. This record supports source inspection, local use and supervised testing; it does not imply deployment approval or completed human review.
