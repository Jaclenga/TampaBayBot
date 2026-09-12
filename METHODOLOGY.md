# ParcelPrivateer methodology

ParcelPrivateer v0.1 is a resident navigation service using a small, inspectable collection of public sources. It combines deterministic question routing, lexical retrieval, literal evidence extraction, official next-step links, live GIS queries and an independent development-record snapshot. **No language model is required by default.** An operator can enable Ollama or an OpenAI-compatible server to select from existing retrieved evidence. The application validates full literal excerpts and source IDs, and falls back to the deterministic answer on errors; unsupported model prose is not accepted.

## Resident question to next step

1. Accept an ordinary housing question or address without requiring a department selection.
2. Route among housing, zoning, permitting, observed development and agency navigation. Recognize requests for official judgment, unsupported specific programs, missing location and unsupported coverage.
3. Retrieve relevant source chunks using a small reproducible BM25-style lexical index with explicit synonyms, category restrictions and authority weighting.
4. Select literal source substrings. Every evidence item resolves to a registry source, a raw response and a section, page, record or layer where available.
5. Describe what can be verified, show uncertainty and route to an official next step. Housing resources are potential matches; eligibility remains an agency decision.
6. When location matters, require a selected address candidate and query the jurisdiction and property layers. Show observed development separately from regulatory designations.

If model assistance is configured, only an otherwise `answered` result can enter that optional selection step. The model receives the current question, bounded evidence IDs/titles/quotes and fixed selector instructions. It can propose one to three existing evidence IDs and full exact excerpts, keeping the first supplied item first; the application retains authority over status, explanation, source records, warnings and official next steps. The model cannot convert insufficient evidence, official judgment, a source conflict or a location/coverage problem into a supported answer. See [provider contract and data flow](docs/LLM.md).

The question API wraps this flow with five [guardrail stages](docs/GUARDRAIL_INSERTS.md): question, evidence, before model, after a validated model result, and response. Narrow identifier/key patterns can reject input; recognizable question/evidence instruction attacks retain deterministic navigation while skipping model use. These checks do not classify every personal detail, and ordinary income, disability or other sensitive housing circumstances do not trigger rejection by themselves. Additive trusted operator checks may block or skip model use but cannot transform evidence or change the answer contract. Check failures stop the request; a response-stage model veto also checks the replacement baseline before return.

The core modules are under `lib/core/`, `lib/retrieval/`, `lib/citations/`, `lib/housing/`, `lib/geospatial/` and `lib/development/`. User-facing strings and interface logic are separate from ingestion. This is a Tampa reference implementation, not a generalized multi-city platform.

## Ingestion and evidence reconstruction

`scripts/ingest.mjs` reads only reviewed registry sources. It fetches HTTPS responses with a timeout and response-size guard, checks HTTP status, archives original response bytes by SHA-256, normalizes structure, creates chunks and updates registry/report files. Credentials are unnecessary for the included public sources.

Supported adapters:

| Format | Normalization and locator |
| --- | --- |
| HTML | Cheerio selects reviewed article/content containers, removes executable markup and navigation, decodes HTML entities, normalizes visible whitespace, and retains paragraphs, lists, table rows and factual headings. Heading text / anchor and unit offsets are preserved. |
| PDF | `pdf-parse` extracts text separately for each physical page; page numbers begin at 1. Scanned PDFs with no text fail rather than creating invented OCR. |
| CSV | Quoted CSV fields, commas, escaped quotes and newlines are parsed; values stay strings so leading-zero IDs are retained. Duplicate headers, malformed quotes and field-count mismatches fail. Each record retains a CSV row locator. |
| JSON | Structured records serialize to canonical JSON strings and retain record IDs where provided. Without an explicit ID, the array position is the locator. |
| ArcGIS REST | API errors and transfer-limit truncation fail; attributes and record/layer identifiers are retained. Current corpus snapshots are metadata; live feature queries belong to the GIS module. |
| GeoJSON | Feature properties, identifiers and geometry are preserved; the coordinate reference and actual feature meaning must be verified for any added source. |

The ingestion command is **not a general web crawler**. It does not discover arbitrary domains, execute webpage code, follow application forms, bypass access controls or infer undocumented APIs. New ArcGIS bulk sources need an explicit bounded query or a separately reviewed pagination implementation; a truncated response is never accepted as complete.

Chunks respect normalized units and PDF/record boundaries and split long units at a word boundary near 1,400 characters. The `text` is an exact substring of a stored normalized unit, not necessarily a byte-for-byte substring of HTML markup or PDF binary. Whitespace/entity normalization and structured JSON serialization are disclosed transformations. The `content_hash` on a chunk hashes that exact text. Its `raw_content_hash` links to the source byte hash in the registry. `locator.unit_index`, `text_start` and `text_end` reproduce the normalized excerpt.

The source `content_hash` hashes the entire response. `normalized_content_hash` hashes extracted units, so rotating page tokens do not by themselves count as a meaningful content change. The source `content_changed_at` records a detected normalized change. `--offline` rebuilds from archived responses without claiming a fresh retrieval. `--check` re-extracts every source, verifies archived hashes and demands exact equality with the committed corpus. Reports are machine-readable in `data/ingestion-report.json` and `data/verification-report.json`.

Failed fetches or extraction errors preserve prior evidence and its original timestamp, set the source to unavailable and return a failing command status. Unknown update dates stay unknown. A fresh fetch is not equivalent to a current legal rule or current application capacity. Refresh intervals are project review targets, not guarantees about agency updates. See [DATA_SOURCES.md](DATA_SOURCES.md) for the RMAP income-table and HRRP reopening caveats.

## Authority, quotation and uncertainty

The intended evidence preference is current government record/API, government webpage, official code/ordinance, official document, other authoritative material, and explicitly labeled independent/secondary evidence. Source-type weights implement a limited preference within this small corpus. They do not resolve legal precedence, determine effective dates or guarantee that a higher-ranked source supersedes another.

The answer engine uses category relevance and available supporting snippets before displaying evidence. It returns literal quotations with source labels and official links. It does not calculate eligibility from income tables or interpret zoning district permissions. The full current municipal code is outside the seed corpus. Housing guidance provides questions to verify with staff rather than invented rules or determinations.

Explicit states cover insufficient evidence, stale snapshots, source unavailability, conflicting application-status evidence, ambiguous or absent locations, missing coverage and questions requiring official judgment. Conflict detection is deliberately narrow: directly opposing open/closed application assertions about the same program/topic. It is not a general contradiction detector. Other mismatches require staff or source review and remain a documented limitation.

Retrieved text is untrusted data. Ingestion does not execute scripts or document instructions. Retrieval quarantines recognizable assistant-directed instruction patterns; quotations and URLs are treated as data rather than rendering arbitrary HTML. Optional model requests use only the operator-configured endpoint and bounded retrieved evidence. No source paragraph can choose the provider, call tools, fetch another source or make credentials available to the prompt. Schema, ID and literal-quotation checks reject unsupported output independently of prompt wording. Pattern detection and validation do not guarantee useful selection or detection of every malicious instruction.

Provider transport has a deadline, a bounded response, explicit configuration validation and redirect rejection. Errors preserve the deterministic result with generation metadata instead of silently treating an invalid model response as authoritative. Local configuration and hosted runtime secrets remain server-side. An enabled model receives the current question, so the application's no-persistence policy does not control provider logging or downstream cloud forwarding.

## Geographic method

The official Tampa address-point locator produces candidates in WGS84 coordinates. The application asks the resident to select the intended candidate, including when there is one match. A broad regional coordinate guard rejects distant points; **the official City boundary polygon establishes municipal coverage**. A Tampa postal address alone does not.

For a selected point, ArcGIS intersection queries retrieve City boundary, parcel/folio, zoning and future land-use attributes. Each observed feature retains its object ID, exact source/layer URL, fields, retrieval time and source update time where available. Zero results, multiple records, incomplete results and source failures remain distinct. A point-based lookup does not establish that an entire parcel has one designation, and is not a survey or official determination.

The underlying services use different publishers and update schedules. Zoning and future land use are separate concepts. Neither a nearby permit nor a development record changes the regulatory designation of another property. Important results have a textual representation so the map is not the only route to the evidence.

## Observed development method

The integration uses the pinned Tampa Development Records normalized core CSV described in [DATA_SOURCES.md](DATA_SOURCES.md). It labels this source independent and preserves the snapshot date and upstream provenance. It does not silently include newer raw upstream collections or imply complete permit coverage.

“Nearby” is a user-visible radius, default **1,000 meters**, calculated with the haversine great-circle formula between the selected address point and the normalized activity's representative point. It is straight-line point distance, not walking distance, distance to a parcel edge, or a legal relationship. The supported radius range is 100–5,000 meters. Records without reliable point coordinates cannot support a distance claim. An activity may summarize multiple original records or locations; the representative point is a practical limitation.

The interface distinguishes source-reported status and dates from physical work. An application, review or issued permit does not demonstrate construction start or completion. An empty radius query means no matched record in this source-bounded snapshot, not proof of inactivity.

## Evaluation and release interpretation

The benchmark, adversarial fixtures and machine-readable evaluation artifacts are maintained separately from source ingestion. Metrics measure relevant source retrieval, authority selection, literal citation correctness, citation presence/support, uncertainty behavior, routing, next-step availability and geographic test behavior. They are implementation checks against the selected benchmark, not a general “AI accuracy” score or a claim that all resident questions can be answered.

The deterministic benchmark is a baseline, not an evaluation of every configurable model. Provider fixtures test configuration, request/response format, selection validation, unchanged conservative states and fallback. Synthetic HTTP-provider tests are transport/runtime checks rather than real inference. A deployed model/version needs a separately recorded review of selection usefulness, latency, fallback rate and privacy terms; no live-model quality result is inferred from the adapter tests.

The ingestion suite tests quoted CSV behavior, preservation of source identifiers, HTML trust boundaries, truncated API rejection, chunk locators and hashes, and every shipped chunk's connection to its preserved raw source. The reproducibility check separately regenerates the entire corpus. Geography tests verify actual distance calculations and explicit failure/ambiguity behavior.

Agent-performed audits, automated accessibility checks and any human audit are distinct. A generated rubric or completed agent review does not count as an independent resident, agency, legal or assistive-technology review. Remaining human review must be recorded honestly in the audit artifacts. Accessibility targets and manual verification limits are documented in [ACCESSIBILITY.md](ACCESSIBILITY.md); release gaps belong in [LIMITATIONS.md](LIMITATIONS.md).

Software licensing and external-source terms are separate. ParcelPrivateer is independent of the City, County, Planning Commission and State. Important housing, zoning, permitting and eligibility decisions must be verified with the responsible agency.
