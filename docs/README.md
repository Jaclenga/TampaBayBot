# Documentation

Start with the [project overview](../README.md) for capabilities, a screenshot and quick start. Use the guides below for the details behind each topic.

## Using TampaBayBot

| Task | Main guide |
| --- | --- |
| Try the interface without downloading evidence | [Fictional demo](DEMO.md) |
| Stage, review and apply source changes | [Source updates](SOURCE_UPDATES.md) |
| Inspect expanded geographic services and their live verification | [Coverage expansion](COVERAGE_EXPANSION.md) |
| Understand the source collection and its dates | [Data sources](DATA_SOURCES.md) |
| Fetch and review evidence for a source-only installation | [Distribution and source setup](DISTRIBUTION.md) |
| Configure no-model, Ollama or API assistance | [Model configuration](LLM.md) |
| Understand addresses, jurisdiction, parcels and nearby records | [Geospatial behavior](GEOSPATIAL.md) |

## Trust and review

| Topic | Main guide |
| --- | --- |
| Ingestion, retrieval, citations, provenance and uncertainty | [Methodology](METHODOLOGY.md) |
| What evaluation measures and how people review answers | [Evaluation and review](EVALUATION.md) |
| Run the offline suite, compare regressions or evaluate a model | [Evaluation suite](EVAL_SUITE.md) |
| Accessibility support and the manual review checklist | [Accessibility](ACCESSIBILITY.md) |
| Product coverage and decision boundaries | [Limitations](LIMITATIONS.md) |
| Supported versions, privacy, safe configuration and vulnerability reporting | [Security](../SECURITY.md) |
| Add trusted guardrail checks | [Guardrail extension guide](GUARDRAIL_INSERTS.md) |
| Software, external information and model licensing | [Notices](../NOTICE.md) |

Evaluation methods explain what a check means. The [release-readiness record](RELEASE_READINESS.md) holds dated results, their scope and unresolved issues. An automated or agent review is not a substitute for independent human review.

### Published alpha.4 claim results

| Metric | Result |
| --- | ---: |
| Factual accuracy | **12 / 12 passed** |
| Citation correctness | **12 / 12 passed** |
| Citation completeness | **12 / 12 passed** |

These are exact-claim results from 12 hand-authored Tampa Bay cases against the retained development corpus. They are not a general accuracy percentage or a substitute for independent human review. See [definitions, totals and limitations](EVALUATION.md#published-alpha4-results).

## Development and deployment

| Task | Main guide |
| --- | --- |
| Set up a checkout, understand the architecture, run checks or use the APIs | [Developer guide](DEVELOPMENT.md) |
| Propose code, source, documentation or review contributions | [Contributing](../CONTRIBUTING.md) |
| Build and deploy with your own hosting account | [Independent deployment](DEPLOYMENT.md) |
| Configure service controls, monitoring and incident response | [Operations](OPERATIONS.md) |
| Package source without redistributing archived evidence | [Distribution policy](DISTRIBUTION.md) |
| Review current release evidence and unfinished launch work | [Release readiness](RELEASE_READINESS.md) |
| See changes by release | [Changelog](../CHANGELOG.md) |
| Understand visual design and asset attribution | [Design and assets](ASSETS.md) |

## Historical records

These documents preserve investigations or observed runs. Their counts and conclusions apply to the recorded source, model, corpus and environment; use [release readiness](RELEASE_READINESS.md) for the current summary.

- Original implementation plan (development artifact omitted from source-only release)
- Initial bug scan (development artifact omitted from source-only release) and [follow-up investigation](BUG_FIX_FOLLOWUP_2026-09-12.md)
- [Recorded real Ollama testing](OLLAMA_TESTING.md)
- Dependency remediation (development artifact omitted from source-only release)
- [Dedicated source/history secret scanning](../evaluation/security/SECRET_SCAN.md)

Source-only packages omit historical raw data and some report artifacts. An omitted artifact is not a newly completed check; follow the setup and evaluation guides to assess your own corpus and deployment.
