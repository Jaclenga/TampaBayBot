# Independent deployment

Build a Worker artifact and deploy it through your own Cloudflare account. A Sites account, database and model account are not required. The generated configuration uses `LLM_PROVIDER=none`.

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

The builder compiles an isolated source copy and writes compiled server modules, public client assets, a minimal Wrangler config and an artifact manifest. It excludes local environment files, source maps, Sites metadata, operator account IDs and tool state. Model calls and request logging are disabled in the generated configuration.

The verifier runs `wrangler deploy --dry-run`, then serves unchanged copies of the artifact with `wrangler dev --local` on a loopback port. It checks artifact isolation, production responses/security headers, browser assets and bounded API behavior, then stops its process and writes `verification.json` beside `artifact.json`. Copying keeps Wrangler's temporary state outside the upload directory. No login, cloud upload or real-model call occurs. See Wrangler's [dry-run documentation](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

Existing outputs are never overwritten. For a rebuild, omit `--outdir` to get a timestamped directory, or choose another directory under `work/standalone/`. Preserve operator config changes separately and review them when applying them to a new artifact.

## Deploy with your own account

Log in and confirm the account Wrangler will use:

```sh
npx wrangler login
npx wrangler whoami
```

Review `work/standalone/independent-alpha/server/wrangler.json`. It has no account ID or custom-domain route. Set `account_id` to your own account ID if you have multiple accounts and want explicit selection.

The generated `workers_dev: true` makes the main application publicly reachable after deployment. The app has no resident login or administrator UI. Wrangler login authorizes deployment administration; it does not authenticate visitors. `preview_urls: false` disables version preview URLs, not the main Worker URL. For restricted testing, configure and verify access on every exposed hostname; see [Cloudflare Access for Worker URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#manage-access-to-preview-urls).

Deploy the reviewed artifact:

```sh
npx wrangler deploy --config work/standalone/independent-alpha/server/wrangler.json
```

Wrangler prints the URL and deployment version. Verify the deployed home, source, evaluation and about pages; health and artifact downloads; a cited question; address selection, property context and development lookups; and failure states. Confirm HTTPS, response security headers, source dates and outbound access. Record the observed version and results. Local smoke does not verify cloud account permissions, DNS, plan limits or hosted behavior.

For CI, keep a narrowly scoped API token and account ID in the CI secret store as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use the same reviewed artifact and explicit config path. See [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) for account, name, binding and route settings.

## Optional model provider

[LLM.md](LLM.md) is canonical for provider settings, localhost/LAN/hosted connectivity, model data flow and evaluation. A hosted Worker needs a reachable provider; its localhost cannot reach Ollama on a resident's PC.

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

[SECURITY.md](../SECURITY.md) owns access, rate/concurrency limits, monitoring and retention boundaries. [Release readiness](RELEASE_READINESS.md) owns source-refresh responsibilities, manual reviews and remaining launch checks.

The rejected-upload transport failure remains reproducible in Windows and Linux local production runs; hosted impact is unverified. The standalone smoke uses complete bounded inputs and does not replace the full browser suite. See the [investigation](BUG_FIX_FOLLOWUP_2026-09-12.md) for evidence and the [accessibility guide](ACCESSIBILITY.md) for browser-test commands.

## Maintainer's Sites workflow

The private Sites preview belongs to the maintainer and is not a public demo or a prerequisite for contributors. Its access gate and publication record do not verify an independent Cloudflare deployment.

The maintainer checkout retains `.openai/hosting.json` and the Sites build workflow. Without it, builds use account-independent defaults; `build:standalone` always excludes Sites identity. September 13 authenticated Sites checks passed the home page, health, factual question, temporary follow-up and Spanish routes while anonymous access remained blocked. They did not test the interrupted-upload edge case or establish independent Cloudflare deployment. Shared D1 controls, runtime configuration, protected monitoring and the rollback runbook are in [operations](OPERATIONS.md).
