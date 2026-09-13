# Reviewing and applying source updates

Source updates follow four separate steps: acquire into an ignored candidate, inspect the changes, approve that exact candidate, then build and apply it. Downloads never replace the active evidence automatically. `npm run ingest` now performs the acquisition step; existing `--source=<id>`, `--offline` and `--check` options remain available.

## Acquire a candidate

Edit publisher configuration in `data/sources.json` when a documented URL, selector or other source setting changes. Then run:

```sh
npm run source:stage -- --output work/source-refresh/review-001
```

The output must be a new directory below `work/source-refresh/`. Add `--source tampa-rmap` to refresh one source, or `--offline` to regenerate from preserved snapshots without network access. A failed source returns a nonzero exit code and retains its previous dated evidence in the candidate with status `unavailable` only when its source definition is unchanged. If configuration changed but acquisition failed or that source was not selected, the candidate withholds old evidence instead of relabeling it into a different jurisdiction, agency or source. Originals remain preserved. The active application remains unchanged.

Offline regeneration requires unchanged publisher configuration. If a URL, jurisdiction, agency, selector or other authored setting changes, acquire the source online before reviewing the new definition. Preserved bytes alone cannot establish that the replacement publisher serves the same evidence. When a newly acquired page has no publisher update date, the candidate records that date as unknown instead of carrying over the previous page's date.

Each download permits at most 30 MiB, read incrementally before allocating the complete body. Missing or incorrect `Content-Length` cannot bypass the cap. HTTPS redirects are bounded and cannot downgrade to HTTP. Each attempt has a 45-second deadline; at most three attempts and 120 seconds are allowed per source. Transient HTTP failures and transport errors use bounded exponential backoff. `Retry-After` seconds and HTTP dates are honored; an excessively long publisher delay stops the source instead of retrying early.

The candidate contains an immutable corpus proposal, content-addressed raw/normalized snapshots, a digest manifest, and `report.json`. The report contains source IDs, status/date/hash changes, configuration field names, added/removed chunk counts and generic failure codes. It contains no downloaded excerpts. Original raw snapshots and earlier normalized files are retained.

## Review the change

```sh
npm run source:review -- --candidate work/source-refresh/review-001 --local-diff
```

Inspect `report.json`, `review-local.md`, `corpus.json`, and the originals below `payload/data/raw/`. The local Markdown diff shows up to 20 added and 20 removed passages per source and identifies truncation; the full proposal and snapshots remain available. Confirm applicability, exceptions, dates, program availability, official next steps and any normalization loss against the publisher. Review unavailable sources and removed source definitions explicitly. The local diff and payload contain downloaded material and are excluded from public reports.

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

`.github/workflows/source-refresh.yml` runs each Monday at 10:23 UTC and supports manual dispatch. It stages current publisher content in an ephemeral runner and uploads **only `report.json`** for 14 days. No snapshots, excerpts, normalized data, complete corpus, local diff, built Worker, commits or deployment are uploaded or applied. If acquisition is interrupted, the incrementally written report remains marked `acquiring`.

The public source checkout starts with an empty baseline, so its scheduled report describes acquisition against that baseline. It is an availability/change-review prompt, not a comparison against a deployed corpus. For deployment-relative diffs, run the same staging command in the operator checkout retaining its active generation. Reacquire locally and approve the newly generated digest; the ephemeral scheduled candidate is deliberately not distributed.
