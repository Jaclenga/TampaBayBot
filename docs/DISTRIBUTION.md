# Source-only distribution

Public alpha packages include original software, tests, benchmark definitions, publisher links, fetch configuration and [fictional demo](DEMO.md) fixtures. Downloaded evidence and historical results are excluded; the app starts with an empty corpus.

This guide covers packaging and external-material terms. Use [source updates](SOURCE_UPDATES.md) to acquire evidence, [deployment](DEPLOYMENT.md) to host it and [release readiness](RELEASE_READINESS.md) for recorded checks.

Omitting external material does not establish its permitted uses or grant rights. MIT covers original software; dependencies, model weights and external information retain their respective terms.

## Publisher review recorded September 12, 2026

| Publisher / material | Observed terms and release handling |
| --- | --- |
| City of Tampa website | The City's [Conditions and Use](https://www.tampa.gov/about-us/tampagov/conditions-and-use), updated March 6, 2026, generally permits copying and distributing public information while identifying exceptions for copyrighted materials, artwork and the City seal. It permits descriptive hyperlinks and prohibits framing its website. This is useful permission for qualifying City information, not proof that every embedded or third-party item is covered. Alpha packages omit the captured HTML/PDF responses and evidence excerpts. |
| Plan Hillsborough maps / GIS | The [GIS maps and data page](https://planhillsborough.org/gis-maps-data-files/) carries an accuracy/use disclaimer and a restriction on reproducing map sheets for sale without approval in the preserved September 12 snapshot. A fresh web-tool request returned HTTP 403, so no new permission is claimed. Packages omit its snapshot HTML, GIS responses and extracted passages; linked map sheets and media were already excluded from ingestion. |
| Hillsborough County and Florida Housing | The [county source](https://hcfl.gov/residents/human-services/help-me-hillsborough) and [Florida Housing source](https://www.floridahousing.org/buyers-renters/buy-or-rent/resources) remain links and operator fetch configuration. No blanket redistribution license was verified in this release review. The fresh Florida Housing web-tool request returned HTTP 502. Their captured pages and excerpts are omitted. |
| GIS service responses | The configured City/Plan Hillsborough services retain their publisher attribution and applicable notices. Endpoint configuration is included; downloaded service metadata/features are omitted. Use of live responses remains an operator responsibility. |
| Tampa Development Records | The [pinned upstream DATA_LICENSE.md](https://github.com/Jaclenga/Tampa-Development-Records/blob/b1ac7fc705fe667ff046be11f76dcb8aa3b3d872/DATA_LICENSE.md) and underlying City record terms apply separately. A fresh web-tool request did not retrieve that file, so this review grants no additional permission. The source-only package includes its pinned URL/hash configuration and adapter, with no downloaded CSV/archive. |

This dated review supports the packaging policy, not a legal opinion about every record or deployment. Before distributing external material, establish a permitted use and retain the applicable terms and attribution.

## Build a release tree

From the project directory:

```sh
node scripts/package-release.mjs --output work/releases/v0.1.0-alpha.4-source
```

Use a new output directory under `work/releases/`; existing output is never replaced. The script follows an explicit source-file policy, rejects symlinked inputs and redirected output ancestors, and preserves the working corpus.

`SOURCE_RELEASE_MANIFEST.json` records included files' SHA-256 hashes, an ordered-file-list digest and exclusions; it excludes its own hash. Text is normalized to LF before hashing, and the generated `.gitattributes` preserves those bytes across operating systems. Packaging makes no network request and runs no tests. Rebuild after source changes.

The omitted content is:

- `data/raw/**`, `data/normalized/**` and the historical `data/chunks.json` corpus;
- historical ingestion/verification reports and quote-bearing response, agent-review, human-review and suite-result artifacts;
- historical accessibility, security, Ollama and local/hosted deployment reports;
- historical screenshots, external data archives, runtime state, credentials, deployment-specific hosting configuration, private deployment artifacts and Git history. The original fictional demo image under `docs/images/` is included.

Required JSON imports become placeholders: zero chunks, unset retrieval dates, unavailable sources, empty response/review arrays and reports marked `not_run`. The project README explains this state; links to omitted artifacts become explanatory text. The registry retains publisher URLs, operator-authored descriptions, fetch settings and next-step links. Historical agent review scripts/ratings are omitted to prevent attaching old judgments to new answers.

The package includes documentation, `.github/workflows/source-release.yml` when present, and Gitleaks setup, configuration and a metadata-only report template. It excludes historical scan reports and the corpus-dependent development workflow. Source-build checks do not count missing-corpus regressions or evaluations as passes.

## Populate and validate locally

Review the publisher terms above, then follow [source updates](SOURCE_UPDATES.md) to stage a candidate, inspect it, approve its digest and validate/apply it. That guide owns acquisition, publication and recovery commands. GIS/development lookups also require their configured remote services.

Use the [development command reference](DEVELOPMENT.md#commands-and-evidence-prerequisites) for regeneration, corpus tests and build checks, and the [evaluation suite](EVAL_SUITE.md) for focused runs. Fresh publisher content may differ from historical expectations. `evaluate` writes fresh responses and pending human-review packets; `eval:suite` writes its own results. Both fail on unmet expectations. Historical agent-review lists stay empty until a new review occurs; new corpus versions need reviewed expectations and independent human assessment.

See [model setup](LLM.md) and [deployment](DEPLOYMENT.md) for inference and hosting. Model licenses and provider retention remain separate from software distribution.

## Preparing a source-only pull request

For ordinary code or documentation edits in a public source checkout:

```sh
npm test
npm run release:manifest
npm run release:verify
```

Run manifest preparation after the final source edit, then inspect and commit its diff with your changes. It validates the empty registry, corpus and response reports before updating hashes, refuses downloaded snapshots or private paths, and excludes generated build directories. A missing or stale manifest fails public CI. For a populated installation, [build a new source-only tree](#build-a-release-tree) instead.

## Report hygiene

Only `docs/ALPHA_VERIFICATION.json` and `docs/TAMPA_BAY_VERIFICATION.json` are allowed as JSON documentation in the source release. Keep deployment receipts and machine-specific reports in ignored local work; updated hashes do not make them distributable.

Before committing a local JSON report, remove machine prefixes with:

```sh
node scripts/sanitize-report.mjs evaluation/accessibility/playwright-results.json
```

The sanitizer replaces workspace, user-home and program-install prefixes while preserving check results, public URLs and numeric values. It does not scan secrets or redact resident data. Review contents separately and exclude resident prompts, credentials and raw provider completions from public evidence.
