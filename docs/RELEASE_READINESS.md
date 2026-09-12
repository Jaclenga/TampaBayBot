# v0.1.0-alpha.1 release readiness

**Status: source-only alpha; unrestricted public-service readiness is not established.** The public release excludes third-party evidence snapshots and derived answer packets and starts with honest empty evidence/evaluation states. The development checkout retains its historical verification material privately. [Distribution and regeneration](DISTRIBUTION.md), [independent deployment](DEPLOYMENT.md) and [release notes](../CHANGELOG.md) describe the alpha. This checklist distinguishes implementation, actual verification, independent human review and deployment.

## Functional and evidence scope

| Requirement | Status | Evidence / boundary |
| --- | --- | --- |
| Resident question/address entry | Resident flows pass; one production transport check fails | Five categories without department selection upfront; rejected-upload pooled-connection limitation below |
| Housing assistance | Implemented | Situation routing, official programs, verification questions; no eligibility guarantee |
| Zoning / land use | Implemented within documented scope | Official maps/live fields; full current code interpretation excluded |
| Permitting | Implemented | Residential categories, condominium routing, five-page official guide |
| Development activity | Implemented; live adapter verified | Independent Aug. 23, 2026 snapshot; 3,323 activities / 3,269 accepted points |
| Agency navigation / next steps | Implemented | Registry-backed official links and contact evidence |
| Source registry | Verified | 12 first-party groups + independent development source; all required metadata |
| Evidence corpus / provenance | Verified | 257 chunks, raw snapshots, hashes and section/page/record/layer locators |
| Format adapters | Verified with source/fixture coverage | HTML, PDF, CSV, JSON, ArcGIS, GeoJSON; scanned-PDF OCR excluded |
| Full source regeneration | Passed 12/12 Sept. 12, 2026 | `data/verification-report.json` |
| Ingestion tests | Passed 5/5 Sept. 12, 2026 | `lib/ingestion/normalize.test.mjs` |
| Changes / staleness / unavailable sources | Implemented | Normalized hashes, refresh windows, dated prior evidence after failures |
| Cited retrieval | Implemented | Deterministic lexical retrieval and literal excerpts; optional model selection retains citation checks |
| Pluggable local/API models | Implemented; synthetic and real Ollama transport verified | Ollama 0.24.0 / Meta Llama 3 8B: 24 repeated cases, 9 HTTP checks and 2 compatibility cases passed; human usefulness remains unscored; [report](OLLAMA_TESTING.md) |
| Guardrail inserts and extension hooks | Implemented; tested | Six versioned prompt inserts, five additive runtime stages, narrow privacy screening, immutable contexts and bounded checks; [guide](GUARDRAIL_INSERTS.md) |
| Untrusted-source boundary | Implemented with limited quarantine | No source-driven model/tool execution; no universal detection claim |
| Conflicting evidence | Implemented narrowly | Same-program open/closed application assertions; general conflicts unsolved |
| Insufficient evidence / official judgment | Implemented | Explicit answer states and regression cases |
| Address selection / City jurisdiction | Live adapter verified | Candidate confirmation, official boundary, ambiguity retained |
| Parcel / zoning / future land use | Live adapter verified | Point intersections; whole-parcel overlay/all constraints excluded |
| Nearby distance / temporal context | Adapter verified | Great-circle representative-point distance; date meanings preserved |
| Textual map alternatives | Implemented; manual usability review pending | Property/record information available as text |
| Benchmark | Prepared | 77 questions/scenarios; `evaluation/benchmark.json` |
| Machine-readable evaluation | Passed 205/205 suite cases and 77/77 legacy benchmark scenarios | 3,902 applicable engineering checks; JSON/Markdown/JUnit reports, strict CI failures and regression comparison; [suite guide](EVAL_SUITE.md) |
| Public evaluation / artifact access | Implemented; browser checks passed | `/evaluation`, per-suite and per-metric tables, explicit unscored dimensions and `/api/evaluation` JSON downloads |
| Public source registry / source dates | Implemented; browser checks passed | `/sources` and `/api/sources`; retrieval and publisher update dates kept distinct |
| Adversarial tests | Implemented; 197 automated code tests passed for this alpha | Includes scorer mutation tests, parser resource-failure fixtures, upload deadlines, response policies, guardrails, model adapters and release packaging |
| Agent response review | Completed as an agent review | 30 responses; `evaluation/agent-audit/`; not a human audit |
| Independent human audit | **Pending: 30 responses prepared** | `evaluation/human-audit/`; ratings remain pending |
| Accessibility automation | Zero axe violations in checked flows; complete browser run has one transport failure | Includes private-input correction, model selection/fallback labels and citation focus; this is not a fully passing integration run |
| Manual keyboard / screen reader / 200% text / mobile audit | **Pending** | Record actual results in `ACCESSIBILITY.md` |
| Responsive UI / focus / form errors | Implemented; browser checks passed | Minimalist blue-and-white redesign, plain navigation and readable forms; WCAG 2.1 AA target, no conformance claim |
| Internationalization | English-first strings separated | Verified regulatory translations not implemented |
| Resident data persistence | No application DB/browser persistence | Transient caches and operator-controlled logs remain |
| Input/outbound request bounds | Implemented | Bounded bodies/coordinates, monotonic upload/source deadlines, nonblocking cancellation, reviewed URLs and integrity checks |
| Runtime rate limiting / abuse operations | **Not configured** | Configure before unrestricted public access |
| Database/index setup | Reproducible; no database needed | JSON corpus plus in-memory lexical index; D1/R2 unbound |
| Setup / lockfile / environment example | Present | Node 24 LTS, npm lockfile, no required application credentials |
| Documentation / license separation | Present | MIT software; external-source terms retained |
| Dependency remediation | Vulnerable parser removed; full audit has zero findings | Compatible framework retained with an original bounded PNG/GIF reader; clean install and advisory-fixture regressions passed; review (development artifact omitted from source-only release) |
| CI / typecheck / build / full tests | Local code/evaluation/build checks pass; recorded production browser run has one failure | Source-distribution CI verifies the packaged release separately; full development CI and browser limitations are described below |
| Hosting / deployed smoke test | Private deployment succeeded; sign-in enforced | docs/deployment.json; authenticated hosted smoke remains pending |

## Final verification record

Checks rerun for this alpha on September 12, 2026 are identified below. Real-model and complete browser results retain their original scopes; those longer suites were not rerun for documentation and source-packaging changes. The portable [alpha verification record](ALPHA_VERIFICATION.json) and tagged release's CI/artifact receipts accompany the public source.

| Check | Result | Artifact / required record |
| --- | --- | --- |
| `npm run typecheck` | Passed, September 12, 2026 | Final source, exit 0 |
| `npm run lint` | Passed, including evaluation suite modules | Generated report artifacts remain excluded |
| Code bug scan | Original B01–B14 rechecked; residual B04/B07 edges and parser/HTTP/browser-security findings corrected | [Follow-up findings and limits](BUG_FIX_FOLLOWUP_2026-09-12.md) |
| `npm test` | 197 passed, 0 failed, 0 skipped; rerun for this alpha | Includes the prior 193 code tests plus four release-content/sanitization checks, including manifest tampering detection |
| `npm run test:llm-runtime` | Passed for none, Ollama and OpenAI-compatible modes | `evaluation/llm-runtime/latest.json`; synthetic localhost providers, 32 scenario checks, no real inference |
| `npm run ingest -- --check` | 12/12 passed, final check | `data/verification-report.json` |
| `npm run evaluate` | 77/77 scenarios pass with strict citation/answer checks | `evaluation/results/latest.json`; proxy limitations remain |
| `npm run eval:suite` | 205/205 cases, 3,902 applicable checks passed; 582 N/A | `evaluation/suite/results/`; navigation 77, guardrails 45, providers 55, input/corpus variations 28 |
| `npm run eval:compare` | CLI comparison and regression mutation tests passed | Removal, changed expectations, lost checks and candidate failures fail the comparison |
| `npm run eval:live` | Real local Ollama run passed: 24 repeated native cases and 2 compatibility cases | 12 accepted native model outputs and 12 zero-call conservative bypasses; [exact identity, latency and scope](OLLAMA_TESTING.md) |
| `npm run test:ollama-runtime` | 9/9 actual app HTTP checks passed | Real local Meta Llama 3 8B, two accepted outputs, six zero-call guarded probes, disclosure/private-config checks; no human quality score |
| `npm run build` | Passed, final source | Worker-compatible ESM; nonfatal future-config/deprecation notices |
| Dependency audit | Full audit including dev tools: 0 findings; production-only: 0 findings | `evaluation/security/`; vulnerable parser replaced, not bundled or suppressed |
| `npm run test:a11y` with production security enabled | 13 passed, 1 failed, 0 skipped; zero axe violations in scanned flows | All four new security tests pass; malformed-upload follow-up request hits local-runtime 500. `evaluation/accessibility/latest.json` |
| Local UI/API smoke tests | Passed, including live City Hall property and 106 nearby records | `docs/local-api-validation.json`; 375px/200% approximation screenshots in `docs/screenshots/` |
| CI review/run | The pre-alpha development run failed in Linux because the empty `public` directory was absent from Git; the alpha tracks `public/.gitkeep` | Public source CI independently verifies the manifest, dedicated history scan, clean dependency install/audit, type checking, lint, release tests and standalone build/HTTP smoke. See the tagged release's actual CI link and artifacts; it does not run the populated-corpus or complete browser suites |
| Hosted smoke tests | Anonymous home/API access returns 401 as expected; authenticated checks pending | No signed-in browser available; no bypass token generated |

Independent deployment passed 18 local checks: nine with the populated development corpus and nine with the empty source-only distribution. Both include actual Wrangler upload dry-runs and local production Worker HTTP. No external Cloudflare account is configured in this environment, so actual deployment/account permissions and hosted smoke remain unverified. See [deployment instructions](DEPLOYMENT.md).

The dedicated [secret scan](../evaluation/security/SECRET_SCAN.md) found 11 tokenlike strings in archived third-party HTML in the private history and working tree. That history is not clean and remains private. The public release uses a new parentless source-only history, excluding those snapshots, and requires a separate zero-finding scan before publication; the release attaches that scan's exact commit, file hashes and results. No broad allowlist or removal of raw provenance bytes was used.

The dated GIS live validation (development artifact omitted from source-only release) verifies adapter observations; it does not replace final UI/API or hosted tests. A check that cannot run stays pending/blocked with its real cause. A planned workflow is not a completed CI run.

The browser suite starts/reuses port 3100 by default. Set `PLAYWRIGHT_BASE_URL` to target an existing preview, such as `http://127.0.0.1:3001`; that mode does not launch a server. Final browser results must use the refreshed dependency tree. Record the final run rather than carrying forward earlier build/test numbers.

Set `PLAYWRIGHT_PRODUCTION_SECURITY=true` after building to test the production Worker and strict CSP. CI uses this mode without skipping or retrying the known assertion into a passing result. The final Windows run exposes a newly discovered static-assets transport defect in the local runtime after an unread oversized upload is rejected. It reproduces without application code and is not repaired by available tested runtime versions. [Exact evidence and remaining scope](BUG_FIX_FOLLOWUP_2026-09-12.md).

The dependency review (development artifact omitted from source-only release) and machine-readable summary (development artifact omitted from source-only release) preserve the original, intermediate and final audit responses. No patched upstream `image-size` release was available, so the vulnerable implementation was replaced with a bounded PNG/GIF-only reader. The original advisory inputs were independently reproduced in an isolated upstream package and reject safely in the replacement. Future image-format support requires reviewed code and tests; zero npm findings does not establish universal security.

## Remaining actions

1. Resolve or establish the deployment relevance of the new local-runtime rejected-upload transport failure. Preserve the failing production assertion and its artifacts; do not call the whole integration suite passing. Code, evaluation, parser and the four new security checks pass.
2. Have independent reviewers complete the 30-response audit against original sources and the rubric. Publish ratings, corrections and unresolved issues. Agent review cannot fulfill independent human review.
3. Complete manual keyboard, screen-reader, 200% text resizing, mobile and resident task checks. Record browser/device/assistive-technology combinations and remaining barriers.
4. Recheck time-sensitive program information before launch, especially RMAP phase/income data and HRRP availability. Ask the agency when its page remains unclear. Assign ongoing refresh ownership and schedule.
5. Preserve dependency/advisory checks and the tested parser override. Configure access policy, shared rate limits, error monitoring, log retention, operator contact and rollback procedures. Confirm the deployment does not collect application documents or imply government endorsement.
6. Private Sites publication and the access gate are verified. Sign in as the owner and run deployed page/API/error-state smoke tests, including /evaluation and every JSON artifact. Record authenticated results before broader release.
7. Keep release scope visible: no full code interpretation, complete/current development inventory, verified translation or official determination. Expand only with additional authoritative ingestion and review.
8. Real local Ollama engineering checks are complete for the recorded model/version. Before enabling assistance for residents, assess evidence-selection usefulness with people and verify the deployed provider's retention, concurrency and cost controls. The default remains off; another provider/model needs its own verification.

## Release interpretation

The review build supports source inspection, engineering evaluation and supervised resident/agency testing after local verification. Public-service readiness remains contingent on the human, accessibility and operational actions above. This document does not imply deployment approval or a completed human audit.
