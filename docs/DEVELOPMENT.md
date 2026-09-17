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

The [answer architecture](ARCHITECTURE.md) describes QueryPlan signals, structured facts, declarative source sections, retrieval stages and shared evidence invariants. Add source/program semantics there instead of branching on source IDs in the core answer engine.

Source URLs, selectors and refresh policies live in `data/sources.json`; GIS settings in `data/gis-config.json`; and development-record version, digest and bounds in `data/development-config.json`. See [source updates](SOURCE_UPDATES.md) for the authoritative corpus, publication and recovery.

## Commands and evidence prerequisites

Run from the project root and record the checks performed.

| Command | Purpose / prerequisite |
| --- | --- |
| `npm run typecheck` | TypeScript and declaration-file checking; JavaScript implementations are exercised by tests |
| `npm run lint` | Source and evaluation-runner linting |
| `npm test` / `npm run test:source` | Offline application, security, parser, provider, release and synthetic-evidence regressions |
| `npm run test:corpus` | Complete historical regressions; needs the reviewed corpus |
| `npm run demo` | Isolated original fictional evidence; no source downloads |
| `npm run test:source:browser` | Chromium demo checks on port 3112, including keyboard and accessibility automation; install Chromium with `npx playwright install chromium` first |
| `npm run release:manifest` | Regenerate a public source PR manifest after semantic distribution checks |
| `npm run release:verify` | Verify source-only contents and manifest hashes; run after refreshing the manifest or from an unchanged source release |
| `node --test --test-isolation=none tests/source-release.test.mjs` | Source packaging, manifest and sanitization checks; no downloaded corpus needed |
| `npm run ingest` | Stage fetched sources for review; does not replace the active corpus |
| `npm run ingest -- --source=tampa-rmap` | Stage a refresh of one registered source; still requires review and application |
| `npm run ingest -- --offline` | Reprocess already downloaded snapshots; cannot populate an empty release |
| `npm run ingest -- --check` | Check acquired source regeneration and provenance; writes `data/verification-report.json` |
| `npm run evaluate` | Strict legacy benchmark and associated review packets; needs evidence |
| `npm run eval:suite` | Offline navigation, guardrail, provider, variation, jurisdiction and claim-quality cases; public-snapshot cases need reviewed evidence |
| `npm run eval:recall -- --strict` | Offline program-recall checks against reviewed, hash-matched evidence; reports stay under `work/` |
| `npm run test:llm-runtime` | Local Worker wiring with synthetic provider responses; needs the expected, ready corpus; writes `evaluation/llm-runtime/latest.json` |
| `npm run build` | Compile the production application |
| `npm run start` | Start Vinext's local production server after building |
| `npm run build:standalone -- --name my-tampabaybot` | Compile an isolated Worker artifact under `work/standalone/`; no account or deployment required |
| `npm run test:standalone -- --directory work/standalone/<artifact-directory>` | Check a generated standalone artifact with a Wrangler dry run and local HTTP smoke; no external deployment |

`npm run check` combines typecheck, lint, source regressions and build. `npm run check:corpus` combines typecheck, lint, complete corpus regressions, legacy evaluation, the offline suite and build. Neither includes source regeneration, program-recall evaluation, browser checks or real-model tests. Source-release CI separately checks the manifest, secret scanning, dependencies, source tests, browser flows and standalone artifact smoke.

For a focused regression, run `node --test --test-isolation=none tests/program-context-regressions.test.mjs` and replace the path with the relevant test file. `npm test` discovers the source test files through `scripts/test-source.mjs`; historical corpus-dependent tests are excluded there. Do not run acquisition or live-provider commands to satisfy an offline source check.

For detailed procedures, use [source updates](SOURCE_UPDATES.md), [focused evaluations](EVAL_SUITE.md), [real Ollama checks](LLM.md#reproduce-integration-checks), [release preparation](DISTRIBUTION.md#preparing-a-source-only-pull-request) and [secret scanning](../evaluation/security/SECRET_SCAN.md).

### Behavior-change regression gate

Routing, retrieval, source-section preferences, citation selection and uncertainty changes need a populated-corpus check in addition to `npm test`. Use an isolated checkout with reviewed snapshots and matching benchmark/oracle provenance. Before changing the implementation, preserve a full offline report with `npm run eval:suite -- --output work/evals/before`. After the change, run:

```sh
npm run test:corpus
npm run evaluate
npm run eval:suite -- --output work/evals/after
npm run eval:compare -- --baseline work/evals/before/latest.json --candidate work/evals/after/latest.json
```

Review every failure and changed answer against the retained evidence, including application method versus availability, short application steps, selected income years and required qualifications. Do not rewrite authored expectations merely to match the new output. Corpus refreshes or intentional behavior changes need independent expectation review and the [documented provenance comparison](EVAL_SUITE.md#compare-reports); record any absent comparison baseline separately.

The comparator also flags changed citation counts and checks that become inapplicable after a corrected answer status. It can therefore exit 1 even when the candidate passes every applicable check. Preserve that report and review each flag against the source evidence and unchanged benchmark expectation; a passing candidate alone does not explain away a comparison failure.

An empty source-only checkout cannot run these corpus-dependent checks. Run its synthetic checks, record the corpus gate as unverified, and arrange a reviewed populated-corpus run before claiming the behavior change is fully regression-tested. Source-only CI and fictional demo results do not substitute for that run. Keep snapshots and generated response packets out of source releases.

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

POST routes require an `application/json` object, at most 8,192 bytes, uploaded within 10 seconds. A supplied `Origin` must exactly match the app's origin; direct clients may omit it. Property and development lookups use a selected, confirmed point rather than silently choosing the first address candidate. Those lookups use remote GIS services; `/api/ask` uses the bundled corpus and calls a model only when enabled by server configuration.

The Worker admits POST only at the four exact input paths below. Trailing-slash or encoded POST aliases, page POSTs and other methods return 405 before framework body parsing. Non-JSON input returns 400; `Next-Action` or `X-RSC-Action` headers return 404 because this application exposes no server actions. GET/HEAD navigation and normal React Server Component requests remain available. These checks live at the Worker boundary; use the built Worker when testing them, rather than Vinext's development server alone.

| Route | Input / purpose |
| --- | --- |
| `POST /api/ask` | Nonblank `question` string, at most 1,000 characters; optional `jurisdictionId`, `locale` (`en` or `es`, default `en`) and returned `conversation` object. Default area `tampa-bay` requires a clear area before applying local sources. |
| `POST /api/location` | Nonblank `address` string, at most 240 characters; returns address candidates |
| `POST /api/property` | Finite numeric `latitude`, `longitude` within the configured service bounds; optional `address` string is capped at 240 characters; returns property context |
| `POST /api/development` | Same point and optional `address` fields; optional numeric `radiusMeters`: 250, 500, 1,000 or 2,000 (default 1,000) |
| `GET /api/health` | HTTP-200 liveness with `ready`, status, version, generation, corpus counts/reasons and operations readiness; status `no_evidence` for an empty corpus |
| `GET /api/ready` | The same report as health; HTTP 200 only when both corpus and shared controls are ready, otherwise 503 |
| `GET /api/operations` | Worker endpoint for aggregate metrics and configured limits; requires the operator's monitoring bearer token, otherwise 404 |
| `GET /api/sources` | Source-registry JSON download |
| `GET /api/evaluation?artifact=summary` | Evaluation summary; the default when `artifact` is omitted |
| `GET /api/evaluation?artifact=responses` | Legacy benchmark response artifact |
| `GET /api/evaluation?artifact=agent` | Labeled agent-review artifact |
| `GET /api/evaluation?artifact=human` | Human-review packets and recorded review states |
| `GET /api/evaluation?artifact=suite` | Offline suite report; unavailable unless its mode is `offline` |

Unknown evaluation artifacts return 404. Downloads expose that build's bundled files, including empty/pending source-release placeholders. Invalid input, unsupported locales or malformed conversation objects return 400; upload deadlines return 408 with code `request_timeout`. Resident-input responses disable caching. Shared controls can additionally return 429 or 503; see [operations](OPERATIONS.md) for limits and monitoring.

Local mode reports `shared_controls_not_configured`, so a usable local corpus does not make `/api/ready` return 200. Public shared-mode probes report `authenticated_probe_required` without querying D1. An authorized `Authorization: Bearer <TAMPABAYBOT_MONITOR_TOKEN>` header enables the database readiness probe. `/api/operations` is handled by the Worker entry point and requires that runtime and database configuration; see [health and alerts](OPERATIONS.md#health-and-alerts).

Resource IDs are `tampa-bay`, `tampa`, `st-petersburg`, `clearwater`, `hillsborough-county`, `pinellas-county` and `pasco-county`; unsupported IDs return 400. Conflicting city selections/questions yield `needs_jurisdiction`, with `jurisdictionId`, `jurisdictionLabel` and `needsJurisdiction` for source selection, not property-boundary findings. Legacy Tampa benchmarks explicitly select `tampa`.

### Question follow-ups and language

Pass the previous answer's `conversation` object unchanged on a follow-up, or omit it/send `null` to start a new question. The server validates a versioned object containing only topic, housing need, registered source preference, jurisdiction, pending-jurisdiction flag and turn count. It retains no question history, address or answer text. Context expires after six inherited follow-ups; a recognized different program, new topic or different selected city/county resets the prior preference. `conversationUsed` reports whether context was used, and `query` preserves the submitted question.

`locale` controls supported answer and navigation wording, independently of question language. English and Spanish questions are supported; evidence quotations retain their literal source language, labeled `en`, `es` or `und` in each evidence item. API clients must not translate or edit quotation text while retaining its citation.

For example, from a page on the running app:

```js
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'What housing assistance is available?',
    jurisdictionId: 'tampa',
    locale: 'en',
  }),
});
const answer = await response.json();
if (!response.ok) throw new Error(answer.error);
// Include answer.conversation in the next request to continue this topic.
```

With an empty source release, a successful HTTP request still returns an uncertainty status rather than a cited benefit. Display the returned answer status, warnings and evidence; HTTP 200 alone does not mean the requested fact was verified. See [answer architecture](ARCHITECTURE.md) for required citations, effective-year selection and qualification preservation.

## Deployment and verification records

[Deployment](DEPLOYMENT.md) covers Worker artifacts, production smoke, Cloudflare hosting, secrets and rollback. Dated results and remaining work belong in [release readiness](RELEASE_READINESS.md) and the [changelog](../CHANGELOG.md).
