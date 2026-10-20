# Independent deployment

The separate [Cloudflare Pages preview](https://tampabaybot-housing-preview.pages.dev/) was verified on October 9, 2026 with a private source-only backend, no model, and an empty reviewed corpus. The live housing directory, API binding, synthetic eviction guide, address lookup, partial property layers, and dated development response were checked. This guide below describes a different standalone Worker deployment path; its own public URL and full cited-answer behavior have not been verified. See [the Pages deployment record](../CLOUDFLARE_DEPLOYMENT.md) for the current preview.

Build a Worker artifact locally without a Sites account, database or model account. The generated configuration uses `LLM_PROVIDER=none` and local operations mode. **A public question or property API requires shared D1 controls even when model assistance is off.** Without them, non-loopback `/api/*` requests return a safe 503. The separate static Pages housing directory remains usable without that backend.

The independent build, Wrangler upload dry-run and local production HTTP path have been tested. Deployment to an independently authenticated Cloudflare account and smoke tests on its public URL remain unverified. [Release readiness](RELEASE_READINESS.md) records the dated results and remaining work.

## Prepare the checkout

Follow the [development setup](DEVELOPMENT.md#local-setup) and install from the lockfile. Node.js 24 is the recorded toolchain; the declared minimum is 22.19.

The source-only alpha runs with no downloaded evidence. Its health endpoint reports `no_evidence`; questions about unfetched sources report `unavailable_source`. Follow [source acquisition and distribution](DISTRIBUTION.md) to fetch, review and evaluate the corpus you intend to serve. Content in that corpus is compiled into the Worker, so its publication terms apply to the upload as well as to source archives.

## Build and verify locally

Choose a Worker name for your own account. Replace the example if that name already serves another application:

```sh
npm run build:standalone -- --name tampabaybot-independent-alpha --outdir work/standalone/independent-alpha
npm run test:standalone -- --directory work/standalone/independent-alpha
```

The builder compiles an isolated source copy and writes compiled server modules, public client assets, a minimal Wrangler config and an artifact manifest. It excludes local environment files, source maps, Sites metadata, operator account IDs and tool state. Model calls and Worker observability are disabled in the generated configuration; Cloudflare platform logs and access records are a separate deployment setting.

The verifier runs `wrangler deploy --dry-run`, then serves unchanged copies of the artifact with `wrangler dev --local` on a loopback port. It checks artifact isolation, production responses/security headers, browser assets and bounded API behavior, then stops its process and writes `verification.json` beside `artifact.json`. Copying keeps Wrangler's temporary state outside the upload directory. No login, cloud upload or real-model call occurs. See Wrangler's [dry-run documentation](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

Existing outputs are never overwritten. For a rebuild, omit `--outdir` to get a timestamped directory, or choose another directory under `work/standalone/`. Preserve operator config changes separately and review them when applying them to a new artifact.

## Deploy with your own account

Log in and confirm the account Wrangler will use:

```sh
npx wrangler login
npx wrangler whoami
```

Review `work/standalone/independent-alpha/server/wrangler.json`. It has no account ID or custom-domain route. Set `account_id` to your own account ID if you have multiple accounts and want explicit selection.

The generated `workers_dev: true` makes the main application publicly reachable after deployment. The app has no resident login or administrator UI. Wrangler login authorizes deployment administration; it does not authenticate visitors. `preview_urls: false` disables version preview URLs, not the main Worker URL. The generated local-mode config allows loopback development only: all public `/api/*` routes, including health and readiness, refuse service until shared D1 is configured. Restrict access on every exposed hostname while setting up and testing; see [Cloudflare Access for Worker URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#manage-access-to-preview-urls).

## Configure shared controls before public API use

Create a D1 database in your account and apply the idempotent operations schema:

```sh
npx wrangler d1 create tampabaybot-independent-ops
npx wrangler d1 execute tampabaybot-independent-ops --remote --file drizzle/0000_operations.sql
```

In the ignored deployment copy of `server/wrangler.json`, add a `DB` D1 binding with the returned database UUID and set `TAMPABAYBOT_OPERATIONS_MODE` to `shared` under `vars`; keep `LLM_PROVIDER=none` unless separately reviewed. The relevant JSON fields are:

```json
{
  "d1_databases": [{ "binding": "DB", "database_name": "tampabaybot-independent-ops", "database_id": "UUID_FROM_CREATE" }],
  "vars": { "LLM_PROVIDER": "none", "TAMPABAYBOT_OPERATIONS_MODE": "shared" }
}
```

Merge these fields into the existing config rather than replacing its `main`, assets and other settings. Review [operations](OPERATIONS.md#deployment-configuration) for request budgets and a minimum 32-character `TAMPABAYBOT_LIMIT_SECRET`. Keep that secret and the separate monitor token in Worker secrets, never in `vars`, public build variables, or source. Re-run `npx wrangler deploy --dry-run --config work/standalone/independent-alpha/server/wrangler.json` after editing the deployment config. The original standalone verification receipt covers its original local config, not the edited hosted configuration.

Deploy the reviewed artifact:

```sh
npx wrangler deploy --config work/standalone/independent-alpha/server/wrangler.json
npx wrangler secret put TAMPABAYBOT_LIMIT_SECRET --config work/standalone/independent-alpha/server/wrangler.json
npx wrangler secret put TAMPABAYBOT_MONITOR_TOKEN --config work/standalone/independent-alpha/server/wrangler.json
```

Each secret command prompts for a distinct, random value of at least 32 characters and can deploy a new Worker version. The API may return 503 between the first deploy and successful secret configuration; keep access restricted and do not announce the service until shared controls pass a hosted smoke. Wrangler prints the URL and deployment version. Verify the deployed home, source, evaluation and about pages; authenticated health/readiness and aggregate metrics; a cited question if the corpus has reviewed evidence, or an honest unavailable-source answer if it is empty; address selection, property context and development lookups; rate-limit responses and failure states. Confirm HTTPS, response security headers, source dates and outbound access. Record the observed version and results. Local smoke does not verify cloud account permissions, DNS, plan limits or hosted behavior.

For CI, keep a narrowly scoped API token and account ID in the CI secret store as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use the same reviewed artifact and explicit config path. See [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) for account, name, binding and route settings.

## Optional model provider

[LLM.md](LLM.md) is canonical for provider settings, localhost/LAN/hosted connectivity, model data flow and evaluation. A hosted Worker needs a reachable HTTP provider or a Workers AI binding; its localhost cannot reach Ollama on a resident's PC. Shared D1 controls are required for the public API regardless of provider choice. Before enabling a model, review visitor/global/model-concurrency limits in the [Pages and Workers AI demo guide](../CLOUDFLARE_DEPLOYMENT.md). The generated standalone config refuses inference by default. The explicit loopback-only development opt-in has no shared AI budget and is unsuitable for a public deployment. See [AI usage limits](AI_USAGE_LIMITS.md) and [cost controls](CLOUDFLARE_COST_CONTROLS.md).

To enable a provider, set its non-secret `LLM_*` values in the generated config's `vars`. After the first default deployment, enter any required key through the prompt and deploy the reviewed config:

```sh
npx wrangler secret put LLM_API_KEY --config work/standalone/independent-alpha/server/wrangler.json
npx wrangler deploy --config work/standalone/independent-alpha/server/wrangler.json
```

Cloudflare [secrets](https://developers.cloudflare.com/workers/configuration/secrets/) become server-side runtime bindings. Local `.env` files do not configure the hosted artifact. Run explicit live-provider evaluations and hosted smoke after changing providers; the standalone verifier expects its original `none` configuration.

## Rollback and operation

Keep the prior artifact and deployment version. Inspect and roll back versions using your account:

```sh
npx wrangler deployments list --config work/standalone/independent-alpha/server/wrangler.json
npx wrangler rollback <previous-version-id> --config work/standalone/independent-alpha/server/wrangler.json
```

[Operations](OPERATIONS.md) covers access controls, request limits, monitoring, retention and incident response. [Release readiness](RELEASE_READINESS.md) records source-refresh responsibilities, manual reviews and remaining launch checks.

Historical Windows and Linux local production runs reproduced a rejected-upload transport failure; hosted impact remains unverified. The later split application harness and source-demo checks have separate verification scopes. The standalone smoke uses complete bounded inputs and does not replace the full browser suite. See the [investigation](HISTORY.md#runtime-investigation) for evidence and the [accessibility guide](ACCESSIBILITY.md) for browser-test commands.
