# TampaBayBot methodology

TampaBayBot combines deterministic routing, lexical retrieval, literal excerpts and official next-step links. Optional model selection, geographic queries and development records add context. This guide describes a populated installation; the source-only alpha reports unavailable evidence until an operator [loads and reviews sources](DISTRIBUTION.md).

## Resident question to next step

1. Accept an ordinary housing question or address without requiring a department selection.
2. Build a deterministic QueryPlan for housing, zoning, permitting, observed development or agency navigation, including entities, requested facts and decision risk. A registered program name or alias can supply a missing subject within its declared jurisdiction; naming another program in a follow-up replaces the previous source preference. Resolve a selected or explicitly named city/county; missing or conflicting resource areas require clarification. Street names and mailing addresses do not establish property jurisdiction.
3. Filter sources by explicit `jurisdiction_ids` before retrieval, conflict checks, housing navigation and official next steps. Missing scope metadata fails closed; county membership never implies city program coverage. Rank the allowed chunks with a small reproducible BM25-style lexical index, category restrictions and authority weighting.
4. Select literal source substrings of at most 720 characters. Preserve the statements that establish requested facts and recognized application qualifications, using separate citations when they are distant within one chunk. Every evidence item resolves to a registry source, a raw response and a section, page, record or layer where available.
5. Describe what can be verified, show uncertainty and route to an official next step. Coverage explicitly describes retrieved resources and never claims an exhaustive list. Housing resources are potential matches; eligibility remains an agency decision.
6. When location matters, require a selected address candidate and query the jurisdiction and property layers. Show observed development separately from regulatory designations.

Application-method questions such as "Can I apply in person?" can be answered from instructions; "Which program can I apply to instead?" asks for an alternative program. Neither implies a request to verify whether intake is open. Explicit current-availability wording, including "Can I apply now?", still requires status evidence even when the question also asks how to apply or which program to consider. Short contextual numbered steps with a recognized action and object can supply instructions; bare step labels and headings cannot.

Optional model assistance can select validated evidence for an `answered` result. It must preserve every required evidence ID and copy each selected quotation in full; omitting a required amount or qualification returns the deterministic baseline. A baseline requiring more than the selector's three-quotation limit also remains deterministic. The [provider contract](LLM.md#what-a-model-receives-and-can-change) defines selection and data transfer. Built-in checks and additive operator [guardrails](GUARDRAIL_INSERTS.md) can reject input or suppress model use, but cannot authorize unsupported evidence or rewrite the answer contract.

Resource scope and property-boundary coverage are separate: adding a source or selecting a city does not establish GIS coverage. See [source coverage](DATA_SOURCES.md) and the [architecture](DEVELOPMENT.md#architecture-and-code-layout) for configuration and module responsibilities.

## Ingestion and evidence reconstruction

Ingestion reads reviewed registry sources, fetches bounded HTTPS responses without following redirects, checks HTTP status, archives original bytes by SHA-256 and creates normalized chunks. Included public sources need no credentials. The [source-update workflow](SOURCE_UPDATES.md) stages a candidate for review and approval before applying evidence; downloads never replace the active corpus automatically. Parsing and chunking run in a terminable Node worker with a deadline and V8 heap limits. Incremental byte, unit, link and chunk budgets reject oversized results before serialization or publication; that workflow documents the exact limits and failure codes.

The [command reference](DEVELOPMENT.md#commands-and-evidence-prerequisites) covers full-source/single-source fetches and offline/check modes. The latter require preserved responses and cannot populate an empty package. New content can invalidate historical benchmark expectations. The npm command enables Node's system certificate store without disabling TLS verification.

Supported adapters:

| Format | Normalization and locator |
| --- | --- |
| HTML | Cheerio selects reviewed article/content containers, removes executable markup and navigation, decodes HTML entities, normalizes visible whitespace, and retains paragraphs, lists, table rows and factual headings. Outer list items, table rows and address blocks own their descendant text, preventing repeated copies from nested blocks. Heading text / anchor and unit offsets are preserved. |
| PDF | `pdf-parse` extracts text separately for each physical page; page numbers begin at 1. Scanned PDFs with no text fail rather than creating invented OCR. |
| CSV | Quoted CSV fields, commas, escaped quotes and newlines are parsed; values stay strings so leading-zero IDs are retained. Duplicate headers, unterminated quoted fields and field-count mismatches fail. Each record retains a CSV row locator. |
| JSON | Structured records serialize with `JSON.stringify` and retain record IDs where provided. Without an explicit ID, the array position is the locator. Object keys are not sorted into a canonical order. |
| ArcGIS REST | API errors and transfer-limit truncation fail; attributes and record/layer identifiers are retained. Current corpus snapshots are metadata; live feature queries belong to the GIS module. |
| GeoJSON | Feature properties, identifiers and geometry are preserved; the coordinate reference and actual feature meaning must be verified for any added source. |

Ingestion does not discover domains, execute webpage code, follow forms, bypass access controls or infer APIs. New ArcGIS bulk sources need a bounded query or separately reviewed pagination; truncated responses are never accepted as complete.

Chunks respect normalized units and PDF/record boundaries, splitting long units at a word boundary near 1,400 characters. Chunk `text` is an exact substring of a normalized unit, after whitespace/entity normalization or JSON serialization; it need not occur byte-for-byte in HTML markup or PDF binary. Chunk `content_hash` hashes that text; `raw_content_hash` links to the registry's source-byte hash. `locator.unit_index`, `text_start` and `text_end` reproduce the excerpt.

Chunks also carry conservative structured facts and source-section annotations, each tied to literal evidence. They preserve existing text hashes and numeric locator offsets. The added `locator.starts_at_sentence_boundary` records whether the first sentence is complete; corpus validation checks continuation boundaries against preceding evidence. An unknown legacy boundary leaves the first fragment unclassified instead of assuming a split negation is a positive statement.

Application status, restrictions and effective-year checks share this semantic layer. Recognized hypothetical status wording is excluded, while present notices such as "Until further notice, applications are closed" remain explicit closures. Recognized dollar amounts cannot become effective years. Calendar dates, years and household-size labels alone supply no income value, and separate rows do not inherit a heading's year. Narrative fields in CSV/JSON-derived records follow the same statement rules, with the full serialized record retained as their literal quotation. The [answer architecture](ARCHITECTURE.md) documents policy extensions, annotation validation and legacy generation compatibility.

Raw responses are stored under `data/raw/<source_id>/<sha256>.<format>` and normalized units under `data/normalized/`. The source `content_hash` hashes the entire response. `normalized_content_hash` hashes extracted units, so rotating page tokens do not by themselves count as a meaningful content change. The source `content_changed_at` records a detected normalized change. `--offline` does not claim a fresh retrieval; `--check` verifies archived hashes and demands exact equality with the saved corpus. Acquisition writes its report to `work/source-refresh/<candidate>/report.json`; `--check` writes `data/verification-report.json`.

Failed acquisitions return a failing status without changing the active corpus. [Candidate failure rules](SOURCE_UPDATES.md#acquire-a-candidate) determine when prior evidence can be retained. Unknown update dates stay unknown; retrieval and review schedules do not establish current rules or application capacity. See [freshness limits](LIMITATIONS.md#freshness-and-availability).

## Authority, quotation and uncertainty

Source-type weights prefer government records/APIs, government webpages, official codes/ordinances, official documents, other authoritative material, then labeled independent/secondary evidence. This limited ranking does not establish legal precedence, effective dates or supersession.

The answer engine selects relevant supporting snippets and displays literal quotations, source labels and official links. A historical income-year request takes priority over source-section preferences and unrelated current application-status wording. Asking whether old income limits still apply today requires evidence for the current UTC year, as does a current-income request without an explicit year. The quoted income value must carry the requested year. An older table or dated heading can support a dated caution, while missing, stale or unquotable requested-year values cannot establish the requested limits. Housing guidance supplies questions to verify with staff. It does not calculate eligibility from income tables or interpret zoning permissions; complete municipal codes are outside the seed corpus.

Explicit states cover insufficient evidence, stale snapshots, unavailable sources, conflicting application status, ambiguous/absent locations, missing coverage and official judgment. Conflict detection only catches recognized opposing open/closed assertions about the same program/topic from authoritative snapshots within their refresh intervals; those conflicts take priority over income-date checks. Both supporting statements must fit valid quotations. An unquotable opposing statement or required qualification produces insufficient evidence and prevents optional model selection. Other contradictions and unrecognized wording require review.

Retrieved text is untrusted data. Retrieval quarantines recognizable assistant-directed instructions; quotations and URLs cannot render arbitrary HTML. Source text cannot choose a provider, call tools, fetch another source or expose credentials to the prompt. Schema, ID and quotation checks reject unsupported model output independently of prompt wording. These checks cannot guarantee useful selection or detect every malicious instruction; see [guardrail limits](GUARDRAIL_INSERTS.md).

## Geographic and observed-development context

After a resident selects an address candidate, official boundaries establish connected-layer coverage. Parcel and designation queries preserve ambiguity and outages; they cannot establish every property condition or authorize a project. Development records retain source provenance separately from regulatory evidence. Proximity establishes no legal relationship, reported status does not prove physical progress, and no match does not prove inactivity.

[Geospatial behavior](GEOSPATIAL.md) defines current coverage, whole-parcel and point queries, distance, date meanings and retrieval bounds.

## Evaluation and release interpretation

[Evaluation and review](EVALUATION.md) distinguishes source regeneration, code/claim/provider tests, real inference and human review. [Suite commands](EVAL_SUITE.md) reproduce reports; [release readiness](RELEASE_READINESS.md) records dated results. Authored test cases do not establish general factual accuracy.

Changes to routing, retrieval or answer selection require both synthetic regressions and the [populated-corpus regression gate](DEVELOPMENT.md#behavior-change-regression-gate). A valid literal quotation can still select the wrong application step or income table, so inspect failed cases against the original evidence and authored expectations. Empty source-only evidence cannot exercise that gate, and unavailable corpus checks must remain explicitly unverified.

[Limitations](LIMITATIONS.md) is the central reference for product boundaries and pending human/accessibility review; [notices](../NOTICE.md) cover licensing and independence.
