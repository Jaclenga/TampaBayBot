# Release notes

## v0.1.0-alpha.1 — 2026-09-12

Initial source-only alpha for contributors, local use and supervised testing. It is an independent Tampa housing-information navigator, not a government service or an official decision system.

### Included

- Original MIT-licensed application, evidence retrieval and citation validation, GIS/development adapters, six guardrail prompt inserts and five runtime guard stages.
- Optional native Ollama and OpenAI-compatible adapters; model assistance is disabled by default.
- An independent Cloudflare deployment build that uses the operator's own account and excludes local secrets and owner-specific Sites metadata.
- Source acquisition and review instructions, repeatable evaluation tools, a dedicated secret-history scanner, and safe release packaging.
- A private vulnerability-reporting route in [SECURITY.md](SECURITY.md).

The public tree deliberately excludes archived third-party raw/normalized content, source excerpts, copied response/audit packets and machine-specific browser artifacts. It contains truthful empty evidence/evaluation placeholders. The operator acquires source material directly, reviews the applicable terms and regenerates local reports. The retained private development history is not part of the source-only release. See [distribution policy](docs/DISTRIBUTION.md).

### Verification and limits

Final local alpha verification passed 197 code tests, 205 offline cases / 3,902 applicable checks, 32 synthetic provider/runtime checks, type checking, lint and production build. The full dependency audit returned zero findings. Independent deployment artifacts passed 18 checks across populated and empty-source variants, including real Wrangler dry-runs and local production HTTP; deployment into an external Cloudflare account remains unverified. Actual Ollama 0.24.0 / Meta Llama 3 8B testing previously passed 24 repeated native cases, nine app HTTP checks and two compatibility cases. Those model and corpus tests do not certify a newly acquired corpus or human usefulness. [Model results](docs/OLLAMA_TESTING.md) and [alpha verification](docs/ALPHA_VERIFICATION.json) record these distinct scopes.

The known Windows Miniflare static-assets defect remains: rejecting an unread oversized upload can make the next pooled request fail. The complete recorded production-browser run is 13 passed, one failed, zero skipped. No passing local build or deployment dry-run replaces that result. Hosted/Linux relevance still needs to be established.

Independent human answer review, manual accessibility review, source-refresh ownership, shared rate/concurrency limits, monitoring, retention and full hosted smoke checks remain prerequisites for an unrestricted resident-facing service. No account is required for ordinary local use; privileged administration and model credentials remain operator-controlled.
