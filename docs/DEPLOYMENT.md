# Independent deployment

Deploy this application to **your own Cloudflare Workers account** using the pinned Wrangler toolchain. You do not need a Sites account, this project's hosted site, its project ID, D1, R2, or an LLM account. The default deployment uses the cited extractive answer engine with `LLM_PROVIDER=none`.

**Verification boundary:** the build, Wrangler upload dry-run, and local production HTTP path have been tested. Deployment to an independently authenticated Cloudflare account and smoke tests on its public URL remain unverified. The release environment had no configured independent Cloudflare credential or connected Cloudflare deployment capability; the maintainer's Sites deployment does not establish this verification.

The original Sites workflow remains available to its maintainer. When `.openai/hosting.json` is absent, local development and ordinary builds automatically use account-independent defaults. `build:standalone` always builds an isolated copy without that file or local environment files.

## Prepare a source release

Install Node.js 22.19 or newer, unpack the code-only alpha source archive, and run commands from its project directory:

```sh
npm ci
npm run dev
```

The distributable alpha starts with **no downloaded evidence**. Its health endpoint reports `no_evidence`, and housing questions return `unavailable_source` because the registry's sources have not been fetched (an empty registry instead produces `insufficient_evidence`). This is an intentional release-content restriction, not a successful answer benchmark. Follow the [distribution policy](DISTRIBUTION.md), review each source's terms and permitted use, and download source material directly as the operator:

```sh
npm run ingest
npm run evaluate
npm run eval:suite
```

Online ingestion depends on the publishers' current availability and may fail; inspect its errors and recorded source dates. Do not distribute downloaded snapshots merely because the software itself is MIT licensed. Existing research-checkout test reports describe their recorded corpus; they do not certify a newly downloaded or empty corpus.

## Build and verify without an account

Choose a Worker name for your own account. This example uses `parcelprivateer-independent-alpha`; replace it if that name already serves another application in your account.

```sh
npm run build:standalone -- --name parcelprivateer-independent-alpha --outdir work/standalone/independent-alpha
npm run test:standalone -- --directory work/standalone/independent-alpha
```

The build creates a fresh ignored fixture, compiles the app, and writes only compiled server modules, public client assets, a minimal Wrangler configuration, and an artifact manifest to the output. It excludes environment files, source maps, Sites metadata, operator account IDs, and tool state. Model calls and request logging are disabled in the generated configuration. Content from your current corpus is compiled into the Worker, so review its distribution terms before uploading it.

The test invokes **`wrangler deploy --dry-run`**, then starts unchanged copies of the artifact's modules, config and assets with **`wrangler dev --local`** on an ephemeral loopback port. Copying keeps Wrangler's temporary state outside your upload directory. It checks nine deployment concerns: artifact isolation, upload compilation, health, production HTML/security headers, a compiled browser asset, sources, the question API, sensitive-input rejection, and inaccessible environment/image routes. It stops its own process and writes `verification.json` beside `artifact.json`. No login, cloud upload, resident input, or model call occurs. Wrangler documents [dry-run deployment](https://developers.cloudflare.com/workers/wrangler/commands/workers/) separately from actual deployment.

An output directory is never overwritten. For a rebuild, omit `--outdir` to get a new timestamped directory, or supply another directory under `work/standalone/`. Preserve operator configuration changes separately and review them before applying them to a new artifact.

## Deploy with your own account

Log in interactively and verify the account Wrangler will use:

```sh
npx wrangler login
npx wrangler whoami
```

Review `work/standalone/independent-alpha/server/wrangler.json`. It has no account ID or custom-domain route. Set `account_id` to **your own** account ID if you have multiple accounts and want explicit selection.

The generated `workers_dev: true` configuration creates a publicly reachable application when deployed. It has no resident login, administrator UI, or application authentication layer. Wrangler login authorizes account management and deployment; it does not require visitors to authenticate. `preview_urls: false` disables version preview URLs, not the main Worker URL. If your testing instance needs restricted access, configure and verify an access policy on every exposed hostname before sharing it; Cloudflare documents [access controls for Worker production and preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#manage-access-to-preview-urls).

Deploy the reviewed artifact:

```sh
npx wrangler deploy --config work/standalone/independent-alpha/server/wrangler.json
```

Wrangler prints the URL and deployment version for your account. Open that URL and verify the home page, sources, evaluation page, `/api/health`, and a question against your ingested corpus. Confirm HTTPS, response security headers, and the displayed evidence dates. Record the version and URL in your own deployment record. The repository's local smoke report does **not** verify account permissions, a workers.dev subdomain, DNS, your plan's resource limits, or a real cloud deployment. [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) controls the account, Worker name, bindings, and deployment routes.

For CI, store a narrowly scoped Cloudflare API token and your account ID in the CI provider's secret store as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use the same reviewed artifact and explicit config path. Do not put either a token or an LLM key in Git, command-line arguments, client variables, or a source archive.

## Optional model provider

Local development can reach a local Ollama server; see [model configuration](LLM.md) and the [real Llama test results](OLLAMA_TESTING.md). A Cloudflare Worker cannot reach Ollama at `127.0.0.1` on your computer. A hosted model must have an endpoint reachable from the Worker and suitable authentication and usage limits.

For an operator-managed HTTPS provider, edit the generated config's `vars` with non-secret settings such as `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_TIMEOUT_MS`. After the first default deployment, enter a provider key through Wrangler's prompt:

```sh
npx wrangler secret put LLM_API_KEY --config work/standalone/independent-alpha/server/wrangler.json
npx wrangler deploy --config work/standalone/independent-alpha/server/wrangler.json
```

Cloudflare [secrets](https://developers.cloudflare.com/workers/configuration/secrets/) become server-side runtime bindings. Local `.env` files are deliberately absent from the artifact and do not configure its hosted provider. Run explicit live-provider evaluations and your hosted smoke checks after changing the provider; the default standalone smoke only certifies the original `none` configuration.

## Rollback and operational scope

Keep the prior artifact and the deployment version reported by Wrangler. Inspect and roll back versions with your own account:

```sh
npx wrangler deployments list --config work/standalone/independent-alpha/server/wrangler.json
npx wrangler rollback <previous-version-id> --config work/standalone/independent-alpha/server/wrangler.json
```

Before promoting a hosted alpha for resident use, establish source refresh ownership, monitoring and retention rules, a security contact, shared rate limits, model concurrency and cost limits, and manual accessibility and answer review. The code-only source release does not claim those operational controls are implemented.

The [known Windows Miniflare upload transport failure](BUG_FIX_FOLLOWUP_2026-09-12.md) remains open: rejecting an unread oversized upload can break a subsequent pooled request. The standalone smoke uses complete bounded inputs and is not the full production browser suite. Hosted/Linux impact remains unverified.

## Recorded verification

On September 12, 2026, Node.js 24.13.1 and pinned Wrangler 4.131.1 built the standalone artifact without Sites metadata or environment files. All nine checks passed against the populated engineering corpus (13 registered source groups, 257 chunks), including an accepted extractive housing answer. A separately packaged code-only source tree also passed TypeScript checking, compilation, and all nine checks with 13 unfetched registry entries and zero chunks: health reported `no_evidence`, and its housing answer reported `unavailable_source`. Both artifacts were dry-run packaged and served through local production Workerd. No external account deployment was performed.
