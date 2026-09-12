# Documentation

Start with the [project overview](../README.md) for capabilities, a screenshot and quick start. Use the guides below for the details behind each topic.

## Using ParcelPrivateer

| Task | Main guide |
| --- | --- |
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
| Security controls, data flow, operator responsibilities and reporting | [Security](../SECURITY.md) |
| Add trusted guardrail checks | [Guardrail extension guide](GUARDRAIL_INSERTS.md) |
| Software, external information and model licensing | [Notices](../NOTICE.md) |

Evaluation methods explain what a check means. The [release-readiness record](RELEASE_READINESS.md) holds dated results, their scope and unresolved issues. An automated or agent review is not a substitute for independent human review.

## Development and deployment

| Task | Main guide |
| --- | --- |
| Set up a checkout, understand the architecture, run checks or use the APIs | [Developer guide](DEVELOPMENT.md) |
| Propose code, source, documentation or review contributions | [Contributing](../CONTRIBUTING.md) |
| Build and deploy with your own hosting account | [Independent deployment](DEPLOYMENT.md) |
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
