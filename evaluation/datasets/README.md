# Evaluation datasets

JSON inputs for evaluation live in this directory. Evaluator code remains in the parent directory and `../suite/`.

| File | Purpose | How it is maintained |
| --- | --- | --- |
| [ground_truth_questions.json](ground_truth_questions.json) | The 20 user-provided questions, in their original order. This is a question-only list with no reference answers or scoring labels; it is not yet wired into an automated suite. | Preserve the question text as supplied. |
| [benchmark.json](benchmark.json) | Narrative navigation cases with expected routing, evidence and uncertainty behavior. | Generated from [benchmarks.mjs](../benchmarks.mjs) by `npm run evaluate` after loading a reviewed corpus. Edit the module rather than this JSON export. |
| [quality-benchmark.json](quality-benchmark.json) | Authored reference claims, exact claim hashes and allowed source/chunk support for the quality suite. | Review labels against the retained corpus before changing expectations. |
| [program-recall-benchmark.json](program-recall-benchmark.json) | A bounded program inventory, questions and expected applicable-program sets for `npm run eval:recall`. | Review program evidence and applicability labels together. |

Generated reports remain in `../results/`, `../suite/results/` and, for program recall, `work/evals/recall/` at the project root. Human review materials remain in `../human-audit/`.

See the [evaluation methodology](../../docs/EVALUATION.md), [suite guide](../../docs/EVAL_SUITE.md) and [program recall guide](../../docs/PROGRAM_RECALL.md) for commands and interpretation.
