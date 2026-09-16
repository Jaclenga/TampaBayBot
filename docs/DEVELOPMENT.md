# Development guide

Local setup, code layout, checks and the HTTP API. See [Contributing](../CONTRIBUTING.md) for pull-request expectations.

## Local setup

Use Node.js 24, the toolchain used for recorded checks. The declared minimum is 22.19; other versions have not all been tested. Install from the committed lockfile:

```sh
npm ci
```

Run `npm run demo` for the [fictional demo](DEMO.md), or `npm run dev -- --port 3001` for a reviewed installation. Open `http://localhost:3001`. The default `LLM_PROVIDER=none` needs no model account, secret, `.env` file, database or Sites account. See [model configuration](LLM.md) to enable a model; local environment files are ignored by Git.

The source-only alpha has empty evidence and evaluation placeholders. For real cited answers and corpus-dependent tests, [acquire and review sources](SOURCE_UPDATES.md) under the [distribution terms](DISTRIBUTION.md). On a pristine source-release checkout, run `npm run release:verify` before generating outputs.

### PowerShell

If execution policy blocks `npm.ps1`, use `npm.cmd` and `npx.cmd`:

```powershell
npm.cmd ci
```

No execution-policy change is needed. The other npm commands work in PowerShell and POSIX shells.

## Architecture and code layout

React and TypeScript provide the resident interface; Vinext/Vite compiles it and its server routes for a Cloudflare-compatible Worker. The answer engine routes questions, retrieves local evidence and constructs cited extractive answers with official next steps. Optional models operate after retrieval; see [model configuration](LLM.md).

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

The JSON registry and corpus back an in-memory lexical index. There is no database migration or external vector-index setup; independent builds configure no D1 or R2 binding.

Source URLs, selectors and refresh policies live in `data/sources.json`; GIS settings in `data/gis-config.json`; and development-record version, digest and bounds in `data/development-config.json`. See [source updates](SOURCE_UPDATES.md) for the authoritative corpus, publication and recovery.

## Commands and evidence prerequisites

Run from the project root and record the checks performed.

| Command | Purpose / prerequisite |
| --- | --- |
| `npm run typecheck` | TypeScript checking |
| `npm run lint` | Source and evaluation-runner linting |
| `npm test` / `npm run test:source` | Offline application, security, parser, provider, release and synthetic-evidence regressions |
| `npm run test:corpus` | Complete historical regressions; needs the reviewed corpus |
| `npm run demo` | Isolated original fictional evidence; no source downloads |
| `npm run test:source:browser` | Chromium demo checks, including keyboard and accessibility automation |
| `npm run release:manifest` | Regenerate a public source PR manifest after semantic distribution checks |
| `node --test --test-isolation=none tests/source-release.test.mjs` | Source packaging, manifest and sanitization checks; no downloaded corpus needed |
| `npm run ingest` | Stage fetched sources for review; does not replace the active corpus |
| `npm run ingest -- --source=tampa-rmap` | Refresh one registered source |
| `npm run ingest -- --offline` | Reprocess already downloaded snapshots; cannot populate an empty release |
| `npm run ingest -- --check` | Check acquired source regeneration and provenance |
| `npm run evaluate` | Strict legacy benchmark and associated review packets; needs evidence |
| `npm run eval:suite` | Offline navigation, guardrail, provider and variation cases; corpus-dependent cases need evidence |
| `npm run test:llm-runtime` | Local Worker wiring with synthetic provider responses; needs the expected corpus |
| `npm run build` | Compile the production application |
| `npm run start` | Start Vinext's local production server after building |

`npm run check` combines typecheck, lint, source regressions and build. `npm run check:corpus` adds complete corpus regressions, legacy evaluation and the offline suite. Neither includes source regeneration, browser checks or real-model tests. Source-only release checks cover the manifest, packaging and standalone smoke.

For detailed procedures, use [source updates](SOURCE_UPDATES.md), [focused evaluations](EVAL_SUITE.md), [real Ollama checks](LLM.md#reproduce-integration-checks), [release preparation](DISTRIBUTION.md#preparing-a-source-only-pull-request) and [secret scanning](../evaluation/security/SECRET_SCAN.md).

## Browser and accessibility checks

`npm run test:a11y` and `npm run test:e2e` invoke the same Playwright suite. Resident tests expect `LLM_PROVIDER=none` and the documented evidence corpus; provider-enabled tests use the separate fixtures described in [LLM.md](LLM.md).

[ACCESSIBILITY.md](ACCESSIBILITY.md) covers Chromium installation, ports, existing previews, production Worker/CSP checks, environment variables, reports and manual review.

See [release readiness](RELEASE_READINESS.md) for recorded outcomes and [the rejected-upload transport investigation](HISTORY.md#runtime-investigation) for the known Windows/Linux local production failure. Standalone deployment smoke uses a separate test set.

## Live API smoke

Run `scripts/smoke.mjs` against a running app with a populated corpus and generated evaluation reports. It checks health, a cited housing answer, source/evaluation downloads and City Hall property/development lookups. Outbound access is required; use `LLM_PROVIDER=none` to avoid a model call.

The smoke requires `health.corpus.ready: true`. It accepts the expected overall `degraded` status when local mode reports `shared_controls_not_configured` or a public shared-mode probe reports `authenticated_probe_required`; these states remain in the saved report. Other operations failures stop the check. The script sends no monitoring credential and does not establish production readiness. Use the [authenticated operations monitor](OPERATIONS.md#health-and-alerts) to verify shared controls and database readiness.

The default target is `http://localhost:3001`; output overwrites `docs/local-api-validation.json`. Preserve dated records with a new output path and create its parent directory first. In PowerShell:

```powershell
New-Item -ItemType Directory -Force work/smoke | Out-Null
$env:TAMPABAYBOT_SMOKE_URL = 'http://localhost:3001'
$env:TAMPABAYBOT_SMOKE_OUTPUT = 'work/smoke/local-api.json'
node scripts/smoke.mjs
Remove-Item Env:TAMPABAYBOT_SMOKE_URL, Env:TAMPABAYBOT_SMOKE_OUTPUT
```

In POSIX shells, run `mkdir -p work/smoke`, then `TAMPABAYBOT_SMOKE_URL=http://localhost:3001 TAMPABAYBOT_SMOKE_OUTPUT=work/smoke/local-api.json node scripts/smoke.mjs`. The script does not start a server or pass a hosting sign-in gate; failed requests or incomplete evidence stop the check. It is separate from standalone artifact smoke and human geographic/accessibility review.

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

Unknown evaluation artifacts return 404. Downloads expose that build's bundled files, including empty/pending source-release placeholders. Input bodies, text and coordinates are bounded; resident-input responses disable caching. See [operations](OPERATIONS.md) for shared rate limiting.

Resource IDs are `tampa-bay`, `tampa`, `st-petersburg`, `clearwater`, `hillsborough-county`, `pinellas-county` and `pasco-county`; unsupported IDs return 400. Conflicting city selections/questions yield `needs_jurisdiction`, with `jurisdictionId`, `jurisdictionLabel` and `needsJurisdiction` for source selection, not property-boundary findings. Legacy Tampa benchmarks explicitly select `tampa`.

## Deployment and verification records

[Deployment](DEPLOYMENT.md) covers Worker artifacts, production smoke, Cloudflare hosting, secrets and rollback. Dated results and remaining work belong in [release readiness](RELEASE_READINESS.md) and the [changelog](../CHANGELOG.md).
