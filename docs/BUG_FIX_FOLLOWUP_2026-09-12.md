# Follow-up on the previously listed bugs

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

## Final verification

This section preserves the results from the earlier bug-fix run. Subsequent real Ollama testing passed and increased the code-test count to 193; see [the later Ollama record](OLLAMA_TESTING.md) and [current release readiness](RELEASE_READINESS.md). The historical synthetic-only statements below describe that earlier run.

- `npm test`: 191 passed, zero failed or skipped.
- Typecheck and lint: passed, including the new HTTP/security/parser tests.
- Offline evaluation: 205/205 cases, 3,902 applicable checks passed; 582 checks not applicable. All 77 legacy benchmark scenarios also pass.
- Synthetic local/API model integration: 32 checks passed across disabled, Ollama and OpenAI-compatible modes. No real model was run.
- Clean dependency installation and dependency-tree validation: passed. Full and production-only npm audits: zero findings. All ten parser regressions pass, including inputs independently reproduced against the original vulnerable parser.
- Deployment build: passed with the existing framework version and corrected application source.
- Complete production-browser run on Windows: **13 passed, 1 failed, 0 skipped**. All four new security checks pass: actual stalled uploads receive 408 from every input API, unused optimizers refuse requests, response policies are present, and the production CSP blocks an untrusted parser-inserted script while allowing hydration and search. The remaining transport failure is described below; this is not an entirely passing browser run.
- Accessibility findings and exact browser-run metadata are recorded in `evaluation/accessibility/latest.json`. Earlier design screenshots retain their original review timestamps.

## Newly discovered local-runtime transport issue — unresolved

The stronger production check exposed a separate issue in the local Workerd/Miniflare static-assets path on Windows: after an oversized request is rejected without draining the complete upload, a following request on a pooled connection can receive a proxy 500 or connection reset. The final failed test expected the normal 400 validation response from `/api/property` after rejecting the oversized `/api/location` upload.

This was reproduced with a minimal Worker containing no ParcelPrivateer or Vinext application code, with assets enabled. The same minimal requests passed without assets. It reproduced in the installed Miniflare 5.20260911.0-alpha and tested stable 4.20260730.0. Cancellation, bounded scheduling delays, connection-close responses, Worker-first routing and removal of the asset-existence probe did not repair it. A stable downgrade also introduced dependency advisories and was rejected. See the runtime evidence (development artifact omitted from source-only release) for the exact scope and reproduction.

The application retains byte/deadline limits and safe rejection; tests do not drain unbounded hostile uploads, retry failures into successes, or skip the failing assertion. The CI production check continues to expose the issue. No remote Linux CI run or authenticated hosted reproduction has established whether it affects either environment. This newly found issue remains open and blocks claiming complete production verification. The previously listed B01–B14 and dependency findings are corrected; the private deployment remains a review build.

## Remaining non-code release work

Independent human response/accessibility review, evaluation of any real model selected by an operator, source-refresh ownership, shared hosting rate/concurrency limits, operational monitoring/retention and authenticated hosted smoke testing remain release tasks. They cannot be completed by reporting synthetic checks as real human or production observations. The site remains owner-private. See [release readiness](RELEASE_READINESS.md).
