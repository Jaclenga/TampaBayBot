# Routing and citation regression evaluation

This source-only evaluation exercises TampaBayBot's question routing, evidence selection, citation handling, refusal, and treatment of unsupported claims. The [versioned benchmark](../evaluation/datasets/routing-citation-benchmark.json) has 72 authored questions, nine in each of eight categories. Cases can require a route, conservative response state, location question, official citation, source ID, crisis referral, or absence of a specific unsupported claim. They do not contain purported final answers to real residents' questions. Source IDs refer to the synthetic answer-reliability fixture, and crisis resource IDs refer to the checked-in housing directory.

## Run locally

Use Node.js 24 and the committed lockfile from the repository root:

```sh
npm ci
npm run eval:regression
```

The default run is deterministic and requires neither production credentials nor a live AI service. It writes `work/evals/regression/latest.json` and `latest.md`. The JSON report contains individual check results and category pass rates; the Markdown report summarizes failures by category. A failing threshold exits nonzero.

The default minimum is 100% overall and in every category. To choose explicit thresholds for a local investigation, pass rates between `0` and `1`:

```sh
npm run eval:regression -- --min-overall 0.95 --min-category eviction=1 --output work/evals/regression-review
```

An omitted category uses the overall threshold. Use `--min-category` to set a different minimum for a category. The eight category names are `eviction`, `housing_assistance`, `eligibility`, `zoning`, `property_information`, `emergencies`, `ambiguous`, and `unsupported`.

## Read the results

A category pass rate is the number of cases that pass all applicable deterministic checks divided by the number of cases in that category. A check marked `null` is inapplicable and is not counted as a success. With thresholds below `1`, a passing gate can still contain failed cases; read the failed case IDs and check IDs in `latest.json` before changing an implementation or an expectation. A case pass means the tested behavior matches this authored fixture at this version. It does not establish the current truth of a publisher's information, legal eligibility, an available shelter bed, or a correct zoning determination for a real parcel.

Citation checks verify source registration, quote and citation integrity against the synthetic fixture. A case with `source_ids_any` must retain at least one named source in evidence even if its answer declines to make a determination; this exposes silent loss of fixture evidence. They do not prove that every sentence is semantically entailed by a source. Unsupported-claim checks cover explicitly authored prohibited claims and refusal behavior; they cannot exhaust every possible incorrect claim. The synthetic fixture and fixed questions are development tests, not a blind sample of resident traffic.

When changing a case, review its expected route and response state, source and crisis resource IDs, forbidden claim patterns, and fixture reference date together. Keep case IDs stable when a case still represents the same question. Do not copy private resident narratives into the dataset or turn unverified program availability, deadlines, eligibility, or parcel facts into expected answers. Record the evidence used to revise an expectation in the change review.

## CI regression gate

[`evaluation-regression.yml`](../.github/workflows/evaluation-regression.yml) runs the offline evaluator on every push and pull request and on manual dispatch. It uses no production secrets or model endpoint, and uploads the JSON and Markdown reports even when the evaluation fails. The gate defaults to `1` overall and in each category.

Repository administrators can set these GitHub Actions variables to change the minimums:

| Variable | Format | Default |
| --- | --- | --- |
| `EVAL_MIN_OVERALL` | A number from `0` to `1` | `1` |
| `EVAL_MIN_CATEGORIES` | Comma-separated `category=rate` entries, such as `eviction=1,eligibility=0.95` | No overrides; each category uses `EVAL_MIN_OVERALL` |

Invalid thresholds fail the run. Treat a threshold change as an evaluation-policy change and review it with the affected cases. This job is separate from the older `eval:reliability` gate in source-release CI.

## Optional semantic evaluation

The semantic evaluator is separate from this deterministic gate. Configure an Ollama or compatible provider as described in [model configuration](LLM.md), then explicitly authorize the call:

```sh
npm run eval:semantic -- --allow-provider-call --limit 10 --budget-ms 60000
```

It samples cases across categories in a fixed round-robin order and sends committed synthetic questions, the offline baseline responses, and bounded evidence to the configured provider for three judgements: support, relevance, and appropriate uncertainty. It may incur charges. It does not generate resident answers or run in CI. Results are written to `work/evals/semantic/latest.json` and `latest.md`, with category rates separate from the deterministic report. A zero exit means all selected cases received a valid judgement; inspect the recorded booleans to see whether those judgements passed. Model judgements can vary by run and do not replace source verification or human review.
