# Historical records

Historical investigations and verification receipts are preserved in Git history and omitted from current source-release packages. The links below pin their last pre-consolidation versions at commit `cf7a4dd9c0da4fea312283da50422045ccea5c3e`; they do not follow changes to the main branch. Original release-era versions of the runtime investigation, Ollama report and alpha receipts also remain in the [v0.1.0-alpha.4 tagged documentation](https://github.com/Jaclenga/TampaBayBot/tree/v0.1.0-alpha.4/docs).

Recorded results apply only to the named source, corpus, model and environment. Consolidating documentation does not rerun verification or resolve an open issue. Use [release readiness](RELEASE_READINESS.md) for the current status and remaining review.

## Runtime investigation

The [September 12 bug-fix and transport investigation](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/BUG_FIX_FOLLOWUP_2026-09-12.md) preserves corrections, failed Windows/Linux browser observations, attempted remedies and the later application-harness change. The local static-assets transport issue and unverified hosted impact remain documented in [limitations](LIMITATIONS.md#privacy-and-operations) and [release readiness](RELEASE_READINESS.md#remaining-review-and-operational-work).

## Ollama testing

The [September 12 real-model report](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/OLLAMA_TESTING.md) retains the exact Ollama version, model digest, acceptance and bypass counts, latency and test scope. Current setup and reproduction commands are in [model configuration](LLM.md#reproduce-integration-checks) and [live evaluation](EVAL_SUITE.md#evaluate-an-explicitly-configured-model).

## Release verification

- [Alpha.1 verification receipt](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/ALPHA_VERIFICATION.json): original source-only alpha checks, model observations and unresolved review.
- [Tampa Bay alpha.2/alpha.3 receipt](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/TAMPA_BAY_VERIFICATION.json): regional coverage, corpus hashes, browser results and live HTTP scope.

These receipts are historical evidence, not verification reports for a new installation.

## Geographic coverage

The [September 12–13 geographic expansion record](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/COVERAGE_EXPANSION.md) preserves public-location observations, counts, service outages and subsequent query results. Current geometry rules, adapter contracts, field/date meanings and query limits are consolidated in [geospatial behavior](GEOSPATIAL.md).

## Consolidated guides

- The [former risk enumeration](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/RISKS.md), previously named `RISK_ENUMERATION.md`, is consolidated into [limitations](LIMITATIONS.md).
- The [former design and assets guide](https://github.com/Jaclenga/TampaBayBot/blob/cf7a4dd9c0da4fea312283da50422045ccea5c3e/docs/ASSETS.md) is consolidated into [notices and attribution](../NOTICE.md#interface-and-assets).
