# Development guide

This guide covers local setup, code layout, checks and the HTTP API. Start with the [project overview](../README.md); use [Contributing](../CONTRIBUTING.md) for source changes and pull-request expectations.

## Local setup

Use Node.js 24 for the toolchain used in the recorded project checks. `package.json` declares a minimum of Node.js 22.19; that minimum is not a record of testing every Node version. Install from the committed lockfile:

```sh
npm ci
npm run dev -- --port 3001
```

Open `http://localhost:3001`. The default `LLM_PROVIDER=none` needs no model account, application secret, `.env` file, database or Sites account. To enable a model, follow [model configuration](LLM.md); local environment files are ignored by Git.

The source-only alpha contains an unfetched source registry and empty evidence/evaluation placeholders. The interface runs, but cited answers and corpus-dependent tests require locally acquired evidence. Follow [source acquisition and distribution](DISTRIBUTION.md) before running those checks. On a pristine source-release checkout, `npm run release:verify` checks its manifest before generated outputs are added.

### PowerShell

If execution policy blocks `npm.ps1`, use `npm.cmd` and `npx.cmd`:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 3001
```

This does not require changing execution policy. The other npm commands in this guide work in PowerShell and POSIX shells.

## Architecture and code layout

React and TypeScript provide the resident interface. Vinext/Vite compiles the application and its server routes for a Cloudflare-compatible Worker. The default answer flow routes the question, retrieves evidence from the local corpus, constructs a cited extractive answer and provides an official next step. Optional models operate after retrieval; [LLM.md](LLM.md) owns their selection contract and configuration.

```text
src/
  app/                 Resident pages and app/api HTTP routes
  components/          Shared interface components
  worker/              Worker entry point and request context
  lib/                 Answer engine, retrieval, citations, models, guardrails,
                       housing, geospatial, ingestion and interface strings
data/                   Source registry, corpus and adapter configuration
evaluation/             Benchmarks, suite runner and review artifacts
tests/                  Code regressions and browser checks
scripts/                Ingestion, evaluation, build, deployment and release tools
docs/                   Topic guides and dated verification records
public/                 Static browser assets
vendor/                 Reviewed local dependency replacements and licenses
```

The JSON registry and corpus are the initial index store; retrieval builds an in-memory lexical index. There is no database migration or external vector-index setup, and independent builds configure no D1 or R2 binding. The optional `.openai/hosting.json` belongs to the maintainer's Sites workflow. Local development and ordinary builds work without it.

Source URLs, selectors and refresh policies live in `data/sources.json`. GIS configuration is in `data/gis-config.json`; independent development-record version, digest and bounds are in `data/development-config.json`. Downloaded snapshots and completed reports are operator-generated material, not part of the source-only alpha.

## Canonical repository

The public project, issue tracker, security workflow and releases use [`Jaclenga/TampaBayBot`](https://github.com/Jaclenga/TampaBayBot). The package metadata uses the same canonical URL. Maintainer development checkouts may contain downloaded evidence and private run artifacts, so publishing always goes through the sanitized source-release builder rather than pushing a development branch directly.

## Commands and evidence prerequisites

Run commands from the project root. Use the checks appropriate to the change and record what actually ran.

| Command | Purpose / prerequisite |
| --- | --- |
| `npm run typecheck` | TypeScript checking |
| `npm run lint` | Source and evaluation-runner linting |
| `npm test` | Code regressions, including tests that expect an acquired corpus |
| `node --test --test-isolation=none tests/source-release.test.mjs` | Source packaging, manifest and sanitization checks; no downloaded corpus needed |
| `npm run ingest` | Fetch sources directly and regenerate evidence; outbound HTTPS and source review required |
| `npm run ingest -- --source=tampa-rmap` | Refresh one registered source |
| `npm run ingest -- --offline` | Reprocess already downloaded snapshots; cannot populate an empty release |
| `npm run ingest -- --check` | Check acquired source regeneration and provenance |
| `npm run evaluate` | Strict legacy benchmark and associated review packets; needs evidence |
| `npm run eval:suite` | Offline navigation, guardrail, provider and variation cases; corpus-dependent cases need evidence |
| `npm run test:llm-runtime` | Local Worker wiring with synthetic provider responses; needs the expected corpus |
| `npm run build` | Compile the production application |
| `npm run start` | Start Vinext's local production server after building |

`npm run check` combines typecheck, lint, code tests, the legacy evaluation, the offline suite and build. It does not run source regeneration checks, browser checks or real-model tests. Source-only release checks cover its manifest, packaging and standalone smoke; their success does not imply that the full corpus or browser suite passed.

Failed source refreshes preserve previous evidence with its original dates and an unavailable state, then exit unsuccessfully. Review changed text, metadata, terms and evaluation results before using refreshed material. See [data sources](DATA_SOURCES.md) and [distribution](DISTRIBUTION.md) for acquisition and licensing, [evaluation suite](EVAL_SUITE.md) for focused runs/comparisons, and [LLM.md](LLM.md#reproduce-integration-checks) for real Ollama testing. Release preparation and secret scanning are documented in [distribution](DISTRIBUTION.md) and [security](../SECURITY.md).

## Browser and accessibility checks

`npm run test:a11y` and `npm run test:e2e` invoke the same Playwright suite. Resident tests expect `LLM_PROVIDER=none` and the documented evidence corpus; provider-enabled tests use the separate fixtures described in [LLM.md](LLM.md).

[ACCESSIBILITY.md](ACCESSIBILITY.md) is canonical for Chromium installation, default port 3100, testing an existing preview, production Worker/CSP checks, PowerShell environment variables and report locations. It also distinguishes automated checks from manual keyboard, screen-reader, text-resizing and resident review.

The known rejected-upload transport failure occurs in Windows and Linux local production runs. See [release readiness](RELEASE_READINESS.md) for actual outcomes and [the investigation](BUG_FIX_FOLLOWUP_2026-09-12.md) for scope. The standalone deployment smoke uses a different, bounded test set.

## Live API smoke

Run `scripts/smoke.mjs` against an already running app with a populated corpus and generated evaluation reports. It checks health, a cited housing answer, source/evaluation downloads and the public City Hall address through property and nearby-development lookups. It needs outbound access; with a provider enabled, its housing question may also make a model call. Use `LLM_PROVIDER=none` for the baseline.

The default target is `http://localhost:3001`, and the default output overwrites `docs/local-api-validation.json`. Preserve dated records by choosing a new output; create its parent directory first. For example, in PowerShell:

```powershell
New-Item -ItemType Directory -Force work/smoke | Out-Null
$env:TAMPABAYBOT_SMOKE_URL = 'http://localhost:3001'
$env:TAMPABAYBOT_SMOKE_OUTPUT = 'work/smoke/local-api.json'
node scripts/smoke.mjs
Remove-Item Env:TAMPABAYBOT_SMOKE_URL, Env:TAMPABAYBOT_SMOKE_OUTPUT
```

For POSIX shells, create the directory with `mkdir -p work/smoke`, then run `TAMPABAYBOT_SMOKE_URL=http://localhost:3001 TAMPABAYBOT_SMOKE_OUTPUT=work/smoke/local-api.json node scripts/smoke.mjs`. The script neither starts a server nor authenticates through a hosting sign-in gate. A failed request or incomplete evidence stops the check; inspect the result and its scope before claiming hosted verification. It is separate from the standalone artifact smoke and does not complete human geographic or accessibility review.

## HTTP API

POST routes accept JSON. Property and development lookups use a selected, confirmed point rather than silently choosing the first address candidate.

| Route | Input / purpose |
| --- | --- |
| `POST /api/ask` | `question`, optional `jurisdictionId`; cited source navigation. Default `tampa-bay` requires a clear area before applying local sources. |
| `POST /api/location` | `address`; address candidates |
| `POST /api/property` | Numeric `latitude`, `longitude`, optional `address`; property context |
| `POST /api/development` | Numeric `latitude`, `longitude`; optional `radiusMeters`: 250, 500, 1,000 or 2,000 (default 1,000) |
| `GET /api/health` | Status, version, source and chunk counts; `no_evidence` for an empty corpus |
| `GET /api/sources` | Source-registry JSON download |
| `GET /api/evaluation?artifact=summary` | Evaluation summary; the default when `artifact` is omitted |
| `GET /api/evaluation?artifact=responses` | Legacy benchmark response artifact |
| `GET /api/evaluation?artifact=agent` | Labeled agent-review artifact |
| `GET /api/evaluation?artifact=human` | Human-review packets and recorded review states |
| `GET /api/evaluation?artifact=suite` | Offline suite report; unavailable unless its mode is `offline` |

An unknown evaluation artifact returns 404. Downloads expose the files bundled with that build; the source-only release contains empty/pending placeholders. Input bodies, text and coordinates are bounded and resident-input responses disable caching. These checks do not provide shared rate limiting; see [security](../SECURITY.md) for the implemented boundaries.

Resource IDs are `tampa-bay`, `tampa`, `st-petersburg`, `clearwater`, `hillsborough-county`, `pinellas-county`, and `pasco-county`. Unsupported IDs return 400. A conflicting city selection/question yields `needs_jurisdiction`; the response includes `jurisdictionId`, `jurisdictionLabel` and `needsJurisdiction`. These fields describe source selection, never a property-boundary finding. Legacy Tampa benchmark calls explicitly select `tampa`.

## Deployment and verification records

[Independent deployment](DEPLOYMENT.md) covers building an isolated Worker artifact, local production smoke, your own Cloudflare account, runtime secrets and rollback. The maintainer's private Sites preview is not required to develop or deploy your own copy.

For dated results and remaining work, use [release readiness](RELEASE_READINESS.md) and [release notes](../CHANGELOG.md). Keep those observations separate from this guide's repeatable commands.
