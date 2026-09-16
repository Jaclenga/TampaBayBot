# Evaluation and review

This guide explains evaluation metrics and human review. Use [EVAL_SUITE.md](EVAL_SUITE.md) for commands, report formats and scorer contracts, and [release readiness](RELEASE_READINESS.md) for dated results and unresolved checks.

The source-only distribution starts without evidence; its empty reports mean `not_run`. [Load and review a corpus](DISTRIBUTION.md#populate-and-validate-locally) before evaluating it. Historical results apply to their retained development snapshots.

## Distinct kinds of evidence

| Check or review | Purpose | Boundary |
| --- | --- | --- |
| Source regeneration | Reconstruct chunks from preserved responses and verify hashes/locators | Does not establish that a publisher's information is current or correct |
| Code tests and offline evaluations | Exercise authored routing, claim accuracy, citation, guardrail, provider and geographic requirements | Development cases are not a blind holdout or a population accuracy estimate |
| Synthetic provider/runtime checks | Exercise transport, environment bindings, validation, bypass and fallback | No real model inference or semantic usefulness assessment |
| Real-model runs | Observe a specific provider/model accepting evidence selections, bypassing conservative states and meeting runtime checks | Does not establish every model's behavior or human usefulness |
| Agent response review | Inspect saved responses, surrounding evidence and known failure modes | Must stay labeled as agent review; cannot complete the human audit |
| Independent human review | Assess claims, context, completeness, uncertainty and resident usefulness | Remains pending; requires people to inspect sources and the actual experience |
| Accessibility checks | Exercise browser behavior and automated accessibility rules | Manual assistive-technology and resident review are separate; see [ACCESSIBILITY.md](ACCESSIBILITY.md) |

Recorded [Ollama runs](OLLAMA_TESTING.md) apply to the named model, corpus and machine. Evaluate each model/version separately: record configuration, accepted selections, fallbacks, latency, failures and human usefulness without retaining resident prompts. See the [live-evaluation commands](EVAL_SUITE.md#evaluate-an-explicitly-configured-model).

## Published alpha.4 results

The [September 12, 2026 alpha.4 record](RELEASE_READINESS.md#historical-v010-alpha4-evaluation-and-repository-organization) contains the published totals and validation environment. Factual accuracy, citation correctness and citation completeness each passed the same 12 hand-authored cases: three checks per answer, not 36 independent answers. These results measure exact claims against dated evidence, not general semantic accuracy or current publisher truth.

## Benchmark design and reference date

The narrative evaluator uses preserved sources and a fixed reference date from `evaluation/scenarios.mjs`; runtime answers use the current time and each source's refresh interval. Review the date and expectations when refreshing a corpus.

The **77 hand-authored questions** span housing (28), zoning (16), permitting (11), development (10), and navigation (12). They cover unclear language, invented programs, stale or conflicting evidence, malicious documents, unsupported judgments, incomplete locations and irrelevant requests. Four use synthetic scenario data; fixture agencies and `.invalid` URLs stay outside ordinary resident retrieval.

[`evaluation/benchmarks.mjs`](../evaluation/benchmarks.mjs) defines the narrative benchmark. The unified suite adds [other case groups](EVAL_SUITE.md#what-the-cases-cover), including a separate [oracle](../evaluation/datasets/quality-benchmark.json) for 12 exact claims and their supporting source/chunk pairs. These are development fixtures; general-performance claims require an independently authored holdout.

## Reading the metrics

[Applicable-program recall](PROGRAM_RECALL.md) separately measures omissions against a fixed inventory of distinct programs. Its denominator includes missed programs but cannot account for programs outside that inventory.

| Reported metric | What it measures | What it does not establish |
| --- | --- | --- |
| Expected-source hit | At least one reviewer-specified source ID appears | Relevant excerpt, complete answer, or a useful first result |
| Authoritative selection | Registry marks returned sources first-party/official | Current source accuracy or a verified official determination |
| Exact quotation | Quote is a contiguous substring of the referenced chunk | Entailment, surrounding exceptions, or applicability |
| Provenance integrity | Source ID, hash, and available locators match | Live URL reachability or unchanged government content |
| Scoped factual accuracy | The answer status and exact claim set match one authored reference case | Paraphrase accuracy, source truth, current validity, or accuracy on arbitrary questions |
| Citation correctness | Each present claim citation resolves to the authored supporting source/chunk pair and exact claim hash | Semantic entailment beyond the fixed excerpt or surrounding context |
| Citation completeness | Every claim-bearing paragraph in the fixed extractive format has a valid marker | Support for implications a reader draws outside those explicit claims |
| Evidence key-term proxy | Question-specific caveat/term expectations appear | Semantic answer correctness |
| Stale detection | Snapshot age follows the source refresh interval | A page's rules or program status are current |
| Uncertainty | Response uses the expected explicit uncertainty state | Calibration on unseen requests |
| Government routing | Expected official next-step URL is present | Whether a resident can complete an application |
| Location request | Property questions request location confirmation | Geocoding, jurisdiction, parcel, or distance correctness |

**Independent human factual support, unsupported-claim rate, geographic correctness, and next-step usefulness remain null.** GIS calculations and jurisdiction behavior have separate tests; the narrative benchmark does not spatially verify answered properties. Its saved review packets describe the [deterministic baseline](METHODOLOGY.md), not subsequent model-assisted answers.

Null checks mean not applicable, never successful; empty or all-null cases cannot pass. See the [scoring contract](EVAL_SUITE.md#read-the-scores) for independent hash checks, support validation and mutation tests.

## Independent human review

Independent human review remains pending. The development checkout has 30 prepared packets in `evaluation/human-audit/responses.json`; the source package starts with an empty list. After source loading, the [narrative evaluator](EVAL_SUITE.md#narrative-benchmark-and-human-packets) prepares new pending packets, preserves completed judgments and flags changed responses for renewed review. The unified suite does not rewrite review records.

Use the [human review rubric](../evaluation/human-audit/RUBRIC.md). Inspect original sources and surrounding context for exceptions, dates and scope; record the reviewer, date, dimension scores and corrections. Leave unassessable dimensions null with a reason. An unsupported-claim rate requires a substantive-claim inventory and a reported numerator and denominator.

Inaccessible essential actions and materially misleading claims cannot be offset by other passing dimensions. Use the [accessibility checklist](ACCESSIBILITY.md#manual-review-checklist) for keyboard, screen-reader, zoom and resident task assessment. Prepared packets, generated rubrics and model runs do not complete either review.

## Historical agent review

The development archive's 30-response agent review in `evaluation/agent-audit/` identified irrelevant secondary excerpts, a poorly selected PDF passage and arbitrary contact routing, then recorded corrections and limits. UI accessibility and spatial correctness were outside its scope and remained null.

This historical agent evidence is excluded from the source package, is not recreated by ingestion and does not satisfy independent human review.
