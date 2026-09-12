# Bug-fix follow-up: September 12, 2026

This dated investigation preserves the corrections, test results and runtime reproduction from the follow-up work. It is not a current release checklist; use [release readiness](RELEASE_READINESS.md) for the consolidated status.

The original B01–B14 scan (development artifact omitted from source-only release) was rechecked against its code and regression tests. Two incomplete edge cases were reproduced and corrected. The remaining dependency/parser finding and the concrete HTTP/browser-security gaps in `SECURITY.md` were also addressed. Independent human review and hosting operations are tracked separately; this is not a claim that every possible bug has been eliminated.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| B04: the standard locality abbreviation “St. Petersburg” was missed | Recognize the period while retaining Tampa street names with the same text | `tests/answers.test.mjs` |
| B07: overdue remote data could win before a delayed timer callback ran | Compare monotonic elapsed time at fetch, body-read and decoding boundaries; reject and cancel overdue reads | `tests/geospatial.test.mjs` |
| Vulnerable upstream ICNS/JXL/HEIF image parsers remained in the build dependency tree | Replace that implementation with an original bounded PNG/GIF-only header reader; retain the compatible framework version | `tests/image-dimensions.test.mjs`, dependency review (development artifact omitted from source-only release) |
| A slow request upload could keep an API body reader open indefinitely | Ten-second whole-body deadline, safe 408 response, monotonic elapsed checks, client-abort cleanup and nonblocking cancellation in all four input APIs | `tests/http.test.mjs` |
| Oversized request rejection could hang while waiting for cancellation | Cancel on a best-effort basis and release the reader without awaiting the underlying stream's cancellation callback | `tests/http.test.mjs` |
| Browser response policies were incomplete | Fresh per-response script nonces, enforced production CSP, same-origin framing policy, HTTPS HSTS and no shared HTML/API caching, including error responses | `tests/response-security.test.mjs`, `tests/e2e/security.spec.ts` |
| The unused framework image-processing route could still process a supplied URL | Return 404 before framework dispatch for both framework route names and decoded/RSC/trailing-slash aliases | `tests/response-security.test.mjs`, `tests/e2e/security.spec.ts` |

The parser replacement deliberately rejects JPEG, WebP, SVG, ICNS, JXL, HEIF/AVIF and other unsupported formats. The current site has no imported or metadata image assets. Future image support requires a reviewed parser change. Local development allows Vite's inline scripts/WebSocket connections; the production policy uses nonces. Inline styles remain allowed for framework compatibility.

## Verification at the follow-up run

This section preserves the earlier bug-fix run. Subsequent real-model verification is recorded in [Ollama testing](OLLAMA_TESTING.md); later release checks are in [release readiness](RELEASE_READINESS.md). The synthetic-only statements below describe this earlier run.

- `npm test`: 191 passed, zero failed or skipped.
- Typecheck and lint: passed, including the new HTTP/security/parser tests.
- Offline evaluation: 205/205 cases, 3,902 applicable checks passed; 582 checks not applicable. All 77 legacy benchmark scenarios also pass.
- Synthetic local/API model integration: 32 checks passed across disabled, Ollama and OpenAI-compatible modes. No real model was run.
- Clean dependency installation and dependency-tree validation: passed. Full and production-only npm audits: zero findings. All ten parser regressions pass, including inputs independently reproduced against the original vulnerable parser.
- Deployment build: passed with the existing framework version and corrected application source.
- Complete production-browser run on Windows: **13 passed, 1 failed, 0 skipped**. All four new security checks pass: actual stalled uploads receive 408 from every input API, unused optimizers refuse requests, response policies are present, and the production CSP blocks an untrusted parser-inserted script while allowing hydration and search. The remaining transport failure is described below; this is not an entirely passing browser run.
- Accessibility findings and exact browser-run metadata are recorded in `evaluation/accessibility/latest.json`. Earlier design screenshots retain their original review timestamps.

## Local-runtime transport issue

The stronger production check exposed a separate issue in the local Workerd/Miniflare static-assets path on Windows: after an oversized request is rejected without draining the complete upload, a following request on a pooled connection can receive a proxy 500 or connection reset. The final failed test expected the normal 400 validation response from `/api/property` after rejecting the oversized `/api/location` upload.

This was reproduced with a minimal Worker containing no ParcelPrivateer or Vinext application code, with assets enabled. The same minimal requests passed without assets. It reproduced in the installed Miniflare 5.20260911.0-alpha and tested stable 4.20260730.0. Cancellation, bounded scheduling delays, connection-close responses, Worker-first routing and removal of the asset-existence probe did not repair it. A stable downgrade also introduced dependency advisories and was rejected. See the runtime evidence (development artifact omitted from source-only release) for the exact scope and reproduction.

The application retains byte/deadline limits and bounded rejection; tests do not drain unbounded hostile uploads, retry failures into successes, or skip the failing assertion. The issue was unresolved at the end of this investigation and prevented a claim of complete production verification. The previously listed B01–B14 and dependency findings were corrected.

### Later Linux CI observation

After the initial alpha source tag was frozen, later development CI completed on `ubuntu-latest` on September 12, 2026. Its full production browser suite also recorded **13 passed, 1 failed, 0 skipped, 0 flaky**. The same following `/api/property` request returned 500 instead of 400, with the local proxy reporting “Network connection lost.” All four production security tests passed. Installation, dependency audit, type checking, lint, code tests, source checks, evaluation, build and the synthetic model-runtime integration also passed; tracking `public/.gitkeep` resolved the earlier missing-directory failure. The [public aggregate receipt](https://github.com/Jaclenga/ParcelPrivateer/releases/download/v0.1.0-alpha.1/linux-browser-followup.json) omits private repository and CI identifiers, which remain in the maintainer's audit trail.

The issue is now observed in **Windows and Linux local runtimes**. This Linux run used the application sequence; the earlier minimal Worker reproduction remains a Windows observation. Hosted Cloudflare impact is still unverified. The public release's portable `linux-browser-followup.json` addendum records the later CI evidence without changing the original alpha tag, manifest or dated results above. Its Linux counts come from that run's fresh Playwright report, not the older Windows accessibility summary included in the same CI artifact.

### Later application-harness correction

The current development harness separates two validation boundaries. Resident flows, assets, CSP and response policies still use the built static-assets route. Incomplete-upload checks use the identical compiled Worker through a direct no-assets Miniflare route and confirm a subsequent health request succeeds. On September 12, 2026, this 15-case Windows application suite passed without retries, failures, skips or flaky cases. The change does not rewrite the historical results above or claim that the reproduced static-assets proxy defect is fixed or relevant to hosted Cloudflare.

## Follow-up tracking

[Release readiness](RELEASE_READINESS.md#remaining-review-and-operational-work) tracks unresolved runtime, independent review and deployment work. It distinguishes the public source release from the owner-private hosted review build and records later verification without changing this historical result.
