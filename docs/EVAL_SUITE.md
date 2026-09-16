# Evaluation suite

This is the command, report-format and scorer-contract reference for offline evaluation, optional live-model runs and regression comparison. For metric interpretation and human review, use [EVALUATION.md](EVALUATION.md). Dated results and environments are recorded in [release readiness](RELEASE_READINESS.md).

The default offline suite has 236 hand-authored cases using preserved public evidence and synthetic fixtures. Twelve cases measure bounded factual accuracy, citation correctness and citation completeness against a checked-in claim oracle. It requires no model server, credential or paid inference. The source-only package initially has no evidence: [load and review a corpus](DISTRIBUTION.md#populate-and-validate-locally) first. Empty `not_run` placeholders are not successful evaluations, and fresh source content may require reviewed changes to the dated expectations.

## Run offline

For program omission measurement, use `npm run eval:recall`. It reports program-level recall at ranked retrieval cutoffs and in final evidence, with a fixed authored applicability denominator and per-program misses. See [applicable-program recall](PROGRAM_RECALL.md) for corpus selection, labels, results and limitations. This separate measurement is not included in the historical suite totals below.

Use Node.js 24 LTS and the committed lockfile:

```sh
npm ci
npm run eval:suite
```

Input JSON datasets are grouped in [`evaluation/datasets/`](../evaluation/datasets/README.md); its index describes each dataset and how to maintain it.

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

The offline runner disables global outbound `fetch`. Provider scenarios inject synthetic HTTP responses into the actual adapter and guarded application path. They do not contact the configured `.env` provider, download models or exercise real inference. Custom trusted test code still needs review; replacing `fetch` is not an operating-system network sandbox.

The development CI workflow (development artifact omitted from source-only release) runs this suite against the retained corpus and uploads reports alongside benchmark, browser and runtime artifacts. The public source-only workflow instead checks the unpopulated distribution; it does not claim those corpus-dependent cases passed. Both avoid paid inference. Actual run results and the distinction between source and development CI belong in [release readiness](RELEASE_READINESS.md).

## Narrative benchmark and human packets

```sh
npm run evaluate
```

This is the separate strict narrative evaluator. It reads the same benchmark definitions used by the navigation suite, writes `evaluation/datasets/benchmark.json`, `evaluation/results/latest.json` and `evaluation/results/responses.json`, and prepares `evaluation/human-audit/responses.json`. It preserves completed human judgments and flags changed responses. The unified `eval:suite` command does not rewrite these files or historical agent reviews. See [human-review methodology](EVALUATION.md#independent-human-review) before changing review records.

## What the cases cover

| Group | Cases | Coverage |
| --- | ---: | --- |
| `navigation` | 77 | Five civic categories; expected sources, uncertainty, official next steps, source caveats, misspellings, invented programs, stale/unavailable/conflicting evidence and location requests |
| `guardrails` | 45 | Synthetic private-identifier patterns, legitimate sensitive housing questions, instruction bypass, five hook stages, block/skip behavior, malformed decisions, timeout, mutation isolation and sanitized errors |
| `providers` | 55 | Native Ollama and compatible Chat Completions adapters; valid selections, invalid JSON/IDs, changed or shortened quotes, missing primary evidence, tool calls, refusals, response bounds, redirects, outages, cancellation and conservative-state bypass |
| `metamorphic` | 28 | Fixed-seed case/spacing/punctuation changes, corpus shuffling and duplicate chunks, instruction attacks, and decision preservation across synthetic provider selections |
| `jurisdiction` | 19 | City/county source isolation, locality aliases, unincorporated/excluded city wording, missing/conflicting areas, city names inside street addresses, and rejection of cross-city model selections |
| `quality` | 12 | Authored exact claims across Tampa, St. Petersburg, Clearwater, Hillsborough, Pinellas and Pasco; case-level factual accuracy, citation-to-claim correctness and claim citation coverage |

Every case identifies its data as `public_snapshot`, `synthetic`, or `public_snapshot_with_synthetic_input`. Synthetic agencies, identifiers and failure payloads are test material. Case titles are safe labels or checked-in public questions; reports omit private probes, raw answer bodies, credentials and raw provider errors.

The reference date is **2026-09-12T12:00:00.000Z**, from `evaluation/scenarios.mjs`. Runtime answers use the actual current date. When refreshing the corpus, review the reference date and expectations deliberately; a fixed historical test date does not establish that program instructions remain current.

## Read the scores

Each named check has `passed: true`, `false`, or `null`, and a kind: `behavior`, `integrity`, `privacy`, `robustness`, `proxy`, `accuracy`, or `citation`. **Null means not applicable; it never counts as a pass.** An empty suite, a case without checks, a case with only null checks, duplicate identifiers or malformed results cannot produce an empty success. Required fields must be owned and serializable; non-JSON expectation/observation values are rejected. Reports detach nested case data and provenance from caller mutations. Execution failures are recorded as fixed failed checks, and other cases continue.

The shared navigation scorer independently checks source/chunk registration, recomputed SHA-256, literal quotes, citation identifiers and markers, section/page/record/layer, publisher labels, official-source classification, URLs, source dates and snapshot age. It verifies that an `answered` body contains only the permitted navigation framing and full supplied quotations. A fabricated factual body can therefore fail even when its evidence metadata and `[E1]` marker are valid.

Expected source IDs, next-step URLs and required terms are useful proxies. Exact quotations do not prove relevance, completeness, surrounding exceptions, source truth or applicability to a resident. The scorer does not semantically validate every fixed explanation. When supplied a deterministic baseline, it also checks that synthesis preserves decisions, evidence, caveats, warnings and next steps, and leaves conservative answer bodies unchanged. Conservative states cannot be marked as successful model generation.

`tests/evaluation-scoring.test.mjs` uses handwritten valid outputs and deliberate mutations to establish that the scorer rejects fabricated quotes, altered bodies, false hashes, wrong locators, unofficial sources, unknown/duplicate markers and changed conservative decisions. These tests verify the evaluator itself; they do not replace a semantic claim audit.

The `quality` suite uses [`quality-benchmark.json`](../evaluation/datasets/quality-benchmark.json), which was authored separately from runtime output. It stores questions, expected status, stable claim IDs, SHA-256 hashes of exact expected claims, and the source/chunk pairs allowed to support them. It does not copy the source excerpts into the source-only distribution. Before scoring, the suite verifies every hash and support pair against the retained corpus, then runs the question through the ordinary guarded entrypoint with inference disabled. The answer implementation never receives the oracle.

The three quality metrics have separate failure conditions:

| Metric | Pass condition for one case |
| --- | --- |
| Factual accuracy | The answer has the expected status and exactly the authored claim set in the fixed extractive format, with no additional claim paragraph |
| Citation correctness | Every citation that is present resolves to evidence whose exact claim hash and source/chunk pair match the authored support relation; zero citations are N/A here and fail completeness |
| Citation completeness | Every extractive claim paragraph has a valid citation marker; an answer with no claim cannot pass |

These are deterministic case-level scores over 12 dated, hand-authored reference claims. They are stronger than keyword proxies, but they are not semantic entailment judgments, current-source audits, blind holdout results or estimates for arbitrary questions. `tests/evaluation-quality.test.mjs` proves the scorer rejects a fabricated cited claim, a real but non-supporting citation, missing citations, partial coverage and additional unsupported claims. The JSON and Markdown reports expose the aggregates under `automatedQuality`; the oracle hash is included in comparison provenance.

Reports leave independent human factual-correctness, completeness and resident-usefulness scores null; the narrative report also leaves unsupported-claim rate unscored. [Evaluation methodology](EVALUATION.md#reading-the-metrics) explains why. Whole-case median and p95 duration reflect the measured machine and workload; offline timings are not model latency or service-capacity measurements.

## Evaluate an explicitly configured model

Configure `LLM_PROVIDER`, `LLM_BASE_URL` and `LLM_MODEL`, plus `LLM_API_KEY` when required, using the [model setup guide](LLM.md). The CLI reads the ignored local `.env`; process environment values take precedence. It requires a valid enabled Ollama or OpenAI-compatible configuration and does not choose or install a model.

```sh
npm run eval:live -- --allow-provider-call --limit 10 --repeats 1 --budget-ms 60000
```

`--allow-provider-call` is required on each invocation because the run sends public test questions and bounded source excerpts to the configured endpoint and may incur provider charges. These are checked-in public baseline cases, never resident traffic or an arbitrary prompt file. No real-model run or model-quality result is claimed merely by providing this command.

| Option | Default | Bounds and meaning |
| --- | ---: | --- |
| `--limit` | 10 | First 1–12 selected public cases from `LIVE_CASE_IDS` |
| `--repeats` | 1 | 1–5 repetitions of each selected case |
| `--budget-ms` | 60000 | 1000–600000 ms shared wall-time budget |
| `--input-usd-per-million` | Unset | Nonnegative input-token rate; requires the output rate |
| `--output-usd-per-million` | Unset | Nonnegative output-token rate; requires the input rate |
| `--cached-input-usd-per-million` | Unset | Optional separate rate for reported cached input tokens; requires both other rates |

Only baseline `answered` cases are eligible for inference; conservative cases must bypass it. A fallback still preserves the safe application response, but fails the live `model_output_accepted` check for an eligible case. Budget exhaustion leaves the remaining cases explicitly failed. The wall-time budget is not a monetary spending limit or a guarantee of equal model latency across machines.

Each executed live case records an allowlisted generation status/reason and a provider-call count. Non-answered cases must explicitly report `skipped` with zero provider calls. With all 12 public cases selected, six are eligible for model selection and six exercise conservative bypass behavior per repetition.

### Token usage and estimated cost

Live evaluation records provider-reported input, output, total and cached-input tokens for each attempted call. Cached tokens are a subset of input tokens, so they are not added to the total again. Token counts come from the provider response, not a character-count approximation. A response rejected by the answer validator still contributes its reported usage: a safe fallback does not undo inference. Calls that time out or fail without readable usage remain unknown.

Pass the rates that apply to your endpoint and model when you want a USD estimate. The following rates are **synthetic examples**, not current provider prices:

```sh
npm run eval:live -- --allow-provider-call --input-usd-per-million 1 --output-usd-per-million 4 --cached-input-usd-per-million 0.25
```

All three pricing options apply only to live mode. No provider/model rates are built in. Without a separate cached rate, the input rate applies to all input tokens. With one, the estimate is `((input - cached) * inputRate + cached * cachedRate + output * outputRate) / 1_000_000`; missing cache counts can therefore prevent a complete estimate. Explicit zero rates are accepted. A localhost endpoint or Ollama provider does not automatically imply a zero rate.

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

No-call cases, offline evaluation and program-recall evaluation report zero model tokens and zero model API cost. Synthetic provider responses in offline tests do not count as paid inference. Those zeros do not measure application compute, and an empty recall corpus still has its normal `not_evaluable` status. These reporting fields do not establish that any real model evaluation has been run.

The cost estimate covers the supplied token rates only. It excludes infrastructure, tax and other provider billing adjustments; it is neither a provider invoice nor a spending cap. Missing usage or rates are never converted into a zero-cost claim. Prompts, completions, credentials and arbitrary provider usage fields are excluded from these metrics.

For a running local Ollama daemon with Meta `llama3:8b` installed, this PowerShell example sets only the current shell's test configuration and runs two repetitions across all five categories:

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

The extended deadline accommodates slower CPU inference; it does not guarantee completion on every machine. Use the separate `test:ollama-runtime` command in the [model setup guide](LLM.md#reproduce-integration-checks) to verify actual app HTTP/Worker wiring with the real daemon. The CLI evaluation above exercises the guarded application engine directly.

Live reports can be written **only beneath ignored `work/evals/live/`**. The default is a timestamped subdirectory; an optional `--output work/evals/live/my-run` must stay inside that directory. JSON, Markdown and JUnit use the same filenames as offline reports. The configuration fingerprint records provider, endpoint locality, model-name hash, response/timeout bounds and run limits. It excludes the raw model name, endpoint, key, request text, raw response and provider error. Endpoint locality does not prove that an Ollama server uses local weights or never forwards to a cloud service.

## Compare reports

Save a report before a change, then generate a candidate in another directory:

```sh
npm run eval:suite -- --output work/evals/after
npm run eval:compare -- --baseline work/evals/before/latest.json --candidate work/evals/after/latest.json
```

Comparison writes `comparison.json` beneath `work/evals/comparison/` by default and prints the result. It compares individual cases/checks, not just aggregate pass rates. Removed cases or checks, changed expectations or check kinds, previously passing checks that stop passing, applicable checks changed to null, and any failing candidate case make the comparison fail. Added cases are listed and must pass their own checks. JSON object-key order does not change an expectation; array order and actual values still matter.

By default, both reports must include matching evaluation date, source and chunk hashes, suite-definition hash, benchmark hash and scenario hash. Offline and live reports cannot be compared as the same run type. After deliberately reviewing a corpus or suite change, `--allow-changed-provenance` permits that comparison and reports which provenance fields changed. **It does not waive changed expectations, removed coverage or failed checks.**

Reports also record implementation and prompt hashes, Node version, Git commit and working-tree dirty status when Git is available. The commit identifies the checkout's parent commit when uncommitted changes are present. Writing report artifacts can itself change the working tree after those fields are captured; do not describe that commit as an exact hash of the final generated artifact state. File hashes identify the tested inputs and implementation. Unavailable Git metadata remains null.

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

Compute `passed` from independently authored requirements; the literal `true` above only illustrates the shape. Preserve stable IDs, make inapplicability explicit, catch per-case failures without serializing private text, and inject synthetic responses for offline provider cases. Use targeted group runs while developing and the full suite before release. If a scorer changes, include mutations that would previously have escaped it and version/review changed expectations.

Changes to report formats or evaluation commands must preserve the distinction between engineering results and [independent human review](EVALUATION.md#independent-human-review). Neither an offline nor live report completes that work.
