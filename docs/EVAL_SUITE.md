# Evaluation suite

Command, report-format and scorer reference for offline evaluation, optional live-model runs and regression comparison. See [EVALUATION.md](EVALUATION.md) for interpretation and human review, and [release readiness](RELEASE_READINESS.md) for dated results.

The offline suite has 236 hand-authored cases using preserved public evidence and synthetic fixtures; it requires no model server, credentials or paid inference. In a source-only checkout, [load and review a corpus](DISTRIBUTION.md#populate-and-validate-locally) first. Empty `not_run` reports are not successful evaluations, and fresh evidence may require revised expectations.

## Run offline

Program omissions have a separate [recall measurement](PROGRAM_RECALL.md#run-the-measurement), excluded from suite totals.

Use Node.js 24 LTS and the committed lockfile:

```sh
npm ci
npm run eval:suite
```

The [dataset index](../evaluation/datasets/README.md) describes the input JSON files and their maintenance.

The default destination is `evaluation/suite/results/`:

| File | Purpose |
| --- | --- |
| `latest.json` | Version, provenance, per-case checks, grouped metrics and failures |
| `latest.md` | Readable results and interpretation limits |
| `junit.xml` | Case-level results for CI test reporting |

Each run replaces those report files. Use a separate directory to preserve a comparison baseline or run selected groups:

```sh
npm run eval:suite -- --output work/evals/before
npm run eval:suite -- --suite guardrails,providers --output work/evals/targeted
```

The offline runner disables global outbound `fetch`; provider cases inject synthetic HTTP responses into the real adapter and guarded application path. They do not contact the `.env` provider or run inference. Review custom test code: replacing `fetch` is not an operating-system network sandbox.

Development CI runs against the retained corpus and uploads evaluation, benchmark, browser and runtime reports. That workflow is excluded from source releases; public source-only CI checks the unpopulated distribution and cannot certify corpus-dependent cases. Both avoid paid inference.

## Narrative benchmark and human packets

```sh
npm run evaluate
```

The strict narrative evaluator shares the navigation suite's benchmark definitions. It writes `evaluation/datasets/benchmark.json`, `evaluation/results/latest.json` and `evaluation/results/responses.json`, and prepares `evaluation/human-audit/responses.json`. Completed judgments are preserved and changed responses flagged for [renewed human review](EVALUATION.md#independent-human-review). `eval:suite` does not rewrite these files or historical agent reviews.

## What the cases cover

| Group | Cases | Coverage |
| --- | ---: | --- |
| `navigation` | 77 | Five civic categories; expected sources, uncertainty, official next steps, source caveats, misspellings, invented programs, stale/unavailable/conflicting evidence and location requests |
| `guardrails` | 45 | Synthetic private-identifier patterns, legitimate sensitive housing questions, instruction bypass, five hook stages, block/skip behavior, malformed decisions, timeout, mutation isolation and sanitized errors |
| `providers` | 55 | Native Ollama and compatible Chat Completions adapters; valid selections, invalid JSON/IDs, changed or shortened quotes, missing primary evidence, tool calls, refusals, response bounds, redirects, outages, cancellation and conservative-state bypass |
| `metamorphic` | 28 | Fixed-seed case/spacing/punctuation changes, corpus shuffling and duplicate chunks, instruction attacks, and decision preservation across synthetic provider selections |
| `jurisdiction` | 19 | City/county source isolation, locality aliases, unincorporated/excluded city wording, missing/conflicting areas, city names inside street addresses, and rejection of cross-city model selections |
| `quality` | 12 | Authored exact claims across Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco; case-level factual accuracy, citation-to-claim correctness and claim citation coverage |

Cases identify their data as `public_snapshot`, `synthetic`, or `public_snapshot_with_synthetic_input`. Titles use safe labels or checked-in public questions; reports omit private probes, raw answers, credentials and raw provider errors.

The reference date is **2026-09-12T12:00:00.000Z**, from `evaluation/scenarios.mjs`. Runtime answers use the current date. Review the reference date and expectations when refreshing the corpus.

## Read the scores

Each named check has `passed: true`, `false`, or `null`, and a kind: `behavior`, `integrity`, `privacy`, `robustness`, `proxy`, `accuracy`, or `citation`. **Null means not applicable and never counts as a pass.** Empty suites, empty/all-null cases, duplicate IDs and malformed results cannot pass. Required fields must be owned and JSON-serializable; reports detach nested data and provenance from caller mutations. Execution errors become fixed failed checks while other cases continue.

The navigation scorer independently checks source/chunk registration, recomputed SHA-256, literal quotes, citation IDs/markers, locators, publisher labels, official-source classification, URLs, source dates and snapshot age. An `answered` body must contain only permitted navigation framing and full supplied quotations; valid evidence metadata alone cannot make fabricated answer text pass.

With a deterministic baseline, the scorer also checks that synthesis preserves decisions, evidence, caveats, warnings and next steps. Conservative answer bodies must remain unchanged and cannot count as successful model generation. Semantic relevance and source truth remain outside these checks; see [metric boundaries](EVALUATION.md#reading-the-metrics).

[`evaluation-scoring.test.mjs`](../tests/evaluation-scoring.test.mjs) tests valid outputs and mutations of quotes, bodies, hashes, locators, source classification, markers and conservative decisions.

The `quality` suite's independently authored [oracle](../evaluation/datasets/quality-benchmark.json) stores questions, expected status, stable claim IDs, exact-claim SHA-256 hashes and allowed source/chunk pairs. It contains no copied excerpts. The suite verifies every hash and support pair against the corpus, then uses the ordinary guarded entrypoint with inference disabled; the answer implementation never receives the oracle.

The three quality metrics have separate failure conditions:

| Metric | Pass condition for one case |
| --- | --- |
| Factual accuracy | The answer has the expected status and exactly the authored claim set in the fixed extractive format, with no additional claim paragraph |
| Citation correctness | Every citation that is present resolves to evidence whose exact claim hash and source/chunk pair match the authored support relation; zero citations are N/A here and fail completeness |
| Citation completeness | Every extractive claim paragraph has a valid citation marker; an answer with no claim cannot pass |

The 12 cases aggregate under `automatedQuality` in JSON and Markdown; comparison provenance includes the oracle hash. [`evaluation-quality.test.mjs`](../tests/evaluation-quality.test.mjs) verifies rejection of fabricated claims, non-supporting citations, missing/partial citations and additional unsupported claims.

Independent human correctness, completeness and usefulness scores remain null; narrative unsupported-claim rate is also unscored. Whole-case median and p95 duration describe the measured machine and workload, not model latency or service capacity.

## Evaluate an explicitly configured model

Configure `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL` and, when required, `LLM_API_KEY` using the [model guide](LLM.md). The CLI requires an enabled Ollama or OpenAI-compatible configuration. It reads local `.env` with process environment values taking precedence; it does not install or choose a model.

```sh
npm run eval:live -- --allow-provider-call --limit 10 --repeats 1 --budget-ms 60000
```

Every invocation requires `--allow-provider-call`: public baseline questions and bounded source excerpts go to the configured endpoint and may incur charges. The CLI does not accept resident traffic or arbitrary prompt files.

| Option | Default | Bounds and meaning |
| --- | ---: | --- |
| `--limit` | 10 | First 1–12 selected public cases from `LIVE_CASE_IDS` |
| `--repeats` | 1 | 1–5 repetitions of each selected case |
| `--budget-ms` | 60000 | 1000–600000 ms shared wall-time budget |
| `--input-usd-per-million` | Unset | Nonnegative input-token rate; requires the output rate |
| `--output-usd-per-million` | Unset | Nonnegative output-token rate; requires the input rate |
| `--cached-input-usd-per-million` | Unset | Optional separate rate for reported cached input tokens; requires both other rates |

Only baseline `answered` cases are eligible for inference. A safe fallback fails their `model_output_accepted` check; budget exhaustion fails remaining cases. The wall-time budget is not a spending cap or a latency guarantee.

Each executed case records an allowlisted generation status/reason and provider-call count. Conservative cases must report `skipped` with zero calls. Selecting all 12 cases exercises six eligible selections and six conservative bypasses per repetition.

For a running Ollama daemon with Meta `llama3:8b` installed, this PowerShell example configures the current shell and runs two repetitions across all five categories:

```powershell
$env:LLM_PROVIDER='ollama'
$env:LLM_BASE_URL='http://127.0.0.1:11434'
$env:LLM_MODEL='llama3:8b'
$env:LLM_API_KEY=''
$env:LLM_TIMEOUT_MS='120000'
$env:LLM_MAX_RESPONSE_BYTES='32768'
$env:LLM_ALLOW_PRIVATE_HTTP='false'
npm run eval:live -- --allow-provider-call --limit 12 --repeats 2 --budget-ms 600000 --output work/evals/live/llama3-8b-native
```

The extended deadline accommodates slower CPU inference without guaranteeing completion. This CLI calls the guarded engine directly; use [`test:ollama-runtime`](LLM.md#reproduce-integration-checks) for app HTTP/Worker wiring.

Live reports use the offline filenames **only beneath ignored `work/evals/live/`**, in a timestamped subdirectory by default. An explicit `--output work/evals/live/my-run` must stay beneath that root. The configuration fingerprint records provider, endpoint locality, model-name hash, response/timeout bounds and run limits; it excludes raw names, endpoints, keys, requests, responses and provider errors. Endpoint locality cannot establish whether a server uses local weights or forwards to a cloud service.

### Token usage and estimated cost

Each attempted call records provider-reported input, output, total and cached-input tokens, including responses rejected by answer validation. Cached tokens are already part of input tokens. Counts are never estimated from text; calls without readable usage remain unknown.

Supply your endpoint's rates for USD estimates. These are **synthetic examples**, not provider prices:

```sh
npm run eval:live -- --allow-provider-call --input-usd-per-million 1 --output-usd-per-million 4 --cached-input-usd-per-million 0.25
```

Pricing options apply only to live mode. No rates are built in; explicit zero rates are accepted, but localhost/Ollama does not imply zero. Without a cached rate, all input tokens use the input rate. With one, cost is `((input - cached) * inputRate + cached * cachedRate + output * outputRate) / 1_000_000`; missing cache counts can prevent a complete estimate.

`latest.json` stores the normalized rates under `pricing`. Each case has `details.modelCalls` (one sanitized token record or null per actual request) and `details.modelUsage`; totals appear in `summary.modelUsage` and `summary.suites.<suite>.modelUsage`. Usage summaries include:

| Field | Interpretation |
| --- | --- |
| `providerCalls` | Actual provider requests, including unsuccessful attempts |
| `tokens.status` | `no_calls`, `complete` (input/output/total known), `partial` or `unavailable`; optional cache counts can remain null when core counts are complete |
| `tokens.inputTokens`, `outputTokens`, `totalTokens`, `cachedInputTokens` | Full-run totals when known; unknown totals remain null |
| `tokens.known` | Subtotals from the counts that were reported; these are not complete totals when coverage is partial |
| `tokens.reportedCalls`, `unreportedCalls` | Calls with at least one usable token count, and calls with none; reported does not guarantee all fields are present |
| `cost.status` | `no_calls`, `estimated`, `partial` or `unavailable` |
| `cost.estimatedUsd` | Complete estimate, or null when any call cannot be priced |
| `cost.knownEstimatedUsd`, `pricedCalls`, `unpricedCalls` | Estimate and coverage of the calls that can be priced |

Markdown shows usage and cost with their coverage. JUnit includes suite properties named `model.provider_calls`, `model.input_tokens`, `model.output_tokens`, `model.cached_input_tokens`, `model.total_tokens`, `model.usage_status`, `model.estimated_cost_usd`, `model.known_estimated_cost_usd` and `model.cost_status`; unknown values use the literal `unknown`. Legacy live cases without provider-call measurements retain null usage instead of being assigned zero.

No-call cases, offline evaluation and program recall report zero model tokens and API cost (`no_calls`). Synthetic responses do not count as inference. These zeros exclude application compute and do not change an empty recall corpus's `not_evaluable` status.

Estimates exclude infrastructure, tax and billing adjustments; they are neither invoices nor spending caps. Missing usage or rates stay unknown. Metrics exclude prompts, completions, credentials and arbitrary provider usage fields.

## Compare reports

Save a report before a change, then generate a candidate in another directory:

```sh
npm run eval:suite -- --output work/evals/after
npm run eval:compare -- --baseline work/evals/before/latest.json --candidate work/evals/after/latest.json
```

Comparison prints the result and writes `work/evals/comparison/comparison.json` by default. It fails on removed cases/checks, changed expectations or check kinds, lost passes, applicable checks changed to null, or any failing candidate case. Added cases must pass. Expectation comparison ignores JSON object-key order but preserves array order and values.

Reports must have the same run type and matching evaluation date, source/chunk hashes, suite-definition hash, benchmark hash and scenario hash. For a reviewed corpus or suite change, `--allow-changed-provenance` lists and permits provenance differences. **It does not waive changed expectations, removed coverage or failed checks.**

Reports also record implementation/prompt hashes, Node version and available Git commit/dirty status; unavailable Git metadata stays null. Uncommitted changes and later report writes are not captured by the commit hash. Use the recorded file hashes to identify tested inputs and implementation.

CLI exit codes are `0` for passing applicable checks/comparison, `1` for failed cases or regression, and `2` for invalid configuration or reports. Use `npm run eval:suite -- --help` for syntax.

## Add coverage

Keep reusable case functions in `evaluation/suite/`; `runner.mjs` registers offline groups. The stable result contract is in [`types.d.ts`](../evaluation/suite/types.d.ts):

```js
{
  id: 'stable-case-id',             // unique within this suite
  suite: 'guardrails',
  title: 'Safe public description',
  fixture: 'synthetic',
  checks: [{ id: 'expected-state', kind: 'behavior', passed: true,
    expected: 'official_judgment', observed: 'official_judgment' }],
  durationMs: 0,
  details: { scenario: 'optional-scenario', challenge: 'optional-description' }
}
```

Compute `passed` from independently authored requirements; `true` above only illustrates the shape. Preserve stable IDs, mark inapplicability, sanitize per-case failures and inject synthetic offline provider responses. Use targeted runs during development and the full suite before release. Scorer changes need mutation tests and reviewed/versioned expectations.

Keep engineering reports separate from [independent human review](EVALUATION.md#independent-human-review).
