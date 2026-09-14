# Applicable-program retrieval recall

Program omission is measured separately from factual accuracy and citation quality. An answer can quote a source correctly while missing other relevant programs. This benchmark counts **distinct applicable programs**, not matching pages or passages.

## Program selection improvement

The implementation now retains distinct program descriptions from retrieved housing passages, including multiple programs on one page and relevant programs outside the preferred agency list. It recognizes multiple stated needs, respects explicit exclusions, and improves Spanish matching, including sentence punctuation. Existing primary excerpts and their qualifications remain intact; supplemental evidence stays within eight cards and uses literal quotations. Generic procurement notices and clearly incompatible water/electric or adult/child program descriptions are filtered.

The production retrieval budget remains **15 chunks**. The following comparison uses the **same benchmark hash, corpus generation, 18 programs and 72 expected program-query pairs** as the initial baseline:

| Metric | Initial baseline | After selection changes |
| --- | ---: | ---: |
| Program recall in top 15 chunks | 63 / 72 (87.5%) | **65 / 72 (90.3%)** |
| Program recall in final evidence | 22 / 72 (30.6%) | **66 / 72 (91.7%)** |
| Positive questions with every expected program in final evidence | 6 / 28 | **23 / 28** |
| Controls passed | 6 / 6 | **6 / 6** |

Final macro recall is 94.9%. English final evidence improves from 20/60 to 55/60 program-query pairs and Spanish from 2/12 to 11/12. These are small development samples. The six remaining final omissions occur in five questions; their first supporting chunks rank 16, 25, 27, 30, 72 and 74. All are below the current retrieval cutoff. Reviewed source anchors recover one program absent from the raw top 15.

The runtime uses source text and headings to recognize mechanisms; it does not load benchmark labels, program IDs or support hashes. The benchmark itself is unchanged, but this is still an improvement developed with knowledge of its failures, **not an independent holdout result**. The next checks should use separately authored resident questions and a human review of relevance, eligibility qualifications and program identity. A future retrieval change can test per-need queries and program diversity to address the remaining cutoff misses.

This improvement measures the evidence cards available to the resident. The deterministic answer body still leads with one primary quotation; optional model selection can use up to three quotations while retaining the evidence cards. More evidence is not itself proof of a complete recommendation or correct eligibility filtering. Long passages still permit only one contiguous quotation per chunk, and a generic utility program's provider scope cannot be inferred from its name alone.

Validation after the final change: **135/135 targeted source tests**, **236/236 offline evaluation cases and 4,370/4,370 applicable checks**, including all 12 authored claim-quality cases; changed JavaScript passed ESLint. The active checkout's incomplete dependencies still prevent the normal full build/typecheck workflow, and its existing symbolic link prevents source-manifest refresh. No live model or resident-usability result is claimed.

The final detailed report is `work/evals/recall-improvement/final/latest.json` with `latest.md`; the preserved initial report remains `work/evals/recall-baseline/latest.json`. Reproduce the candidate separately:

```sh
npm run eval:recall -- --corpus-root work/standalone-build-5V7daK --output work/evals/recall-improvement/final
```

## September 13, 2026 baseline

The first measurement used 18 programs, 28 positive questions and 6 controls across all six supported jurisdictions, including five Spanish questions. The 33-source, 1,044-chunk snapshot was retrieved on September 12. There are 72 expected program-query pairs; all 18 programs have evidence. All six controls passed and there were no execution failures.

| Stage | Found / expected pairs | Micro recall | Questions with every expected program |
| --- | ---: | ---: | ---: |
| Top 3 chunks | 40 / 72 | 55.6% | 11 / 28 |
| Top 6 chunks | 51 / 72 | 70.8% | 15 / 28 |
| Production top 15 chunks | **63 / 72** | **87.5%** | **21 / 28** |
| Top 30 chunks | 69 / 72 | 95.8% | 25 / 28 |
| All ranked chunks | 72 / 72 | 100.0% | 28 / 28 |
| Final evidence | **22 / 72** | **30.6%** | **6 / 28** |

Macro recall is 88.8% at the production cutoff and 39.5% in final evidence. The five Spanish questions have 9/12 raw matches and 2/12 final evidence matches; English has 54/60 and 20/60. These small purposive samples do not establish a general language-quality comparison.

**Most observed loss happens while assembling the answer.** Of the 50 final omissions, 43 had supporting program evidence in the top 15 and 7 were below that cutoff. Anchors recovered two other raw misses. For example, HOP appears in retrieval for all nine applicable questions and never appears in final evidence; SHIP appears in six of nine retrievals and none of the final evidence sets. Both share the Florida Housing source with the Homebuyer Loan Program. Program evidence is also lost from multi-program Pinellas and Pasco pages.

This matched the initial implementation's preferred-source filtering, one-passage-per-source selection and small source cap. Raising the raw cutoff alone could not address those losses. The selection changes above address the observed assembly gap; the remaining cutoff omissions still need work.

The complete local report is `work/evals/recall-baseline/latest.json` with a readable companion `latest.md`, including every missed program, rank, breakdown and input/implementation hash. These generated files and downloaded evidence are intentionally excluded from source releases. Reproduce the baseline with the retained snapshot command below.

A second agent reran all 34 answers and reviewed the 15 distinct evidence quotations appearing in cases with omissions. It found no unannotated alternative passage or overly strict recognition span that would change the final-evidence score. This is an agent audit; independent human adjudication remains pending, especially for conditional participation requirements and potentially overlapping homebuyer program identities.

Validation: all 75 targeted evaluator, resident-workflow, citation-scoring and source-release tests passed, including 21 recall tests. Changed JavaScript passed ESLint using the retained local dependency installation. The full source suite and normal typecheck could not complete with the active checkout's missing dependencies. The source-release manifest refresh separately stopped at the existing `.env.example` symbolic link; this measurement does not certify a refreshed release package. `--strict` correctly exited 1 on omissions; the empty active corpus exited 2.

## Run the measurement

```sh
npm run eval:recall
npm run eval:recall -- --corpus-root work/standalone-build-5V7daK --output work/evals/recall-candidate
npm run eval:recall -- --corpus-root work/standalone-build-5V7daK --strict
```

The first command uses the active corpus. The second selects the locally retained development snapshot and runs the current implementation into a separate candidate report, preserving the historical baseline. That corpus directory is not shipped with the source release. Supply your own reviewed corpus root containing `data/corpus.json`, or legacy `data/sources.json` and `data/chunks.json`. Evaluation reads that corpus without activating it. A fresh source-only checkout has no evidence and reports `not_evaluable`, not a successful zero-case score.

The command disables network access and model inference. It writes `latest.json` and `latest.md` beneath ignored `work/evals/recall/` by default. A successful measurement exits 0 even when it discovers omissions. `--strict` exits 1 for any missed expected program at the production retrieval cutoff or in final evidence, or a failed control. An incomplete corpus, execution failure or invalid input exits 2.

## Labels and denominator

[`program-recall-benchmark.json`](../evaluation/program-recall-benchmark.json) contains a finite inventory, independently authored questions, expected program sets and a rationale for each applicability label. Here, **applicable** means worth considering for the stated need and place under the dated source information. It does not mean a household qualifies or that applications are open. The inventory includes relevant closed programs so that their limitations can be surfaced. General directories, housing listings and navigation services outside the declared scope do not enter the denominator.

The labels were authored by an agent reading the retained source material before running retrieval. They were not obtained from runtime priorities, retrieved results or generated answers. Independent human adjudication remains pending. These are development cases, not a blind holdout or a representative sample of resident traffic.

For query *q*, let *A(q)* be the authored applicable program set and *R(q, stage)* the programs recognized at that stage:

`recall(q, stage) = |A(q) ∩ R(q, stage)| / |A(q)|`

Each program counts once per query, regardless of how many sources or chunks mention it. Micro recall divides total matched program-query pairs by total expected pairs. Macro recall averages the recall of positive queries. Reports also show how many queries retrieve every expected program. Queries with an empty applicability set have null recall and cannot inflate either average; they are reported as separate controls.

Every recognized program requires an allowed source/chunk pair and a recomputed SHA-256 matching the benchmark. Final evidence also needs a literal quotation containing the authored program recognition span. The span is stored as offsets and a hash, so the benchmark does not redistribute source excerpts. Merely returning another passage from a program's page receives no credit. Two programs on the same page are scored separately.

Missing support remains in the fixed denominator and makes the run `incomplete_corpus`; changed text at an existing support ID invalidates the dated labels. This prevents corpus loss from silently improving recall. It also means the benchmark must be reviewed deliberately after ingestion changes.

## Stages and omissions

| Stage | Measurement |
| --- | --- |
| `retrieval_at_1`, `_3`, `_6`, `_15`, `_30` | Program recognition in the first *k* ranked chunks after the actual router and retrieval filters |
| `retrieval_all` | Recognition anywhere in the complete filtered, positive-score ranking; diagnoses cutoff losses |
| `answer_evidence` | Program recognition in the evidence cards returned by the guarded application with models disabled |

The production cutoff is shared with the answer implementation, currently 15 chunks. Evidence assembly can inject reviewed anchors that were not in those candidates, so final evidence can recover a raw retrieval miss. Reports list those recoveries separately.

Each final omission identifies its first retrieval rank and the earliest observed gap: missing corpus evidence, filtered or unmatched retrieval, below the production cutoff, answer selection/quotation loss, or answer execution failure. These are diagnostic locations, not claims that fixing a single stage would necessarily recover the program. JSON also provides per-program, jurisdiction, language and query-tag breakdowns, plus unexpected program references. Those references are not a precision or eligibility score: a correct explanation can mention a program to exclude it. Controls can explicitly allow such references.

Reports record corpus, benchmark, evaluator, runner and application hashes; the evaluation date; Node version; and the disabled network/model settings. Raw source text and full answers remain outside the reports.

## What this does not establish

This is recall within the declared program inventory and retained pages. It cannot detect programs absent from that inventory, prove current availability, establish household eligibility, measure the prose's recommendation quality, or replace resident usefulness testing. Programs outside the current source collection remain an unresolved coverage risk. The next validation step is an independent human review of the inventory and scenario labels, followed by a broader set of resident questions collected independently of implementation choices.

`tests/evaluation-recall.test.mjs` uses original synthetic evidence to test the evaluator itself, including duplicate inflation, wrong passages on the right page, multiple programs per source, cutoff losses, anchor recovery, truncated quotes, deleted evidence, empty controls, execution failures and micro/macro weighting. It runs with the source regression suite without requiring downloaded evidence.
