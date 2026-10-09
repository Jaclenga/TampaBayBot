# Cloudflare Pages and Workers AI demo

This guide prepares a public TampaBayBot demo with a static React frontend on Cloudflare Pages and the existing vinext application in a backend Worker. A Pages Function forwards only selected `/api/*` routes to that Worker through a `BACKEND` service binding. The current source-only backend uses D1 for shared traffic controls and `LLM_PROVIDER=none`; it has no Workers AI binding or public `workers.dev` route. A later, reviewed cited-answer deployment may add a Workers AI binding named `AI`. The browser never receives a model credential or D1 connection. [Cloudflare documents Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/) and [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/).

**Current deployment status (October 9, 2026):** The restored simple Pages interface and source-only backend are live at [tampabaybot-housing-preview.pages.dev](https://tampabaybot-housing-preview.pages.dev/). The Worker has no AI binding and the active corpus has zero downloaded evidence chunks (`data/chunks.json` is `[]`), so cited housing, zoning and permitting answers remain unavailable. The static housing directory and deterministic crisis guide work independently. The live address lookup returned a candidate; parcel lookup was partial because two upstream zoning layers were unavailable; development records returned with a snapshot-age warning. Source acquisition, human approval, and a separate reviewed backend deployment are required for cited answers. See [release readiness](docs/RELEASE_READINESS.md) and [distribution terms](docs/DISTRIBUTION.md).

## What runs where

| Component | Code and route | Purpose |
| --- | --- | --- |
| Pages static frontend | `pages-demo/`, built to `pages-demo/dist` | Responsive chat, citations and GIS results, plus a static housing-crisis directory available when the API and AI are offline. |
| Pages Function | `functions/api/[[path]].js` at the **repository root** | Accepts only the listed same-origin API paths and forwards them through `BACKEND`. It returns a clear 503 until the service binding exists. |
| Backend Worker | The existing vinext Worker built by `npm run build:standalone` | Runs retrieval, validated citation selection, address/property/development logic and shared D1 controls. |
| Workers AI | `AI` on the backend only | `@cf/meta/llama-3.1-8b-instruct-fp8` writes a cited answer made only of complete supplied government-source quotes. The application checks the full answer, IDs and quotations against retrieved evidence. If validation or inference fails, it retains the extractive answer. |
| D1 | `DB` on the backend only | Atomically shares per-visitor and global AI budgets, model concurrency leases, other request controls and aggregate metrics across Worker instances; stores no resident questions or raw IP addresses. |

The existing local `npm run demo` workflow remains available and uses fictional evidence without a Cloudflare account. The cloud deployment does not replace the existing source review, retrieval, GIS or citation code. A model cannot create an authoritative citation absent from the reviewed corpus. Live civic GIS services can be unavailable or incomplete; the UI and backend report those states. The static housing directory is separate from the reviewed RAG corpus and needs its own source review. The demo is independent and does not provide legal advice or official property decisions. See [housing help without AI](docs/AI_FALLBACK.md).

## 1. Install and validate locally

Use Node.js 24, npm and a clean checkout. The project declares Node `>=22.19.0`; Cloudflare Pages' current default build image lists Node 22.16.0, so set `NODE_VERSION=24` in the Pages project's **build environment** later. See [Pages build image configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

```sh
npm ci
npm run check
npm run test:pages
npm run build:pages
```

These commands build and test the code; they do not acquire source evidence, call a real model or prove hosted behavior. `npm run build:pages` uses `pages-demo/vite.config.mjs` and leaves static files in `pages-demo/dist`. The Pages project root must remain the **repository root** so Cloudflare finds `/functions` outside the static output; [Pages Functions use root-level file routing](https://developers.cloudflare.com/pages/functions/get-started/). `pages-demo/public/_routes.json` limits Function invocations to `/api/*`, preserving [free static asset requests](https://developers.cloudflare.com/pages/functions/routing/).

### Directory-only preview while source review is pending

Set `VITE_DIRECTORY_ONLY=true` at build time to publish a clearly labeled housing directory preview. It includes the static crisis guide and resource directory, and removes chat, example questions, property/GIS controls, and client API calls. This is **not** the full cited-answer and GIS deployment described below. Build and run its browser test with every API route deliberately disabled:

```powershell
$env:VITE_DIRECTORY_ONLY='true'
npm run build:pages
npx playwright test --config pages-demo/playwright.preview.config.mjs
Remove-Item Env:VITE_DIRECTORY_ONLY
```

On POSIX shells, use `VITE_DIRECTORY_ONLY=true npm run build:pages` followed by the same Playwright command. Rebuild with plain `npm run build:pages` for the full frontend after the reviewed backend is ready. The preview test checks that all four housing-crisis categories remain browsable and no `/api/*` request occurs. A local test does not verify the hosted Pages URL.

After uploading the preview, run the same test against its Pages URL by setting `PAGES_LIVE_URL` (for example, `$env:PAGES_LIVE_URL='https://PREVIEW_PROJECT.pages.dev'` in PowerShell) and then running `npx playwright test --config pages-demo/playwright.preview.config.mjs`. This skips the local test server and checks the hosted page's title, description, resource filters, and absence of API calls.

If this preview is uploaded to Pages through Wrangler Direct Upload, use a **separate preview project** from the eventual Git-connected full site. Cloudflare states that a [Direct Upload project cannot later switch to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/); automatic Git deployments require a new Pages project. Do not announce a directory-only preview as a working AI or GIS demo.

Deployment record (October 9, 2026): the initial directory-only build was superseded by the full simplified frontend in the same Direct Upload Pages project. The live Pages Function has a `BACKEND` service binding to the private `tampabaybot-limited-api` Worker. Build with plain `npm run build:pages`, then stage only `pages-demo/dist`, the root `functions` directory, and a reviewed Pages Wrangler configuration with `pages_build_output_dir` and the `BACKEND` service binding; deploy that staging directory with `wrangler pages deploy dist --project-name tampabaybot-housing-preview --branch main`. Keep the root vinext-generated `.wrangler/deploy/config.json` out of this Pages deployment command because it conflicts with the Pages config, and restore it after the command. The static `404.html` returns a real 404 for unknown and private-file paths, and `_headers` sets a Content Security Policy, no-referrer policy, MIME sniffing protection, frame denial, and a restrictive Permissions Policy. The hosted desktop/mobile browser check passed for the restored blue header, search form, four housing categories, official links, no horizontal overflow and zero API calls while filtering. Hosted `/api/health`, `/api/usage`, a synthetic eviction question, address selection, property and development routes were also checked. The Pages project is not Git-connected; pushing GitHub code does not update this site.

## 2. Acquire and review source evidence

The checkout's registry describes potential publishers but has no captured passages. Run the established [source update workflow](docs/SOURCE_UPDATES.md) in an operator checkout. Choose a new ignored candidate directory each time:

```sh
npm run source:stage -- --output work/source-refresh/review-001
npm run source:review -- --candidate work/source-refresh/review-001 --local-diff
```

Inspect the report, complete candidate corpus, original snapshots, dates, jurisdiction, publisher terms, missing sources and changed annotations against the publishers. A scheduled source report or successful download is not approval. After a human reviewer accepts the **exact** candidate digest printed by `source:review`, apply it:

```sh
npm run source:apply -- --candidate work/source-refresh/review-001 --approve SHA256_FROM_REVIEW --reviewer "Reviewer name" --worker-name tampabaybot-demo-api
```

This validates provenance and regressions, builds and tests a standalone artifact, and publishes the reviewed corpus locally. It does **not** deploy to Cloudflare. Record the approved digest and active corpus generation from its `application.json` receipt. Do not commit downloaded snapshots, corpus excerpts, local review files or generated deployment artifacts merely to make Pages Git builds succeed. A public source checkout still starts without evidence; the backend must be built separately from this reviewed operator checkout. Keep source distribution and publisher permissions in view before any public upload.

## 3. Build the reviewed backend and prepare its private configuration

The source apply command builds inside its isolated candidate directory. Build a fresh root-level artifact from the now active reviewed corpus for the demo preparation command. Choose a **new** path under `work/standalone/`; existing outputs are not overwritten:

```sh
npm run build:standalone -- --name tampabaybot-demo-api --outdir work/standalone/tampabaybot-demo-api-reviewed-001
npm run test:standalone -- --directory work/standalone/tampabaybot-demo-api-reviewed-001
```

Check that `verification.json` reports `passed` and a positive `corpus.chunks` count, and that the corpus generation matches the reviewed `application.json` receipt. The standalone verifier runs a Wrangler upload dry-run and local HTTP checks without deploying. Its original config deliberately uses `LLM_PROVIDER=none`.

Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up), stay on Workers Free, then authenticate Wrangler and create one D1 database. [Wrangler's D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/) print the new database UUID:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create tampabaybot-demo-ops
```

Record the UUID privately in the operator's deployment notes. Initialize the shared-control schema from the included idempotent SQL file:

```sh
npx wrangler d1 execute tampabaybot-demo-ops --remote --file drizzle/0000_operations.sql
```

Now prepare a **new ignored copy** of the verified Worker. Replace `D1_UUID_FROM_CREATE` with the actual UUID:

```sh
npm run prepare:cloudflare-demo -- --artifact work/standalone/tampabaybot-demo-api-reviewed-001 --candidate work/source-refresh/review-001 --database-id D1_UUID_FROM_CREATE --database-name tampabaybot-demo-ops --name tampabaybot-demo-api
```

The command checks the standalone verification hash, the applied source-review receipt, its unchanged candidate snapshot, and the matching corpus generation. It refuses zero evidence chunks. It prints a unique `work/cloudflare-demo/...` output path. Inspect its `deployment.json` and `server/wrangler.json`: the config should bind `AI`, bind the named D1 database as `DB`, set `LLM_PROVIDER=workers-ai`, choose the requested model, enable shared controls, and set `workers_dev:false` and `preview_urls:false`. It caps default model attempts at 15 per visitor and 100 globally per UTC day, two simultaneous model attempts, resident API requests at 1,000/day, and per-client API requests at 12/minute. Review [AI usage accounting](docs/AI_USAGE_LIMITS.md) and [cost controls](docs/CLOUDFLARE_COST_CONTROLS.md) before changing limits. The model appears in [Cloudflare's current model catalog](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/). In the commands below, replace `PREPARED_CONFIG_PATH` with the full `server/wrangler.json` path printed by the preparation command.

Run a dry-run on the prepared copy:

```sh
npx wrangler deploy --dry-run --config PREPARED_CONFIG_PATH
```

Only after the reviewed evidence and config are approved, deploy the backend Worker:

```sh
npx wrangler deploy --config PREPARED_CONFIG_PATH
```

Configure separate, random, **at least 32-character** server-side secrets. `wrangler secret put` prompts for values; do not paste them into source, `vars`, Pages build variables or terminal command arguments. Cloudflare notes that [adding a Worker secret deploys a new Worker version](https://developers.cloudflare.com/workers/configuration/secrets/). The backend fails closed on resident APIs until shared controls and `TAMPABAYBOT_LIMIT_SECRET` are available.

```sh
npx wrangler secret put TAMPABAYBOT_LIMIT_SECRET --config PREPARED_CONFIG_PATH
npx wrangler secret put TAMPABAYBOT_MONITOR_TOKEN --config PREPARED_CONFIG_PATH
```

Workers AI uses the account binding, so this deployment needs **no browser API key and no separate model bearer token**. The prepared backend has no public route. Do not add `workers.dev`, a custom domain or a preview URL to expose it casually. [Cloudflare's service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/) allows the Pages Function to call it without a public backend hostname.

## 4. Connect GitHub to Pages

Push the reviewed **code** changes to `https://github.com/Jaclenga/TampaBayBot` through the normal repository workflow. In Cloudflare **Workers & Pages → Create application → Pages → Import an existing Git repository**, authorize the Cloudflare GitHub app for the repository and select the production branch. [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) builds on future pushes and creates a `*.pages.dev` URL. Set:

| Pages setting | Value |
| --- | --- |
| Root directory | Repository root (leave blank/default) |
| Framework preset | None or custom |
| Build command | `npm run build:pages` |
| Build output directory | `pages-demo/dist` |
| Build environment variable | `NODE_VERSION=24` |

The frontend's Pages build must not install or embed the ignored reviewed corpus; that corpus lives only in the separately reviewed backend artifact. After the first Pages deployment, go to **Pages project → Settings → Bindings → Add → Service binding** and bind variable **`BACKEND`** to Worker **`tampabaybot-demo-api`**, then redeploy Pages. Configure production first; preview deployments need their own reviewed binding decision and consume account quotas. Cloudflare documents [Pages service binding setup and local development](https://developers.cloudflare.com/pages/functions/bindings/). The Pages proxy admits only its listed API methods and same-origin browser requests; it does not accept a client-selected model or upstream URL.

GitHub pushes now rebuild the Pages frontend automatically. **Backend evidence and model changes do not automatically deploy from GitHub:** reacquire and review a source candidate, run the local gates, prepare a new backend artifact, and deploy that artifact deliberately. Keep the prior backend deployment version for rollback. Pages Git settings can restrict preview branches if their builds or public previews are unnecessary; [Pages Free includes 500 builds/month](https://developers.cloudflare.com/pages/platform/limits/).

## 5. Test the actual Pages URL

Do not announce the URL until the Pages binding and backend are both deployed. At `https://<project>.pages.dev`:

1. Load the static interface on desktop and mobile, and confirm the GitHub and disclaimer links.
2. Check `/api/health` for the expected reviewed corpus generation and source/chunk counts. Public liveness can say `ready:false` because its shared-database probe requires the monitor bearer token; use authenticated `/api/ready` for a full readiness check.
3. Ask a Tampa housing question and a zoning or permitting guidance question. Confirm the answer status, quoted evidence, retrieval dates, clickable official URLs and uncertainty where evidence is missing. Inspect the API's `generation` field: `status:"used"` means Workers AI wrote the displayed quote-only answer and it passed citation validation; `fallback` means the extractive answer was used. A cited answer alone does not prove the model ran.
4. Enter a civic street address, choose the returned candidate, and inspect parcel/zoning, future land use and nearby development. Check service coverage, record dates, agency links, timeout/error states and any unavailable layer; do not infer that a missing record means no permit or project exists.
5. Check `/api/usage` for an application allowance, ask one eligible cited question, and confirm the remaining count decreases by one. Confirm a 429 with a structured code and `Retry-After` at a deliberately low test limit, including two simultaneous requests. From two separate client networks, verify independent visitor counts and that the 12-requests-per-minute client limit applies separately; the backend keys these limits from trusted `CF-Connecting-IP`, so a missing header through the Pages service binding could group visitors together. Restore production limits after the test.
6. Turn off the Worker `AI` binding in a separate test configuration or use a dedicated provider-disabled preview, then load the Pages home screen and open **Find Housing Help Without AI**. Complete the optional **I Need Housing Help** guide for an eviction summons and a no-safe-place-tonight case. Confirm official eviction, homelessness, legal-aid and emergency resources; county filtering; copy/print/save controls; and zero inference calls. The directory and plan must still load if the backend service binding is unavailable. Restore the reviewed backend and repeat an ordinary chat check. Review the [crisis evaluation and external checks](docs/HOUSING_CRISIS_EVALUATION.md) before describing the service as ready for residents.
7. Confirm unknown API routes and wrong methods fail. Check Cloudflare Pages Functions, backend Worker CPU time and errors, Workers AI neurons, and D1 row metrics in the dashboard. The [Workers Free CPU limit](https://developers.cloudflare.com/workers/platform/limits/) is 10 ms per request; verify representative cold and warm cited questions and GIS requests do not hit resource-limit error 1102 before announcing the URL.

Cloudflare's [Workers AI binding in local development](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/) still calls the account and consumes neurons. Use mocked tests for routine development and keep real-model smoke small. Follow [production operations](docs/OPERATIONS.md) for the protected metrics and GitHub monitor workflow: set its URL to the Pages origin, provide its monitor token as a repository secret, and enable it only after the deployed Pages routes and alert notification delivery have been checked. A failed hosted check is a release blocker, not evidence that Cloudflare is working.

## Updates and rollback

Frontend code pushes use Pages Git deployment history. For a backend code or evidence change, repeat the review, standalone verification, preparation, secrets/binding inspection and public smoke steps above. Recheck source permissions and freshness. Roll back a code regression to the prior Cloudflare Worker version using [Wrangler deployment and rollback commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/); restore evidence through [source rollback](docs/SOURCE_UPDATES.md#consistent-publication-recovery-and-rollback) and redeploy the matching tested artifact. Do not treat a successful local build, dry-run or upload as proof of a working public service.
