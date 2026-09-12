# ParcelPrivateer methodology

This document explains how ParcelPrivateer constructs answers and preserves their evidence. The default path combines deterministic routing, lexical retrieval, literal excerpts and official next-step links. A language model is optional. Geographic queries and independent development records provide additional context when a question needs location.

The public source-only alpha starts without evidence. An operator loads and reviews sources using the [distribution guide](docs/DISTRIBUTION.md); until then, the app reports that source information is unavailable. The methodology below describes a populated installation. Source coverage belongs in [DATA_SOURCES.md](DATA_SOURCES.md), and dated results belong in [release readiness](docs/RELEASE_READINESS.md).

## Resident question to next step

1. Accept an ordinary housing question or address without requiring a department selection.
2. Route among housing, zoning, permitting, observed development and agency navigation. Resolve a selected or explicitly named city/county; missing or conflicting resource areas require clarification. Street names and mailing addresses do not establish property jurisdiction.
3. Filter sources by explicit `jurisdiction_ids` before retrieval, conflict checks, housing navigation and official next steps. Missing scope metadata fails closed; county membership never implies city program coverage. Rank the allowed chunks with a small reproducible BM25-style lexical index, category restrictions and authority weighting.
4. Select literal source substrings. Every evidence item resolves to a registry source, a raw response and a section, page, record or layer where available.
5. Describe what can be verified, show uncertainty and route to an official next step. Housing resources are potential matches; eligibility remains an agency decision.
6. When location matters, require a selected address candidate and query the jurisdiction and property layers. Show observed development separately from regulatory designations.

Optional model assistance selects evidence for an otherwise `answered` result. Its IDs and full literal excerpts must validate, the primary evidence stays first, and conservative states and official next steps remain application-controlled. Invalid output returns the deterministic baseline. The [provider contract](docs/LLM.md) defines the exact selection format, configuration and transfer of eligible questions/public excerpts to a provider.

The question API applies built-in checks and additive operator [guardrails](docs/GUARDRAIL_INSERTS.md) around the flow. They can reject input or suppress model use but cannot authorize unsupported evidence or rewrite the answer contract. The limits of identifier detection, trusted extensions and provider disclosure are documented in [SECURITY.md](SECURITY.md).

This implementation supports selected Tampa Bay jurisdictions. Resource scope is configured separately from the official polygons used for live property context, so adding a source or selecting a city does not establish GIS coverage. The [architecture and code layout](docs/DEVELOPMENT.md#architecture-and-code-layout) identifies the core modules, JSON/in-memory index and separation between ingestion and the resident interface.

## Ingestion and evidence reconstruction

`scripts/ingest.mjs` reads only reviewed registry sources. It fetches HTTPS responses with a timeout and response-size guard, checks HTTP status, archives original response bytes by SHA-256, normalizes structure, creates chunks and updates registry/report files. Credentials are unnecessary for the included public sources.

The [command reference](docs/DEVELOPMENT.md#commands-and-evidence-prerequisites) lists full-source and single-source fetches, offline rebuilding and regeneration checks. Offline/check modes require preserved local responses and cannot populate an empty source-only package. A new fetch may change content and invalidate historical benchmark expectations. The npm ingestion command enables Node's system certificate store; this handled the Florida Housing certificate chain observed during development without disabling TLS verification.

Supported adapters:

| Format | Normalization and locator |
| --- | --- |
| HTML | Cheerio selects reviewed article/content containers, removes executable markup and navigation, decodes HTML entities, normalizes visible whitespace, and retains paragraphs, lists, table rows and factual headings. Heading text / anchor and unit offsets are preserved. |
| PDF | `pdf-parse` extracts text separately for each physical page; page numbers begin at 1. Scanned PDFs with no text fail rather than creating invented OCR. |
| CSV | Quoted CSV fields, commas, escaped quotes and newlines are parsed; values stay strings so leading-zero IDs are retained. Duplicate headers, unterminated quoted fields and field-count mismatches fail. Each record retains a CSV row locator. |
| JSON | Structured records serialize with `JSON.stringify` and retain record IDs where provided. Without an explicit ID, the array position is the locator. Object keys are not sorted into a canonical order. |
| ArcGIS REST | API errors and transfer-limit truncation fail; attributes and record/layer identifiers are retained. Current corpus snapshots are metadata; live feature queries belong to the GIS module. |
| GeoJSON | Feature properties, identifiers and geometry are preserved; the coordinate reference and actual feature meaning must be verified for any added source. |

The ingestion command is **not a general web crawler**. It does not discover arbitrary domains, execute webpage code, follow application forms, bypass access controls or infer undocumented APIs. New ArcGIS bulk sources need an explicit bounded query or a separately reviewed pagination implementation; a truncated response is never accepted as complete.

Chunks respect normalized units and PDF/record boundaries and split long units at a word boundary near 1,400 characters. The `text` is an exact substring of a stored normalized unit, not necessarily a byte-for-byte substring of HTML markup or PDF binary. Whitespace/entity normalization and structured JSON serialization are disclosed transformations. The `content_hash` on a chunk hashes that exact text. Its `raw_content_hash` links to the source byte hash in the registry. `locator.unit_index`, `text_start` and `text_end` reproduce the normalized excerpt.

Raw responses are stored under `data/raw/<source_id>/<sha256>.<format>` and normalized units under `data/normalized/`. The source `content_hash` hashes the entire response. `normalized_content_hash` hashes extracted units, so rotating page tokens do not by themselves count as a meaningful content change. The source `content_changed_at` records a detected normalized change. `--offline` does not claim a fresh retrieval; `--check` verifies archived hashes and demands exact equality with the saved corpus. Reports are written to `data/ingestion-report.json` and `data/verification-report.json`.

Failed fetches or extraction errors preserve prior evidence and its original timestamp, set the source to unavailable and return a failing command status. Unknown update dates stay unknown. A fresh fetch is not equivalent to a current legal rule or current application capacity. Refresh intervals are project review targets, not guarantees about agency updates. See [DATA_SOURCES.md](DATA_SOURCES.md) for the RMAP income-table and HRRP reopening caveats.

## Authority, quotation and uncertainty

The intended evidence preference is current government record/API, government webpage, official code/ordinance, official document, other authoritative material, and explicitly labeled independent/secondary evidence. Source-type weights implement a limited preference within this small corpus. They do not resolve legal precedence, determine effective dates or guarantee that a higher-ranked source supersedes another.

The answer engine uses category relevance and available supporting snippets before displaying evidence. It returns literal quotations with source labels and official links. It does not calculate eligibility from income tables or interpret zoning district permissions. The full current municipal code is outside the seed corpus. Housing guidance provides questions to verify with staff rather than invented rules or determinations.

Explicit states cover insufficient evidence, stale snapshots, source unavailability, conflicting application-status evidence, ambiguous or absent locations, missing coverage and questions requiring official judgment. Conflict detection is deliberately narrow: directly opposing open/closed application assertions about the same program/topic. It is not a general contradiction detector. Other mismatches require staff or source review and remain a documented limitation.

Retrieved text is untrusted data. Ingestion does not execute scripts or document instructions. Retrieval quarantines recognizable assistant-directed instruction patterns; quotations and URLs are treated as data rather than rendering arbitrary HTML. Optional model requests use only the operator-configured endpoint and bounded retrieved evidence. No source paragraph can choose the provider, call tools, fetch another source or make credentials available to the prompt. Schema, ID and literal-quotation checks reject unsupported output independently of prompt wording. Pattern detection and validation do not guarantee useful selection or detection of every malicious instruction.

## Geographic and observed-development context

The resident selects an address candidate before property lookup. Official municipal boundaries establish coverage for the connected Tampa, St. Petersburg and Clearwater layers; a postal address or selected resource area does not. Point intersections return parcel and mapped-designation evidence while retaining ambiguity and outages. They cannot determine every condition on a whole parcel or authorize a project.

Independent development records retain their source snapshot and original agency links. Distance is measured between representative points, and proximity establishes no legal relationship. Source-reported status does not prove that physical work started or finished; no matching record does not prove inactivity. [Geospatial behavior](docs/GEOSPATIAL.md) is the canonical reference for endpoints, geometry, distance, date meanings and retrieval bounds.

## Evaluation and release interpretation

Source regeneration, code tests, synthetic provider tests, real-model runs, agent review and independent human review answer different questions. [Evaluation and review](docs/EVALUATION.md) defines those distinctions and metric limits; [suite commands](docs/EVAL_SUITE.md) explain how to reproduce and compare engineering reports. None establishes general factual accuracy by itself.

Independent human review remains pending. Accessibility support and manual checks are in [ACCESSIBILITY.md](ACCESSIBILITY.md); current release evidence is in [release readiness](docs/RELEASE_READINESS.md). [Limitations](LIMITATIONS.md) summarizes the resulting user-facing boundaries, and [notices](NOTICE.md) explain licensing and independence.
