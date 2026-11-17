# Reviewing and applying source updates

Manual source updates follow four separate steps: acquire into an ignored candidate, inspect the changes, approve that exact candidate, then build and apply it. Acquisition alone never replaces active evidence. The optional policy-based automatic path below performs its own qualification and validation before application. `npm run ingest` performs acquisition; existing `--source=<id>`, `--offline` and `--check` options remain available.

## Automatic routine refreshes

`npm run source:auto` downloads sources and writes an automatic eligibility report
without applying or deploying anything. `npm run source:auto -- --apply --worker-name
YOUR_WORKER` validates, builds and applies the eligible subset. Add `--deploy` to
publish that verified build through the existing `TAMPABAYBOT_SOURCE_DEPLOY_ARGV`
executable/argument array. An explicit Worker name is mandatory for application;
there is no inferred production target. `--category housing` limits acquisition.

The policy lives in `data/automatic-refresh-policy.json`. Unchanged official
sources on its exact HTTPS origin allowlist qualify only when normalized text,
derived facts, citations and locators agree with the active baseline. A new fetch
advances acquisition timestamps, never the substantive review date. A raw HTML
change outside extracted content can qualify; changed facts or extraction
annotations cannot silently pass as unchanged.

Changed or first-time content requires an explicit source ID and exact canonical
URL rule. The initial policy permits bounded updates to Tampa's development
contact directory only, with size/change limits and a safety-sensitive-language
check. It does **not** authorize unattended changes to housing eligibility,
funding, eviction deadlines, legal requirements or permit fees. These checks are
conservative screening, not a guarantee that arbitrary prose is low risk. Expand
the content allowlist only for specifically understood sources. Sources with
known conflicts, changed acquisition configuration, unexpected response URLs,
unapproved origins, failed acquisition, or assistant-directed instructions need
review. Registry edits block automatic publication to preserve operator changes.

Eligible sources can publish while rejected sources retain their previous dated
evidence and uncertainty. Rejected payload bytes do not enter the automatic
candidate. Failed fetches never advance retrieval dates. A source-only checkout
has no evidence baseline; most initial acquisitions will therefore require the
existing review/apply workflow. The separate curated housing resource directory
is not overwritten or marked verified by a document refresh.

Application reproduces citations from snapshots, runs the source tests, offline
reliability evaluation and typecheck, and builds/smoke-tests the standalone
artifact. Failures before application leave the active generation untouched.
Existing immutable snapshots, generation archives and rollback commands remain
available. A failed deployment leaves a pending receipt: the next automatic run
retries the same verified artifact **before** downloading a newer candidate.
It does not claim that a failed or timed-out deployment left the hosted site
unchanged; inspect the provider when the deployment outcome is uncertain.

### One-time scheduling setup

`.github/workflows/source-auto-refresh.yml` runs daily at 10:43 UTC on a
GitHub-hosted Ubuntu runner. No always-on computer or self-hosted runner is needed.
Manual default-branch dispatches can perform the first validated publication while
the daily enable flag is still false. Enable the schedule after that run passes.
It only runs trusted default-branch code. Downloaded source text, generation
archives and the latest verified artifact travel between fresh runners in an
AES-256-GCM encrypted `source-state.enc` file stored in a separate private GitHub
repository. A deploy key grants the runner access only to that state repository. The encryption authenticates the
repository and Worker identity as well as the content. Only encrypted state and a small checkpoint metadata file are committed to the
private vault. Nothing is uploaded to public release assets or Actions artifacts.
Plaintext corpus files, raw snapshots, logs and credentials are excluded.

Publication is split into three stages: `source:auto --apply --prepare-deploy`,
persist an encrypted pre-deployment checkpoint, then `source:auto
--resume-deployment`. The upload step must succeed before deployment begins.
Final state is encrypted again after success or failure. If a runner disappears
mid-deployment, the next run retries the identical checkpointed artifact. It
never acquires a newer candidate over a pending deployment.

Configure these repository Actions variables:

- `TAMPABAYBOT_AUTO_REFRESH_ENABLED`: `true` once setup and a reviewed seed are ready.
- `TAMPABAYBOT_AUTO_REFRESH_WORKER`: the explicit target Worker name.
- `TAMPABAYBOT_SOURCE_DEPLOY_ARGV`: a trusted JSON executable/argument array using
  `{config}`, `{artifact}` or `{generation}` as needed. The deployment adapter
  must preserve the selected Worker's operational bindings, variables, secrets
  and routing. Do not deploy the bare standalone config over a production Worker
  that uses AI, D1 or shared security controls. Use executable paths valid on the
  GitHub-hosted runner, rather than paths from the development computer.
- `TAMPABAYBOT_SOURCE_STATE_REPOSITORY`: the separate private `OWNER/REPO` holding
  encrypted `source-state.enc` and checkpoint metadata. It must have a `main` branch.

The included `scripts/deploy-preserving-worker.mjs` adapter supports existing
Workers with AI, D1, plain-text variables and secrets. It reads live configuration,
requires exact existing D1 IDs, retains endpoint exposure and dashboard-managed
routes, keeps secrets without retrieving their values, and runs a deploy dry run.
Unsupported binding types, runtime changes or concurrent configuration changes
stop publication. For this adapter the argument array is
`["node","{project}/scripts/deploy-preserving-worker.mjs","--artifact","{artifact}","--worker","YOUR_WORKER"]`.
`{project}` is resolved on the runner, so no machine-specific path is stored.
`--dry-run` on this adapter performs validation without a live deployment.

Configure Actions secrets `TAMPABAYBOT_SOURCE_STATE_KEY` (32 cryptographically
random bytes encoded as 64 hexadecimal characters),
`TAMPABAYBOT_SOURCE_STATE_SSH_KEY` (a write-enabled deploy key for the private
state repository only), `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`. Keep the provider token limited to the intended account
and deployment operations. Never put credentials in the deployment argument array
or repository files. Keep a private backup of the state key; rotating it requires
re-encrypting the baseline. The workflow refuses to run if any required setting
is missing. Local Wrangler OAuth credentials are not copied into CI.

For initial setup, seed from the already reviewed corpus currently serving the
selected Worker, not from a source-only checkout. Verify its generation and raw
provenance, then run `node scripts/automatic-source-state.mjs save --output
work/source-state/source-state.enc` with `SOURCE_STATE_KEY`, `GITHUB_REPOSITORY`
and `SOURCE_WORKER` in the environment. Keep the plaintext and the key private.
Commit only encrypted `source-state.enc` and a small `state.json` metadata file to
the separate private state repository. The repository deploy key must allow writes;
store the private key in the public application's protected Actions secrets and
register only its public key with the private repository. Host keys are retrieved
through GitHub's HTTPS metadata endpoint and StrictHostKeyChecking remains enabled.
A public vault is explicitly rejected before checkout and before every write.

Normal runs clone the private vault, authenticate and restore the ciphertext, then
push a new checkpoint before deploying. A final encrypted commit records success
or a pending retry. If a runner stops mid-deployment, the pre-deployment checkpoint
is already durable in the private repository. Missing, tampered or undecryptable
state fails closed; an empty baseline is never substituted for production.

Keep a private backup of the state key and encrypted state for disaster recovery.
The vault retains commit history; monitor its storage and define a backup/retention
policy as it grows. Archives have bounded file counts and sizes; hitting the bound
stops publication until retention is reviewed. Avoid force-pushing the vault or
editing checkpoints while an automatic run is active.
The original metadata-only monitoring workflow remains separate and unchanged.

For the deployment token, use Editor access scoped to the existing target Worker.
No new routes or resources are created by this adapter. See Cloudflare's
[Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/#wrangler)
for current token scope requirements.

The Actions summary and each candidate's `automatic-report.json` identify sources
that need review using metadata only. The existing hosted weekly/daily review
workflow continues its link/content monitoring and issue triage independently.
`retrieval_date` means last successful acquisition; `content_changed_at` means
first acquisition or last observed normalized-content change;
`source_updated_date` remains the publisher's date, if present;
`last_content_reviewed_at` remains a separate substantive verification date.
An old publisher document can be freshly fetched and still contain outdated
information. Automatic acquisition must not remove that uncertainty.

A local exclusive guard (`data/.source-automatic.lock`) prevents simultaneous
automatic runs. Normal exits remove it. If a process is forcibly terminated,
inspect the recorded PID/start time and confirm it is no longer running before
removing this guard. Never remove the separate publication or recovery locks as
a shortcut. An incomplete build with no application receipt is restaged next
time; an applied candidate is resumed from its original receipt.

## Acquire a candidate

Edit publisher configuration in `data/sources.json` when a documented URL, selector or other source setting changes. Then run:

```sh
npm run source:stage -- --output work/source-refresh/review-001
```

The output must be a new directory below `work/source-refresh/`. Add `--source tampa-rmap` to refresh one source, `--category housing` to acquire only housing sources while retaining other dated evidence, or `--offline` to regenerate from preserved snapshots without network access. A failed source returns a nonzero exit code and retains its previous dated evidence in the candidate with status `unavailable` only when its source definition is unchanged. If configuration changed but acquisition failed or that source was not selected, the candidate withholds old evidence instead of relabeling it into a different jurisdiction, agency or source. Originals remain preserved. The active application remains unchanged.

Offline regeneration requires unchanged publisher configuration. If a URL, jurisdiction, agency, selector or other authored setting changes, acquire the source online before reviewing the new definition. Preserved bytes alone cannot establish that the replacement publisher serves the same evidence. When a newly acquired page has no publisher update date, the candidate records that date as unknown instead of carrying over the previous page's date.

Each download permits at most 30 MiB, read incrementally before allocating the complete body. Missing or incorrect `Content-Length` cannot bypass the cap. Downloads require HTTPS and refuse redirects with `source_redirect_not_allowed`; they never contact the redirect target. Review a moved publisher's final URL and update its configured `fetch_url` before staging again. Each attempt has a 45-second deadline; at most three attempts and 120 seconds are allowed per source. Transient HTTP failures and transport errors use bounded exponential backoff. `Retry-After` seconds and HTTP dates are honored; an excessively long publisher delay stops the source instead of retrying early.

Normalization and chunking run in an isolated Node worker with a 15-second deadline. On Windows, PDF parsing uses a separate OS process because a native PDF dependency can crash the parent when loaded in a worker thread; other formats and Linux retain worker threads. The PDF process has a 192 MiB old-generation heap limit, an 8 MiB semi-space setting and a 4 MiB stack, receives no application credentials, discards parser stdout/stderr, and is killed and awaited on deadline or cancellation. These are V8 settings, not native-memory or operating-system limits. The parent terminates timed-out or aborted work before processing another source. V8 heap limits are 192 MiB for the old generation and 32 MiB for the young generation; these are not an operating-system cap on native or buffer memory. Independent output limits allow at most 16 MiB of serialized normalized evidence, 10,000 units, 5,000 links, 20,000 chunks and 32 MiB of serialized chunks, including repeated metadata and fact annotations. Structured JSON traversal is also bounded. An evidence-budget failure returns `normalization_limit_exceeded`; timeouts and cancellation return `source_processing_timeout` and `source_processing_aborted`. Other parser failures, including worker heap-limit termination, return `source_processing_failed`. These failures preserve the active corpus under the same candidate rules above; evidence is never silently truncated to fit.

The candidate contains an immutable corpus proposal, content-addressed raw/normalized snapshots, a digest manifest, and `report.json`. The report contains source IDs, status/date/hash changes, configuration field names, added/removed chunk counts and generic failure codes. It contains no downloaded excerpts. Original raw snapshots and earlier normalized files are retained.

## Review the change

```sh
npm run source:review -- --candidate work/source-refresh/review-001 --local-diff
```

Inspect `report.json`, `review-local.md`, `corpus.json`, and the originals below `payload/data/raw/`. The local Markdown diff shows up to 20 added and 20 removed passages per source and identifies truncation; the full proposal and snapshots remain available. Confirm applicability, exceptions, dates, program availability, official next steps and any normalization loss against the publisher. Review unavailable sources and removed source definitions explicitly. The local diff and payload contain downloaded material and are excluded from public reports.

The passage diff compares chunk IDs. Changes only to `facts`, `answer_sections` or sentence-boundary locators can preserve those IDs and therefore produce no added/removed passages. Inspect those annotations in `corpus.json` when reviewing extractor or source-policy changes; an empty passage diff does not establish unchanged answer behavior. The [architecture guide](ARCHITECTURE.md#adding-source-semantics) explains annotation validation and compatibility.

Copy the verified `candidate_sha256` from the review output only after inspecting the candidate. That digest binds the proposed corpus and every staged snapshot. A changed active corpus or edited source configuration makes the candidate stale and requires staging again.

## Validate, build and apply an approved candidate

```sh
npm run source:apply -- --candidate work/source-refresh/review-001 --approve SHA256_FROM_REVIEW --reviewer "Reviewer name" --worker-name tampabaybot-reviewed-source
```

This command requires the explicit digest and reviewer name. Before applying anything, it creates an isolated source tree, reproduces each retained evidence chunk from its preserved raw snapshot, installs the locked dependencies with installation scripts disabled, runs the public source regression suite and TypeScript checks, builds a standalone Worker, and runs the standalone production smoke checks. Failed validation/builds leave the active corpus alone. Corpus-dependent historical benchmarks can change with fresh publisher content; run `npm run evaluate` and `npm run eval:suite` against a separately prepared candidate when checking those dated expectations, and review failures instead of relabeling them.

The successful build and `application.json` receipt stay below the candidate directory. The receipt identifies the candidate, reviewer, new/previous generation, build artifact and deployment state. It records `not_deployed` unless an explicit operator deployment is requested. Restart development servers after application; the application embeds one consistent corpus generation at build/start time.

## Consistent publication, recovery and rollback

`data/corpus.json` is the authoritative `{schema_version, generation, sources, chunks}` envelope. All application routes and evaluation loaders read that same generation. Publication archives both generations, then atomically replaces this one file. A reader receives either the old pair or the new pair of sources/chunks. A publication lock prevents simultaneous writers. `data/sources.json` and `data/chunks.json` remain compatibility mirrors for source editing and older tools.

An interruption before the envelope replacement leaves the previous generation active. An interruption after it leaves the complete new generation active; the mirrors may need repair. After the interrupted process has stopped, run:

```sh
npm run source:recover
```

Recovery refuses to clear a lock owned by a running process. It restores both compatibility mirrors from the authoritative envelope. Any differing mirror bytes, including un-staged registry edits, are first preserved under ignored `work/source-recovery/`; the returned `preserved_mirrors` path identifies the backup. Rollback also preserves draft mirror edits before replacing the active registry.

A separate `data/.source-recovery.lock` serializes recovery before it inspects a stale publication owner. Normal completion and handled failures remove this recovery guard. If a recovery process is forcibly terminated, the guard deliberately blocks further recovery instead of automatically deleting potentially active ownership. Inspect and preserve the guard's contents, including its PID and start time; confirm through the operating system that no recovery process is still running. Only then manually remove **the recovery guard** and rerun `npm run source:recover`. Do not manually remove a live `data/.source-update.lock` or run simultaneous guard cleanup commands.

To restore a known archived generation, pass both the target and the generation you expect to be active:

```sh
npm run source:rollback -- --generation PREVIOUS_GENERATION --expect-current ACTIVE_GENERATION
```

Rollback uses the same atomic publication path and retains provenance. It changes the local corpus; restore the corresponding deployed artifact separately when rolling back a hosted instance. History lives under `data/generations/` and is excluded from public source packages.

## Deployment handoff

Adding `--deploy` to `source:apply` executes an operator-configured command after successful application. To deploy an already applied candidate, including retrying a failed command, use its original reviewed digest:

```sh
npm run source:deploy -- --candidate work/source-refresh/review-001 --approve SHA256_FROM_REVIEW
```

This command checks the candidate and application receipt, requires that generation to remain active, and recomputes the hash of every compiled server file, public asset and deployment config against the standalone verification receipt. Changed upload bytes, another config path or a later local generation stop deployment before the external command runs. It then copies those verified files into a new ignored `work/source-deploy/` attempt directory, checks the copied bytes again, and runs the deployment command there. Wrangler can write its temporary files beside the copied config without changing the reviewed build. Each attempt has separate working and log directories recorded in `application.json`. The publication lock also prevents local application or rollback while deployment runs. A retry uses a fresh copy of the same build and preserves prior attempt outcomes; it does not acquire or apply evidence again.

Set `TAMPABAYBOT_SOURCE_DEPLOY_ARGV` to a JSON array containing the executable and its arguments. Use absolute executable and script paths because the command runs from its attempt directory. No shell parsing is performed; `{config}` and `{artifact}` name that attempt's verified upload copy, and `{generation}` names the reviewed generation. For a local Wrangler installation, this PowerShell example configures the command without running it:

```powershell
$env:TAMPABAYBOT_SOURCE_DEPLOY_ARGV = ConvertTo-Json -Compress -InputObject @(
  (Get-Command node.exe).Source,
  (Join-Path (Get-Location) 'node_modules/wrangler/bin/wrangler.js'),
  'deploy', '--config', '{config}'
)
```

Supply credentials through your normal operator environment, not through candidate files or repository commits. On Windows, use an executable such as `node.exe` rather than a `.cmd` wrapper. `source:deploy` and `source:apply --deploy` actually run the configured command. A failed deployment is recorded distinctly from local corpus application. If an interruption leaves an attempt marked `running`, inspect the hosting provider before retrying: the remote upload may have completed. A successful command does not establish hosted correctness; complete your authenticated/own-account smoke check as described in [deployment](DEPLOYMENT.md).

## Scheduled review

`.github/workflows/source-refresh.yml` runs at 10:23 UTC daily and supports manual dispatch. Mondays acquire the full registry; other scheduled days acquire only the housing category. Manual dispatch acquires the full registry. It stages current publisher content in an ephemeral runner, then passes the stage's metadata-only report to the [resource freshness checker](RESOURCE_VERIFICATION.md#automated-freshness-report). The checker also inspects the static Pages housing catalog, official links, review dates and potential content changes. It requires explicit `--live --allow-network` flags. The workflow retains the stage `report.json` and the freshness `report.json`/`report.md` for 14 days. No snapshots, excerpts, normalized data, complete corpus, local diff, built Worker, commits or deployment are uploaded or applied. If acquisition is interrupted, the incrementally written stage report remains marked `acquiring`.

After a successful freshness report, a separate job with issue-write permission [deduplicates actionable review issues](RESOURCE_VERIFICATION.md#weekly-issue-triage) by stable fingerprint and the `source-monitor` label. A second metadata-only report artifact signals that generation completed, so triage can proceed even if source staging failed separately. A transient publisher or network failure does not create an issue by itself. Issues are reminders to investigate public source metadata; they do not approve changes or trigger publication. The source acquisition job retains read-only repository permission.

The public source checkout starts with an empty baseline, so its scheduled stage report describes acquisition against that baseline. Its normalized-content change signal is therefore a review prompt, not a comparison against a deployed corpus. For deployment-relative diffs, run the same staging command in the operator checkout retaining its active generation. Reacquire locally and approve the newly generated digest; the ephemeral scheduled candidate is deliberately not distributed. Link check timestamps and results in the freshness artifact are observations only. Update the source registry's `last_link_checked_at` and `link_status` in a reviewed edit; only a substantive human review can advance `last_content_reviewed_at`, `review_status`, or `next_review_at`. An HTTP 200 response never approves program eligibility, deadlines, contact details, or citations.
