# Answer architecture

The answer path is a deterministic pipeline over reviewed evidence. HTTP routes remain thin, property and development tools still require confirmed locations, and the optional model can only select validated quotations from the completed baseline.

```text
resident question / bounded conversation context
  -> QueryPlan (intent, jurisdiction, geography, entities, requested facts, risk)
  -> jurisdiction-scoped corpus
  -> evidence eligibility -> lexical candidates -> ranking
  -> source section preferences + factual details + critical qualifications
  -> literal citations + uncertainty state + explicit coverage
  -> optional validated model selection, or the baseline
```

## Responsibilities

| Boundary | Implementation | Responsibility |
| --- | --- | --- |
| Query analysis | `src/lib/core/query-plan.mjs`, `core/routing/` | Independent normalization, intent, location, decision, entity and requested-fact signals. `routeQuestion()` remains a compatibility API. |
| Source semantics | `src/lib/domain/source-policies.mjs`, `domain/answer-policy.mjs` | Reviewed section vocabulary, ordered preferences, supplemental sections and source ranking preferences. No factual answer text is supplied by a policy. |
| Structured facts | `src/lib/domain/facts.mjs` | Conservative annotations with program ID, source ID, chunk ID, explicit value, and literal supporting quotation. Unknown wording stays unclassified. |
| Corpus policy | `src/lib/retrieval/scope.mjs`, `retrieval/eligibility.mjs` | Registry membership, jurisdiction coverage, common evidence safety, topic eligibility, authority and freshness. |
| Retrieval | `retrieval/candidates.mjs`, `retrieval/ranking.mjs` | Lexical matching and separately inspectable scoring. `search.mjs` composes these stages and retains existing exports. |
| Answer assembly | `src/lib/core/answer.mjs`, `core/answer/` | Orchestration, source selection, qualifications, coverage, next steps and response states. No municipality-specific source identifiers in assembly. |
| Citation boundary | `src/lib/citations/evidence.mjs` | Registered source/chunk relationship, safe URL, exact substring, provenance and same-program conflicts. |
| Model boundary | `src/lib/llm/`, `src/lib/guardrails/` | Credential isolation, bounded evidence selection, required qualifications and deterministic fallback. |

`QueryPlan.query` is the resolved query used for matching. `originalQuery` can preserve the resident's unexpanded text. A detected program or place is a query hint, never evidence of eligibility or a parcel boundary.

Requested facts distinguish application method and program discovery from availability. "Can I apply in person?" and "How do I open the application portal?" can use application instructions without asserting intake is open. "Which program can I apply to instead?" asks for an alternative program. "Can I apply now?" or an explicit open/closed question requires an availability statement; combining discovery or method with current status retains that requirement.

Conversation handling uses the same registry entity resolution. Naming another program replaces the previous program preference; configured aliases also provide a source-specific retrieval signal after jurisdiction and evidence eligibility checks. A recognized name alone can supply a missing subject when its scoped registry sources identify exactly one supported subject. It cannot override an explicit different subject, an excluded request or geographic coverage. Aliases match complete normalized phrases, not isolated alias words, and do not expand another source's scope.

## Adding source semantics

The reviewed [source registry](../data/sources.json) uses `source_id`, `canonical_url`, `source_type` and fetch selectors to identify the publisher and acquisition configuration. `jurisdiction_ids` limits resource scope, `categories` controls subject eligibility, and `refresh_days` governs snapshot staleness. County membership alone does not admit a source for every city in that county. Add or change definitions through the [reviewed source-update workflow](SOURCE_UPDATES.md); registration alone does not supply usable evidence.

A registered source participates in retrieval without custom answer rules. Supply `program_id` and `entity_aliases` when a program has stable names across sources. Otherwise facts use `topic_id`, falling back to `source_id`; a multi-program directory is not an exhaustive program inventory. Registry descriptions, notes, titles and aliases are matching/configuration metadata, not factual evidence of availability, benefit amounts or income limits. Those values must come from literal source chunks.

A source can optionally declare a JSON-compatible `answer_policy` in its reviewed registry metadata:

```json
{
  "sections": [
    { "id": "availability", "pattern": "Applications are paused" },
    { "id": "overview", "pattern": "The program assists renters" }
  ],
  "preferredSections": [
    { "when": "applications", "sections": ["availability"] },
    { "sections": ["overview"] }
  ],
  "supplementalSections": [
    { "section": "availability", "selectedOnly": true }
  ]
}
```

Registry strings match literal text without case sensitivity. The first matching preference applies. Policies locate existing quotations; they cannot invent a fact, admit another jurisdiction, accept assistant-directed instructions, or turn a bare heading into a primary answer. A short explicit qualification may supplement an admitted source. Legacy source wording is collected in the domain policy catalog, where it can gradually be replaced by semantic section metadata. If wording changes, an unmatched preference falls back to eligible lexical evidence.

Short numbered instructions can be primary evidence when a title, section or page supplies context and the step contains a recognized action and object, such as "Step 1.Visit the agency portal." A step number alone, "Step1.Application" or "Home" does not qualify. This narrow admission rule retains the ordinary source-identity, jurisdiction and hostile-text checks; a declared policy cannot bypass them.

Ingestion annotates chunks with `answer_sections` and `facts`. Fact types currently include application status, income limits, effective year, benefit amount, eligibility, assistance restrictions and contact details. These are conservative extraction rules, not a complete civic ontology. Dates must appear in quoted text; download dates and nearby heading metadata cannot establish effective dates. Recognized conditional, projected, negated and interrogative status wording is excluded; these rules do not provide general temporal or language understanding.

Recognized dollar amounts are excluded from effective-year extraction. Years, recognized calendar dates and household-size counts label income information but do not themselves supply a numeric income limit; a year heading also cannot date an adjacent row. Present-tense advisory notices such as "Until further notice, applications are closed" retain their explicit status. Narrative strings in structured records use the same extraction rules while preserving the complete literal serialized record as evidence, including escaped characters. Ingestion records `locator.starts_at_sentence_boundary` for continuation chunks; validation checks it against the preceding chunk in the same source unit. Complete first sentences can then survive without turning a split negation into a positive status. Unknown legacy boundaries remain conservative.

Annotations do not change chunk text, IDs, raw hashes or normalized text hashes. They are included in the immutable corpus generation. Publication validates annotations against the underlying evidence and current policy. Old generations without annotations remain readable and verifiable; missing legacy boundary annotations do not become trusted boundaries during verification. Runtime fact access rederives semantics, so forged metadata with a real quote cannot introduce a different meaning.

Source-policy or extractor changes must be checked against already annotated generations before deployment. If current derivation no longer matches a saved annotation, corpus loading fails; ordinary offline staging also validates the active generation and is not an automatic migration mechanism. Such a change needs a reviewed corpus migration and a compatible code/corpus rollback plan. Do not edit immutable archived generations to suppress validation errors.

## Shared invariants

| Invariant | Enforcement |
| --- | --- |
| Jurisdiction isolation | `scopeCorpus()` precedes retrieval, source preferences, conflicts and links. GIS confirmation remains separate. |
| Evidence provenance | `evidenceSafetyReason()` checks source/chunk identity and text. Ingestion validates digests; citation construction keeps exact source substrings and safe URLs. |
| Consequential decisions | The decision signal produces `consequentialDecision`; answer response policy refuses official eligibility, legal and property determinations. |
| Untrusted-source isolation | Retrieval, manual evidence selection, conflict detection and final citations use the same instruction-text policy. |
| Credential secrecy | Guarded orchestration never passes configured credentials to extension hooks or evidence prompts. |
| Model cannot introduce evidence | Selection requires baseline IDs and exact complete quotations; required factual details and qualifications cannot be dropped. Invalid output returns the baseline. |

Narrative admission and qualification admission serve different roles. Both enforce the same hard safety boundary. A supplemental explicit restriction can remain useful even when it is too short to be a primary narrative passage.

Fact-focused citations preserve exact source spans within the 720-character quotation limit; an invalid supplied span fails closed. Distant amounts, closures and restrictions receive separate required citations even when they share a chunk ID. Requests for amounts, fees, durations, deadlines, application status or income limits retain distinct recognized qualifications from all matching chunks of the primary source, while identical qualification statements are deduplicated. Conflicts cite the opposing status statements from authoritative snapshots within their refresh intervals. If an essential qualification or an opposing status cannot fit a valid quotation, the answer reports insufficient evidence and optional model generation cannot bypass that result.

A historical income-year request retains its explicit year when "today" belongs to a separate application-status clause: "What were the 2025 housing income limits, and are applications open today?" still asks for the 2025 table. Asking whether the 2025 income limits can be used today instead requires income evidence for the current UTC year. Current-income requests without an explicit year also use the current UTC year; multiple distinct requested years are not interpreted as a comparison. The requested table must appear in the actual answer quotation. Finding a current table elsewhere cannot validate an older quoted amount. A dated heading can support an outdated-table caution, but cannot supply missing limit values. Unresolved application-status conflicts retain priority over income-date checks.

The optional selector accepts at most eight evidence entries and can select one to three complete quotations. Every required evidence ID, including the first entry, must survive. A baseline needing more than three required entries remains a deterministic answer rather than dropping qualifications to fit the model contract.

## Diagnosis and coverage

`retrieve(...).diagnostics` exposes scope/eligibility rejections with stage and reason, eligible chunks that did not match, lexical candidates, all ranks, and which ranks survived the limit. These traces contain IDs and scores, not quarantined text. They distinguish policy rejection, recall misses and rank cutoff from later answer selection.

Every deterministic answer carries `coverage` with `kind: "retrieved_resources"`, `exhaustive: false`, the resource jurisdiction and category, scoped registry source count and cited source count. The registry count includes definitions tagged for that subject even if their evidence has not been fetched; the cited count measures distinct cited source IDs. The resident interface displays the coverage statement with evidence; localization and optional model selection preserve it. Counts describe sources, not verified program recall. No current code path claims to enumerate every applicable program.

## Compatibility and verification

Core modules remain executable Node ESM for offline ingestion, evaluation and source-only tests. Public declaration files are updated alongside the implementation. A repository-wide TypeScript migration is deferred; it is separate from the domain-boundary refactor and would change the script execution/build contract.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:source:browser`. Architecture, query-plan, retrieval-pipeline, domain-fact, answer-fact, citation-qualification, program-context and income-selection tests use synthetic sources. Historical populated-corpus benchmarks still require reviewed snapshots; passing source tests does not establish completeness or resident usefulness.

Routing, retrieval, citation and answer-policy changes also need the [populated-corpus regression gate](DEVELOPMENT.md#behavior-change-regression-gate). An empty source-only checkout cannot establish those results. Preserve report provenance, inspect changed quotations and decisions, and review expectations independently rather than updating an oracle to match output automatically.
