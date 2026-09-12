# Source-only distribution

Public alpha packages distribute the original software, test and benchmark definitions, publisher links and fetch configuration. They do **not** distribute downloaded source snapshots, extracted evidence, response packets or screenshots. The app starts with an empty corpus and reports that evidence is unavailable until an operator fetches and reviews sources.

This guide is the canonical packaging, regeneration and publication-history policy. [Release readiness](RELEASE_READINESS.md) records which checks have actually run; [deployment](DEPLOYMENT.md) covers operating a built instance.

This choice resolves the release-package uncertainty by omitting the material. It does not declare that all agency content is restricted, grant new rights, or establish that every intended later use is permitted. MIT covers the original software; dependencies, model weights and external information retain their respective terms.

## Publisher review recorded September 12, 2026

| Publisher / material | Observed terms and release handling |
| --- | --- |
| City of Tampa website | The City's [Conditions and Use](https://www.tampa.gov/about-us/tampagov/conditions-and-use), updated March 6, 2026, generally permits copying and distributing public information while identifying exceptions for copyrighted materials, artwork and the City seal. It permits descriptive hyperlinks and prohibits framing its website. This is useful permission for qualifying City information, not proof that every embedded or third-party item is covered. Alpha packages omit the captured HTML/PDF responses and evidence excerpts. |
| Plan Hillsborough maps / GIS | The [GIS maps and data page](https://planhillsborough.org/gis-maps-data-files/) carries an accuracy/use disclaimer and a restriction on reproducing map sheets for sale without approval in the preserved September 12 snapshot. A fresh web-tool request returned HTTP 403, so no new permission is claimed. Packages omit its snapshot HTML, GIS responses and extracted passages; linked map sheets and media were already excluded from ingestion. |
| Hillsborough County and Florida Housing | The [county source](https://hcfl.gov/residents/human-services/help-me-hillsborough) and [Florida Housing source](https://www.floridahousing.org/buyers-renters/buy-or-rent/resources) remain links and operator fetch configuration. No blanket redistribution license was verified in this release review. The fresh Florida Housing web-tool request returned HTTP 502. Their captured pages and excerpts are omitted. |
| GIS service responses | The configured City/Plan Hillsborough services retain their publisher attribution and applicable notices. Endpoint configuration is included; downloaded service metadata/features are omitted. Use of live responses remains an operator responsibility. |
| Tampa Development Records | The [pinned upstream DATA_LICENSE.md](https://github.com/Jaclenga/Tampa-Development-Records/blob/b1ac7fc705fe667ff046be11f76dcb8aa3b3d872/DATA_LICENSE.md) and underlying City record terms apply separately. A fresh web-tool request did not retrieve that file, so this review grants no additional permission. The source-only package includes its pinned URL/hash configuration and adapter, with no downloaded CSV/archive. |

The review establishes a conservative packaging policy and records the limits of the available evidence. It is not a legal opinion about every record, excerpt or deployment. Obtain a clear basis before adding external material to a later distributable corpus. Keep evidence of the applicable publisher terms and attribution with that decision.

## Build a release tree

From a maintainer checkout:

```sh
node scripts/package-release.mjs --output work/releases/v0.1.0-alpha.2-source
```

The output path must be a new directory under `work/releases/`; existing output is never deleted or replaced. The script uses an explicit source-file policy, rejects symlinked inputs and redirected output ancestors, and never copies `.git`, installed dependencies, secrets, owner `.openai` metadata, ignored work or deployment artifacts. It does not change the working corpus or rewrite repository history.

`SOURCE_RELEASE_MANIFEST.json` records every included file's SHA-256, a digest of the ordered file list and explicit exclusions. Included text is normalized to LF before hashing, and the generated `.gitattributes` preserves those bytes across operating systems. Packaging itself makes no network request and does not run or invent tests. The manifest excludes its own self-referential hash. A new package must be built after source changes; an older manifest does not verify a later tree.

The omitted content is:

- `data/raw/**`, `data/normalized/**` and the historical `data/chunks.json` corpus;
- historical ingestion/verification reports and quote-bearing response, agent-review, human-review and suite-result artifacts;
- historical accessibility, security, Ollama and local/hosted deployment reports;
- screenshot images, external data archives, owner hosting configuration and Git history.

Required JSON import paths are replaced with honest placeholders: zero chunks, unset retrieval dates, unavailable sources, empty response/review arrays and reports marked `not_run`. Packaging reuses the project README overview, whose alpha notice explains this initial state. Relative links to omitted artifacts, including screenshots, become explanatory text rather than broken links. The source registry retains publisher URLs, operator-authored descriptions, fetch settings and next-step links. Historical agent review scripts/ratings are omitted so bootstrap cannot attach old judgments to new answers.

The package includes the documentation index, developer/evaluation guides and `.github/workflows/source-release.yml` when present, plus the dedicated Gitleaks scanner setup, configuration and metadata-only report template. It excludes historical scan reports and the corpus-dependent development workflow. Source-build checks do not count the missing corpus's regression/evaluation cases as passes. Any generated local corpus remains outside source distribution; never replace a failing test with an invented historical success.

## Populate and validate locally

Read the publisher notes and review your intended use, then run from the unpacked tree:

```sh
npm ci
npm run ingest
npm run dev -- --port 3001
```

Ingestion downloads directly from configured publishers using HTTPS, records provenance and returns a nonzero exit code if a source fails. Inspect `data/ingestion-report.json` and the downloaded originals. Failed initial sources remain unavailable. Restart the server after data changes. Local GIS/development lookups additionally need their configured remote services.

After reviewing the populated corpus, run:

```sh
npm run ingest -- --check
npm test
npm run evaluate
npm run eval:suite
npm run typecheck
npm run build
```

The complete tests and dated navigation expectations require evidence. Fresh publisher content may differ from the private development snapshot; these commands preserve and report failures instead of claiming historical reproducibility. `evaluate` writes fresh response packets and pending human-review packets before returning failure on mismatched expectations. `eval:suite` writes its own results and also fails on unmet expectations. The empty historical agent-review list remains empty until a new review is actually performed. Future corpus updates need reviewed expectations and independent human assessment.

For inference and hosting, see [model setup](LLM.md) and [independent deployment](DEPLOYMENT.md). Model downloads/licenses and inference-provider retention remain separate from software distribution.

## History and report hygiene

A source-only archive or a new root release branch does not sanitize the development branch's history. Keep the existing review repository private if it contains unreviewed snapshots. Publish only the prepared code-only tree/history to a public source repository; do not mirror all development refs or attach an archive of the private default branch. This packaging step does not change GitHub visibility or access settings.

The manifest includes the required empty JSON placeholders even though generated-data paths are ignored by Git. When creating the initial root release commit, stage the reviewed manifest-listed files explicitly, including those placeholders; a plain `git add .` can omit them. After they are tracked, ignore rules cannot prevent local ingestion from modifying them. Build subsequent public releases with the packager again rather than publishing a populated working tree. Git history scans require an actual Git checkout; initialize the reviewed release tree or run them in the published source repository, and never report an unscanned archive as a clean history.

Before committing a local JSON report, remove machine prefixes with:

```sh
node scripts/sanitize-report.mjs evaluation/accessibility/playwright-results.json
```

The sanitizer preserves check results, public URLs and numeric values while replacing workspace, user-home and program-install prefixes. It is not a secret scanner or a resident-data redactor. Review report contents separately, and never submit resident prompts, credentials or raw provider completions as public evidence.
