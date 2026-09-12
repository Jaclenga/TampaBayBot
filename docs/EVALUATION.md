# Evaluation and review

This guide explains what ParcelPrivateer's evaluations measure and how human review complements them. [EVAL_SUITE.md](EVAL_SUITE.md) is the command and report-format reference. [Release readiness](RELEASE_READINESS.md) records dated results, environments and unresolved checks; this guide does not maintain a second results scoreboard.

The source-only distribution initially contains no evidence or completed evaluation. Its empty reports mean `not_run`, not zero-error success. Load and review a corpus before running the complete evaluations. The [distribution guide](DISTRIBUTION.md) explains why a fresh download can differ from the historical development snapshots.

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

Real local Ollama testing has been recorded in [OLLAMA_TESTING.md](OLLAMA_TESTING.md). Those results describe the named Meta model, corpus and machine; they do not retroactively turn synthetic tests or baseline response packets into model-quality evidence.

## Benchmark design and reference date

The narrative evaluator uses preserved sources and a fixed reference date from `evaluation/scenarios.mjs`. This makes a retained development corpus reproducible as it ages. Runtime answers use the actual current time and flag snapshots older than each registry refresh interval. Refreshing a corpus requires deliberate review of the reference date and changed expectations.

There are **77 hand-authored questions**, spanning housing (28), zoning (16), permitting (11), development (10), and navigation (12). They cover ordinary language, misspellings, vague questions, missing definitions, invented programs and ordinances, current/old source content, conflicting availability, unavailable sources, malicious documents, unsupported eligibility and legal judgments, malformed/incomplete locations, and irrelevant requests. Four cases use synthetic scenario data. Fixture agencies and `.invalid` URLs are labeled test material and do not enter ordinary resident retrieval; they can appear in evaluation artifacts.

[`evaluation/benchmarks.mjs`](../evaluation/benchmarks.mjs) is the editable narrative benchmark definition. The unified suite adds guardrail, provider-contract, repeatable input/corpus-variation and claim-quality cases around it. [`evaluation/quality-benchmark.json`](../evaluation/quality-benchmark.json) is a separate, checked-in oracle for 12 exact extractive claims and their allowed source/chunk support. Both sets are hand-authored development fixtures. A fresh independently authored holdout is needed before claims about general performance. File destinations and regeneration commands are listed in the [suite guide](EVAL_SUITE.md).

## Reading the metrics

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

The scoped automated metrics cover 12 dated exact-claim cases across six Tampa Bay jurisdictions. **Independent human factual support, unsupported-claim rate, geographic correctness, and next-step usefulness remain null.** The evaluator does not disguise exact hashes and authored support pairs as an open-ended semantic claim audit. Geographic calculations and jurisdiction behavior have separate meaningful tests in the GIS module; no answered property in this narrative benchmark is treated as spatially verified.

The narrative benchmark and saved review packets describe the deterministic baseline defined in [methodology](METHODOLOGY.md). Enabling a provider does not validate new model-assisted output against those older packets. Evaluate each chosen model/version separately, recording configuration, accepted selections, fallback rate, latency, failures and human usefulness without retaining resident prompts. The [model guide](LLM.md) explains provider disclosure and configuration; [live-evaluation commands](EVAL_SUITE.md#evaluate-an-explicitly-configured-model) explain the run contract.

Null checks mean not applicable, never successful. Empty or all-null cases cannot pass. The scorers check rendered quotations, independently recompute chunk hashes, and validate authored claim/support pairs before evaluation. Mutation tests deliberately introduce fabricated text, misattribution, missing citations, partial coverage and damaged provenance. The [scoring contract](EVAL_SUITE.md#read-the-scores) describes those safeguards. Literal matching still cannot determine semantic relevance or source truth.

## Independent human review

The development checkout has 30 prepared response packets in `evaluation/human-audit/responses.json`. Independent human review has not been completed. The public source package excludes those copied answers and starts with an empty packet list; running the narrative evaluator after source loading prepares new pending packets. A prepared response, a generated rubric or a successful model run is not a completed review.

The [human review rubric](../evaluation/human-audit/RUBRIC.md) is the canonical scoring worksheet. Reviewers must inspect original sources and enough surrounding text to assess exceptions, dates and scope; record the reviewer, date, dimension scores and concrete corrections. Unassessable dimensions remain null with a reason. Complete a substantive-claim inventory before calculating an unsupported-claim rate, and report its numerator and denominator rather than an aggregate “AI accuracy” score.

The narrative evaluator preserves completed human judgments and flags responses changed since review. The unified suite does not rewrite those packets or treat pending rows as completed. Changed responses need renewed review; inaccessible essential actions and materially misleading claims cannot be offset by other passing dimensions. The separate [accessibility checklist](ACCESSIBILITY.md#manual-review-checklist) covers keyboard, screen-reader, zoom and resident task assessment.

## Historical agent review

The development archive retains an explicitly labeled 30-response agent review under `evaluation/agent-audit/`. It identified irrelevant secondary excerpts, a poorly selected PDF passage and arbitrary contact routing, then recorded corrections and remaining limits. UI accessibility and spatial correctness scores were left null because those were outside that inspection.

This is historical agent evidence, excluded from the source-only package and not automatically recreated during ingestion. It does not satisfy independent human review. Current release status and outstanding actions remain in [release readiness](RELEASE_READINESS.md).
