# Applicable-program retrieval recall

This benchmark measures omitted **distinct applicable programs**, separately from [claim accuracy and citation quality](EVALUATION.md#reading-the-metrics). Correct quotations can still omit relevant programs.

## September 16, 2026 rerun

The architecture implementation and its subsequent regression repairs were rerun against the same 33-source, 1,044-chunk retained snapshot. Corpus generation, source/chunk hashes, benchmark hash and reference date match the prior selection-improvement report; evaluator and runner versions differ. Retrieval at 15 remains 65/72 pairs (90.3%), final evidence remains 66/72 (91.7%), all ranked candidates contain 72/72, and all 6 controls pass. No execution failures or model calls occurred. Strict mode exited 1 because omissions remain.

The same five questions miss six expected program matches: the St. Petersburg homeless-family question misses a housing-choice voucher; Clearwater homebuyer questions miss SHIP in English and Habitat in Spanish; Pinellas homebuyer misses SHIP; and Pinellas buy-or-rent misses SHIP and a housing-choice voucher. All missing support ranks below the 15-chunk retrieval cutoff. The initial rerun also changed the Pasco senior-electricity answer to insufficient application-status evidence while retaining its LIHEAP citation. The final repair recognizes its request for an alternative program and restores `answered`; the unchanged recall score alone did not reveal that response regression.

The initial reports are preserved in ignored `work/evals/architecture-20260916-recall/`, and the final repair follow-up in `work/evals/regression-repair-final-20260916-recall/`. Their recall stages and omissions match; the Pasco answer-status repair is described above. The separate offline evaluation initially failed 6 of 236 cases; the repaired implementation passes 236/236, all 77 narrative cases and all 12 claim-quality cases with unchanged expectations. See [current evaluation results](RELEASE_READINESS.md#regression-repairs-and-follow-up-evaluation). The historical passing figures below apply only to their earlier runs.

## Program selection improvement

Evidence selection now retains multiple programs per page and relevant programs outside the preferred agency list. It handles multiple needs, explicit exclusions and Spanish punctuation while filtering procurement notices and incompatible water/electric or adult/child programs. Primary excerpts and qualifications remain intact; supplemental quotations stay literal and within eight evidence cards.

The retrieval budget remains **15 chunks**. Both runs use the **same benchmark hash, corpus generation, 18 programs and 72 expected program-query pairs**:

| Metric | Initial baseline | After selection changes |
| --- | ---: | ---: |
| Program recall in top 15 chunks | 63 / 72 (87.5%) | **65 / 72 (90.3%)** |
| Program recall in final evidence | 22 / 72 (30.6%) | **66 / 72 (91.7%)** |
| Positive questions with every expected program in final evidence | 6 / 28 | **23 / 28** |
| Controls passed | 6 / 6 | **6 / 6** |

Final macro recall is 94.9%. English final evidence improves from 20/60 to 55/60 pairs and Spanish from 2/12 to 11/12. Six omissions remain across five questions, with supporting chunks ranked 16, 25, 27, 30, 72 and 74: all below the cutoff. Reviewed source anchors recover one program absent from the raw top 15.

The runtime recognizes mechanisms from source text and headings without loading benchmark labels, program IDs or support hashes. The benchmark is unchanged, but the improvement was developed with knowledge of its failures: **this is not an independent holdout result**. Per-need queries and program diversity are candidates for addressing the remaining cutoff misses.

The improvement measures evidence cards. The deterministic body leads with a primary quotation and includes required details and qualifications. Optional model selection can use up to three quotations while retaining all cards; it falls back when more required quotations are needed. Each card contains one contiguous quotation, and separate facts within a chunk can receive separate cards. These limits, and ambiguous provider scope in generic utility program names, still require relevance and eligibility review.

Validation: **135/135 targeted source tests**, **236/236 offline cases and 4,370/4,370 applicable checks**, including all 12 claim-quality cases; changed JavaScript passed ESLint. Missing dependencies blocked the normal full build/typecheck. The source manifest was subsequently refreshed and verified in a clean tracked-file copy without downloaded data. Live-model and resident-usability checks were not part of this run.

The final report is `work/evals/recall-improvement/final/latest.json` with `latest.md`; the baseline remains in `work/evals/recall-baseline/`. Reproduce the candidate:

```sh
npm run eval:recall -- --corpus-root work/standalone-build-5V7daK --output work/evals/recall-improvement/final
```

## September 13, 2026 baseline

The first measurement used 18 programs, 28 positive questions and 6 controls across six jurisdictions, including five Spanish questions. Its 33-source, 1,044-chunk snapshot was retrieved September 12. All 18 programs had evidence for the 72 expected pairs; all controls passed without execution failures.

| Stage | Found / expected pairs | Micro recall | Questions with every expected program |
| --- | ---: | ---: | ---: |
| Top 3 chunks | 40 / 72 | 55.6% | 11 / 28 |
| Top 6 chunks | 51 / 72 | 70.8% | 15 / 28 |
| Production top 15 chunks | **63 / 72** | **87.5%** | **21 / 28** |
| Top 30 chunks | 69 / 72 | 95.8% | 25 / 28 |
| All ranked chunks | 72 / 72 | 100.0% | 28 / 28 |
| Final evidence | **22 / 72** | **30.6%** | **6 / 28** |

Macro recall was 88.8% at the production cutoff and 39.5% in final evidence. Spanish had 9/12 raw and 2/12 final matches; English had 54/60 and 20/60. These small purposive samples do not support a general language-quality comparison.

**Most baseline loss occurred during answer assembly.** Of 50 final omissions, 43 had supporting evidence in the top 15 and 7 fell below it. Anchors recovered two other raw misses. HOP appeared in retrieval for all nine applicable questions, and SHIP for six of nine; neither appeared in final evidence. They share a Florida Housing page with the Homebuyer Loan Program. Multi-program Pinellas and Pasco pages also lost evidence.

The initial preferred-source filtering, one-passage-per-source selection and small source cap explained the assembly gap addressed above. Raising the retrieval cutoff alone could not recover those losses.

`work/evals/recall-baseline/latest.json` and `latest.md` preserve every miss, rank, breakdown and input/implementation hash. Generated reports and downloaded evidence are excluded from source releases. The commands below evaluate the current implementation against that retained snapshot.

A second agent reran all 34 answers and reviewed the 15 distinct quotations in cases with omissions. It found no alternative passage or overly strict recognition span that changed the score. Human adjudication remains pending, especially for conditional participation and overlapping homebuyer program identities.

Baseline validation passed 75 targeted tests, including 21 recall tests, and ESLint with retained dependencies. Missing active dependencies blocked the full source suite and normal typecheck. Manifest refresh stopped because directory listings reported `.env.example` as a symbolic link; that baseline run did not certify a refreshed package. `--strict` exited 1 on omissions, and the empty active corpus exited 2.

## Run the measurement

```sh
npm run eval:recall
npm run eval:recall -- --corpus-root work/standalone-build-5V7daK --output work/evals/recall-candidate
npm run eval:recall -- --corpus-root work/standalone-build-5V7daK --strict
```

The first command uses the active corpus; the others read the retained development snapshot without activating it and preserve the baseline report. That directory is not shipped. Supply a reviewed corpus root containing `data/corpus.json`, or legacy `data/sources.json` and `data/chunks.json`. An empty source-only checkout reports `not_evaluable`.

The command disables network access and inference, writing `latest.json` and `latest.md` beneath ignored `work/evals/recall/` by default. A completed measurement exits 0 even with omissions. `--strict` exits 1 for a missed program at the production cutoff or in final evidence, or a failed control. Incomplete corpus, execution failure or invalid input exits 2.

New reports include JSON `summary.modelUsage` and a Markdown usage summary: zero provider calls, model tokens and API cost, with status `no_calls`. The [usage contract](EVAL_SUITE.md#token-usage-and-estimated-cost) explains these fields and their limits. Historical reports and scores are unchanged.

## Labels and denominator

[`program-recall-benchmark.json`](../evaluation/datasets/program-recall-benchmark.json) defines the inventory, questions, expected program sets and label rationales. **Applicable** means worth considering for the stated need and place under dated source information; it does not mean household eligibility or open applications. Relevant closed programs are included. Out-of-scope directories, housing listings and navigation services are excluded.

An agent authored labels from retained sources before retrieval, independently of runtime priorities, retrieved results and answers. These development cases await human adjudication and do not represent resident traffic.

For query *q*, let *A(q)* be the authored applicable program set and *R(q, stage)* the programs recognized at that stage:

`recall(q, stage) = |A(q) ∩ R(q, stage)| / |A(q)|`

Each program counts once per query. Micro recall divides matched program-query pairs by expected pairs; macro recall averages positive-query recall. Reports also count queries finding every expected program. Empty applicability sets have null recall and remain separate controls, excluded from both averages.

Recognition requires an allowed source/chunk pair and a recomputed SHA-256 match. Final evidence also needs a literal quotation containing the authored recognition span, stored as offsets and a hash without copied excerpts. Another passage from the same page earns no credit; programs sharing a page count separately.

Missing support stays in the denominator and marks the run `incomplete_corpus`; changed support text invalidates dated labels. Review the benchmark after ingestion changes so corpus loss cannot silently improve recall.

## Stages and omissions

| Stage | Measurement |
| --- | --- |
| `retrieval_at_1`, `_3`, `_6`, `_15`, `_30` | Program recognition in the first *k* ranked chunks after the actual router and retrieval filters |
| `retrieval_all` | Recognition anywhere in the complete filtered, positive-score ranking; diagnoses cutoff losses |
| `answer_evidence` | Program recognition in the evidence cards returned by the guarded application with models disabled |

The production cutoff shares the answer implementation's 15-chunk limit. Evidence assembly can add reviewed anchors outside those candidates; reports list recovered retrieval misses separately.

Each omission records its first retrieval rank and earliest gap: missing evidence, filtered/unmatched retrieval, cutoff loss, selection/quotation loss, or execution failure. These locate failures without guaranteeing that one stage change will recover a program. JSON adds program, jurisdiction, language and query-tag breakdowns and unexpected references. Those references are not precision or eligibility scores: explanations may correctly exclude a named program, and controls can allow that.

Reports include corpus, benchmark, evaluator, runner and application hashes, evaluation date, Node version and disabled network/model settings. They exclude source text and full answers.

## What this does not establish

Recall is bounded by the inventory and retained pages. It cannot detect missing inventory entries, prove availability or eligibility, or measure recommendation quality and resident usefulness. Next steps are independent human review of program identities, relevance and qualifications, then broader resident questions authored independently of implementation choices.

[`evaluation-recall.test.mjs`](../tests/evaluation-recall.test.mjs) tests duplicate inflation, wrong passages, multiple programs per source, cutoff loss, anchor recovery, truncated quotes, deleted evidence, controls, execution failures and weighting. Its synthetic evidence runs in the source regression suite without downloads.
