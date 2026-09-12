# Human review of ParcelPrivateer answers

**Status: not performed.** Thirty representative responses are saved in `responses.json` for a named human reviewer. Every score and reviewer field is null. Four benchmark scenarios use clearly labeled synthetic data to exercise failure handling; these are not government facts.

The user requested approximately 25–50 manually audited responses. Preparing artifacts and running automated checks does not complete that requirement. An agent may review code or outputs, but must label that work as an agent review and must not fill human review fields.

For each saved response, open every original source and its preserved snapshot, read enough surrounding material to check exceptions and dates, and inspect the product at the supported viewport sizes. Record reviewer name, review date, a score per dimension, and concrete notes. Use `null` with an explanatory note for a dimension that cannot be evaluated; do not treat it as a pass.

| Dimension | 0 — unacceptable | 1 — revision needed | 2 — acceptable |
| --- | --- | --- | --- |
| Factual correctness | False, invented, or materially misleading claim | Ambiguous detail or incomplete caveat | Claims match the current source and relevant scope |
| Evidence quality | Wrong agency or unrelated evidence | Relevant page but poor excerpt or missing source | Appropriate authoritative evidence, with limitations |
| Citation support | Claim not supported or quotation altered | Incomplete locator, quote, or adjacent qualification | Exact, relevant quote and traceable provenance |
| Plain language | Unexplained jargon or hard to follow | Understandable with unnecessary complexity | Short, clear, resident language |
| Completeness | Omits a material limitation or requested next step | Gives a partial path with a clear limitation | Gives the available answer or explains the gap and path |
| Uncertainty calibration | Makes unsupported eligibility or official claims | Caveats vague, excessive, or poorly placed | States the actual uncertainty at the right point |
| Accessibility/usability | Essential path inaccessible | Usable with avoidable barriers | Keyboard and screen-reader path clear; map has text equivalent |
| Geographic correctness | Wrong jurisdiction, property, or implied spatial rights | Geographic detail needs verification | Correct location/scope or explicitly unresolved |
| Next-step usefulness | Wrong or unusable resource | Relevant directory but action unclear | Resident can identify a concrete official action |
| Misleading wording | Implies guarantee, endorsement, construction, or permission | Wording could create a mistaken inference | Distinguishes source text, judgment, and observed records |

For claim review, list each substantive claim in the answer and explanation. Mark it supported, unsupported, or not a factual claim. Evaluate quoted claims in context: an exact quote from an irrelevant page is not adequate support. Include exception handling, current availability, and time-sensitive contact information. Compute unsupported-claim rate only after this claim inventory exists, as unsupported substantive claims divided by all substantive claims reviewed; report both counts and distinguish uncertainty from falsehood.

Do not publish a single aggregate “AI accuracy” score. Report each dimension, the sample size, unrated items, serious failures, and corrective actions separately. Any fabricated program, fabricated citation, unsupported official approval, wrong-jurisdiction recommendation, or inaccessible essential action is a release blocker even when other dimensions score well.

Mark completed rows `review_status: "reviewed_by_human"`. Running the evaluation script preserves completed review rows and flags whether their saved response changed; review changed responses again. A production release requires this human review and the separate accessibility checklist in `ACCESSIBILITY.md`.
