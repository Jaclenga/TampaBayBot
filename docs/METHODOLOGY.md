# TampaBayBot methodology

TampaBayBot combines deterministic routing, lexical retrieval, literal excerpts and official next-step links. Optional model selection, geographic queries and development records add context. This guide describes a populated installation; the source-only alpha reports unavailable evidence until an operator [loads and reviews sources](DISTRIBUTION.md).

## Resident question to next step

1. Accept an ordinary housing question or address without requiring a department selection.
2. Route among housing, zoning, permitting, observed development and agency navigation. Resolve a selected or explicitly named city/county; missing or conflicting resource areas require clarification. Street names and mailing addresses do not establish property jurisdiction.
3. Filter sources by explicit `jurisdiction_ids` before retrieval, conflict checks, housing navigation and official next steps. Missing scope metadata fails closed; county membership never implies city program coverage. Rank the allowed chunks with a small reproducible BM25-style lexical index, category restrictions and authority weighting.
4. Select literal source substrings. Every evidence item resolves to a registry source, a raw response and a section, page, record or layer where available.
5. Describe what can be verified, show uncertainty and route to an official next step. Housing resources are potential matches; eligibility remains an agency decision.
6. When location matters, require a selected address candidate and query the jurisdiction and property layers. Show observed development separately from regulatory designations.

Optional model assistance can select validated evidence for an `answered` result; invalid output returns the deterministic baseline. The [provider contract](LLM.md#what-a-model-receives-and-can-change) defines selection and data transfer. Built-in checks and additive operator [guardrails](GUARDRAIL_INSERTS.md) can reject input or suppress model use, but cannot authorize unsupported evidence or rewrite the answer contract.

Resource scope and property-boundary coverage are separate: adding a source or selecting a city does not establish GIS coverage. See [source coverage](DATA_SOURCES.md) and the [architecture](DEVELOPMENT.md#architecture-and-code-layout) for configuration and module responsibilities.

## Ingestion and evidence reconstruction

Ingestion reads reviewed registry sources, fetches bounded HTTPS responses, checks HTTP status, archives original bytes by SHA-256 and creates normalized chunks. Included public sources need no credentials. The [source-update workflow](SOURCE_UPDATES.md) stages a candidate for review and approval before applying evidence; downloads never replace the active corpus automatically.

The [command reference](DEVELOPMENT.md#commands-and-evidence-prerequisites) covers full-source/single-source fetches and offline/check modes. The latter require preserved responses and cannot populate an empty package. New content can invalidate historical benchmark expectations. The npm command enables Node's system certificate store without disabling TLS verification.

Supported adapters:

| Format | Normalization and locator |
| --- | --- |
| HTML | Cheerio selects reviewed article/content containers, removes executable markup and navigation, decodes HTML entities, normalizes visible whitespace, and retains paragraphs, lists, table rows and factual headings. Heading text / anchor and unit offsets are preserved. |
| PDF | `pdf-parse` extracts text separately for each physical page; page numbers begin at 1. Scanned PDFs with no text fail rather than creating invented OCR. |
| CSV | Quoted CSV fields, commas, escaped quotes and newlines are parsed; values stay strings so leading-zero IDs are retained. Duplicate headers, unterminated quoted fields and field-count mismatches fail. Each record retains a CSV row locator. |
| JSON | Structured records serialize with `JSON.stringify` and retain record IDs where provided. Without an explicit ID, the array position is the locator. Object keys are not sorted into a canonical order. |
| ArcGIS REST | API errors and transfer-limit truncation fail; attributes and record/layer identifiers are retained. Current corpus snapshots are metadata; live feature queries belong to the GIS module. |
| GeoJSON | Feature properties, identifiers and geometry are preserved; the coordinate reference and actual feature meaning must be verified for any added source. |

Ingestion does not discover domains, execute webpage code, follow forms, bypass access controls or infer APIs. New ArcGIS bulk sources need a bounded query or separately reviewed pagination; truncated responses are never accepted as complete.

Chunks respect normalized units and PDF/record boundaries, splitting long units at a word boundary near 1,400 characters. Chunk `text` is an exact substring of a normalized unit, after whitespace/entity normalization or JSON serialization; it need not occur byte-for-byte in HTML markup or PDF binary. Chunk `content_hash` hashes that text; `raw_content_hash` links to the registry's source-byte hash. `locator.unit_index`, `text_start` and `text_end` reproduce the excerpt.

Raw responses are stored under `data/raw/<source_id>/<sha256>.<format>` and normalized units under `data/normalized/`. The source `content_hash` hashes the entire response. `normalized_content_hash` hashes extracted units, so rotating page tokens do not by themselves count as a meaningful content change. The source `content_changed_at` records a detected normalized change. `--offline` does not claim a fresh retrieval; `--check` verifies archived hashes and demands exact equality with the saved corpus. Acquisition writes its report to `work/source-refresh/<candidate>/report.json`; `--check` writes `data/verification-report.json`.

Failed acquisitions return a failing status without changing the active corpus. [Candidate failure rules](SOURCE_UPDATES.md#acquire-a-candidate) determine when prior evidence can be retained. Unknown update dates stay unknown; retrieval and review schedules do not establish current rules or application capacity. See [freshness limits](LIMITATIONS.md#freshness-and-availability).

## Authority, quotation and uncertainty

Source-type weights prefer government records/APIs, government webpages, official codes/ordinances, official documents, other authoritative material, then labeled independent/secondary evidence. This limited ranking does not establish legal precedence, effective dates or supersession.

The answer engine selects relevant supporting snippets and displays literal quotations, source labels and official links. Housing guidance supplies questions to verify with staff. It does not calculate eligibility from income tables or interpret zoning permissions; complete municipal codes are outside the seed corpus.

Explicit states cover insufficient evidence, stale snapshots, unavailable sources, conflicting application status, ambiguous/absent locations, missing coverage and official judgment. Conflict detection only catches directly opposing open/closed application assertions about the same program/topic; other contradictions require review.

Retrieved text is untrusted data. Retrieval quarantines recognizable assistant-directed instructions; quotations and URLs cannot render arbitrary HTML. Source text cannot choose a provider, call tools, fetch another source or expose credentials to the prompt. Schema, ID and quotation checks reject unsupported model output independently of prompt wording. These checks cannot guarantee useful selection or detect every malicious instruction; see [guardrail limits](GUARDRAIL_INSERTS.md).

## Geographic and observed-development context

After a resident selects an address candidate, official boundaries establish connected-layer coverage. Parcel and designation queries preserve ambiguity and outages; they cannot establish every property condition or authorize a project. Development records retain source provenance separately from regulatory evidence. Proximity establishes no legal relationship, reported status does not prove physical progress, and no match does not prove inactivity.

[Geospatial behavior](GEOSPATIAL.md) defines current coverage, whole-parcel and point queries, distance, date meanings and retrieval bounds.

## Evaluation and release interpretation

[Evaluation and review](EVALUATION.md) distinguishes source regeneration, code/claim/provider tests, real inference and human review. [Suite commands](EVAL_SUITE.md) reproduce reports; [release readiness](RELEASE_READINESS.md) records dated results. Authored test cases do not establish general factual accuracy.

[Limitations](LIMITATIONS.md) is the central reference for product boundaries and pending human/accessibility review; [notices](../NOTICE.md) cover licensing and independence.
