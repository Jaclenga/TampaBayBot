# Evaluation suite

Run `npm run eval:suite` for the versioned offline engineering evaluation. Its default **205 cases** exercise navigation, guardrails, provider contracts and repeatable input/corpus variations. They use preserved public evidence and explicitly synthetic fixtures. No language-model server, credential or paid API call is required.

This is a hand-authored development suite, used while building the application. A passing report describes the checked behaviors; it is not a blind holdout, an AI accuracy score, or a completed human review. The separate 77-question benchmark and review method (development artifact omitted from source-only release) remains available.

## Run offline

Use Node.js 24 LTS and the committed lockfile:

```sh
npm ci
npm run eval:suite
```

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

The CI workflow (development artifact omitted from source-only release) runs this offline suite and uploads its reports alongside the separate legacy benchmark, browser and runtime artifacts. CI makes no paid model calls. A checked-in workflow is not evidence that a remote CI job has completed.

## What the cases cover

| Group | Cases | Coverage |
| --- | ---: | --- |
| `navigation` | 77 | Five civic categories; expected sources, uncertainty, official next steps, source caveats, misspellings, invented programs, stale/unavailable/conflicting evidence and location requests |
| `guardrails` | 45 | Synthetic private-identifier patterns, legitimate sensitive housing questions, instruction bypass, five hook stages, block/skip behavior, malformed decisions, timeout, mutation isolation and sanitized errors |
| `providers` | 55 | Native Ollama and compatible Chat Completions adapters; valid selections, invalid JSON/IDs, changed or shortened quotes, missing primary evidence, tool calls, refusals, response bounds, redirects, outages, cancellation and conservative-state bypass |
| `metamorphic` | 28 | Fixed-seed case/spacing/punctuation changes, corpus shuffling and duplicate chunks, instruction attacks, and decision preservation across synthetic provider selections |

Every case identifies its data as `public_snapshot`, `synthetic`, or `public_snapshot_with_synthetic_input`. Synthetic agencies, identifiers and failure payloads are test material. Case titles are safe labels or checked-in public questions; reports omit private probes, raw answer bodies, credentials and raw provider errors.

The reference date is **2026-09-12T12:00:00.000Z**, from `evaluation/scenarios.mjs`. Runtime answers use the actual current date. When refreshing the corpus, review the reference date and expectations deliberately; a fixed historical test date does not establish that program instructions remain current.

The stronger location assertions exposed three previously ignored flags: questions about Clearwater and Orlando, and a request to infer building permission from nearby development, still requested an address despite returning outside-coverage or official-judgment states. Those flags were corrected, and a focused core regression preserves ordinary Tampa property lookup behavior.

## Read the scores

Each named check has `passed: true`, `false`, or `null`, and a kind: `behavior`, `integrity`, `privacy`, `robustness`, or `proxy`. **Null means not applicable; it never counts as a pass.** An empty suite, a case without checks, a case with only null checks, duplicate identifiers or malformed results cannot produce an empty success. Required fields must be owned and serializable; non-JSON expectation/observation values are rejected. Reports detach nested case data and provenance from caller mutations. Execution failures are recorded as fixed failed checks, and other cases continue.

The shared navigation scorer independently checks source/chunk registration, recomputed SHA-256, literal quotes, citation identifiers and markers, section/page/record/layer, publisher labels, official-source classification, URLs, source dates and snapshot age. It verifies that an `answered` body contains only the permitted navigation framing and full supplied quotations. A fabricated factual body can therefore fail even when its evidence metadata and `[E1]` marker are valid.

Expected source IDs, next-step URLs and required terms are useful proxies. Exact quotations do not prove relevance, completeness, surrounding exceptions, source truth or applicability to a resident. The scorer does not semantically validate every fixed explanation. When supplied a deterministic baseline, it also checks that synthesis preserves decisions, evidence, caveats, warnings and next steps, and leaves conservative answer bodies unchanged. Conservative states cannot be marked as successful model generation.

`tests/evaluation-scoring.test.mjs` uses handwritten valid outputs and deliberate mutations to establish that the scorer rejects fabricated quotes, altered bodies, false hashes, wrong locators, unofficial sources, unknown/duplicate markers and changed conservative decisions. These tests verify the evaluator itself; they do not replace a semantic claim audit.

Reports leave human factual-correctness, completeness and resident-usefulness scores null. The legacy report also leaves unsupported-claim rate unscored. Whole-case median and p95 duration reflect this machine and workload; offline timings are not model latency or service-capacity measurements. GIS correctness, browser accessibility and manual assistive-technology review remain separate.

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

Only baseline `answered` cases are eligible for inference; conservative cases must bypass it. A fallback still preserves the safe application response, but fails the live `model_output_accepted` check for an eligible case. Budget exhaustion leaves the remaining cases explicitly failed. The wall-time budget is not a monetary spending limit or a guarantee of equal model latency across machines.

Each executed live case records an allowlisted generation status/reason and a provider-call count. Non-answered cases must explicitly report `skipped` with zero provider calls. With all 12 public cases selected, six are eligible for model selection and six exercise conservative bypass behavior per repetition.

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

`npm run evaluate` remains the separate strict 77-case legacy command. It updates the public benchmark reports and refreshes pending human-review packets while preserving completed human judgments. `eval:suite` does not rewrite those files or the historical agent audit. The 30 human reviews remain pending until named independent reviewers perform them; neither an offline nor live engineering report completes that work.
