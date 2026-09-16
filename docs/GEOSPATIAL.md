# Address, parcel, and development evidence

This guide defines address selection, jurisdiction and parcel queries, nearby-development calculations and their technical limits. The adapter uses first-party published services; a geocode supplies a candidate, not an automatic parcel determination. Runtime code uses Web APIs compatible with the Cloudflare Worker runtime and needs no GIS account, geocoding token or Node-only GIS dependency.

The public source package includes query/fetch configuration but no downloaded GIS or development evidence. Live lookups need the configured remote services. [DATA_SOURCES.md](DATA_SOURCES.md) identifies publishers, [SECURITY.md](../SECURITY.md#data-flow-and-privacy) explains data flow, and [release readiness](RELEASE_READINESS.md) records dated integration results.

## Services and fields

Resource navigation includes selected sources for Hillsborough, Pinellas and Pasco. Direct live property queries cover Tampa, St. Petersburg, Clearwater and Pasco County. [Geographic coverage history](HISTORY.md#geographic-coverage) preserves dated live checks, including the September 13 restoration of St. Petersburg development queries. County resource selection does not prove that a property is unincorporated or served by that county department.

| Area | Address search | Parcel / zoning / future land use | Nearby development source |
| --- | --- | --- | --- |
| Tampa | Hillsborough address locator | City boundary verified; HCPA parcel and Tampa-specific layers | Tampa-only snapshot after boundary verification |
| St. Petersburg | Pinellas address locator | County city-boundary/parcel layers and St. Petersburg zoning/land use | Official Downtown, Grand Central and Skyway Marina district projects; queries verified September 13, 2026 |
| Clearwater | Pinellas address locator | County city-boundary/parcel layers and Clearwater zoning/land use | Official Planning Cases polygon queries; not a building-permit inventory |
| Other Hillsborough / Pinellas municipalities and unincorporated areas | Candidates may be returned | Outside the configured municipal layers; use the responsible agency | Explicitly not covered |
| Pasco | Official County address locator | County parcels; zoning/FLU only after municipal exclusion | Official in-review zoning/comprehensive-plan cases; limited planning coverage, not a complete permit inventory |

The endpoint inventory below matches [`data/gis-config.json`](../data/gis-config.json). The recorded September 12, 2026 observation queried these services; it does not guarantee their current availability. Every result carries a registry source ID and an exact feature query URL.

| Purpose | Published endpoint | Returned evidence |
| --- | --- | --- |
| Address candidates | [City SiteAddressLocator](https://arcgis.tampagov.net/arcgis/rest/services/Locators/SiteAddressLocator/GeocodeServer) | Address point, match type, score, WGS84 latitude/longitude |
| Property identity | [City-served HCPA Tax Parcel layer 0](https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0) | FOLIO, PIN, site address, site city, municipality code |
| City jurisdiction | [City Tampa Boundary layer 0](https://arcgis.tampagov.net/arcgis/rest/services/AdministrativeArea/TampaBoundary/FeatureServer/0) | Municipality, feature ID, feature update timestamp |
| Mapped zoning | [City OpenData/Planning layer 28](https://arcgis.tampagov.net/arcgis/rest/services/OpenData/Planning/MapServer/28) | ZONECLASS, ZONEDESC, LASTUPDATE, reference fields |
| Future land use | [Plan Hillsborough FutureLU_TA layer 0](https://gis.tpcmaps.org/arcgis/rest/services/LandUse/FutureLU_TA/MapServer/0) | FLUE, FLU_DESC, JURISDICTION |
| Pinellas address candidates | [Pinellas eGIS Composite locator](https://egis.pinellas.gov/gis/rest/services/GeocodingPro/eGISComposite_Pro/GeocodeServer) | Address point, match type, score, WGS84 coordinates |
| Pinellas property identity | [Pinellas parcel layer 1](https://egis.pinellas.gov/gis/rest/services/PublicWebGIS/Parcels/MapServer/1) | Allowlisted parcel identifier and site address; no owner fields |
| St. Petersburg jurisdiction | [Pinellas municipal layer 22](https://egis.pinellas.gov/gis/rest/services/PublicWebGIS/Municipalities/MapServer/22) | Official St. Petersburg boundary intersection |
| St. Petersburg zoning / future land use | [City zoning service](https://egis.stpete.org/arcgis/rest/services/ServicesDOTS/Zoning/MapServer) | Zoning layer 0 and future-land-use layer 2 |
| Clearwater jurisdiction | [Pinellas municipal layer 5](https://egis.pinellas.gov/gis/rest/services/PublicWebGIS/Municipalities/MapServer/5) | Official Clearwater boundary intersection |
| Clearwater zoning | [City zoning layer 1](https://gis.myclearwater.com/arcgis/rest/services/ArcGISMapServices/Zoning_WGS84/MapServer/1) | City zoning designation and description |
| Clearwater future land use | [City future-land-use layer 0](https://gis.myclearwater.com/arcgis/rest/services/ArcGISMapServices/FLU_w_PPC_Colors_WGS84/MapServer/0) | City future-land-use designation |
| Pasco address candidates | [County composite locator](https://pascogis.pascocountyfl.net/giswebs/rest/services/LocatorCompositeName/GeocodeServer) | Address-point candidates with original locator scores |
| Pasco county / municipal boundaries | [County boundary layer 1](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Boundaries/MapServer/1) and [City Limits layer 3](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Boundaries/MapServer/3) | County intersection and separate incorporated-city exclusion |
| Pasco parcels | [County parcel layer 7](https://pascogis.pascocountyfl.net/giswebs/rest/services/PascoMapper/Parcels/MapServer/7) | HPARCEL, VPARCEL, site address, jurisdiction label and update date |
| Pasco zoning / future land use | [Zoning layer 4](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Landuse_Planning/MapServer/4) and [Future Landuse layer 1](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Landuse_Planning/MapServer/1) | County land-use designations only after municipal exclusion |

The first four share registry entry `tampa-gis`; future land use uses `planhillsborough-flu`. Tax parcels are HCPA information served by the City. Parcel service metadata says daily updates; future-land-use metadata says quarterly updates. These are publisher expectations, not guarantees of freshness. A feature's LASTUPDATE is shown separately from our retrieval timestamp; a long-lived boundary's old edit date does not prove the boundary is obsolete.

## Geometry and uncertainty rules

1. `lookupAddress(address)` queries the connected Hillsborough, Pinellas and Pasco locators using `SingleLine` and `outSR=4326`. Each candidate retains its actual locator provenance. Only PointAddress/Subaddress candidates with valid local coordinates and the configured minimum score are offered: 75 for Hillsborough/Pinellas and 70 for Pasco. The Pasco locator returned verified civic address points scoring 71.88 when given a mailing-city suffix. Every candidate still requires selection. Service outages remain warnings when another locator succeeds. A score is not a probability of correctness. Street approximations, ZIP centroids, malformed responses, and other coordinate systems are rejected.
2. Even one candidate yields `selection_required`. Multiple distinct candidates yield `ambiguous_address`; identical duplicates are removed. The UI must obtain selection before calling `getPropertyContext({address,latitude,longitude})`.
3. Context queries use longitude,latitude order in ArcGIS geometry, `inSR=4326`, and polygon/point intersection. The broad three-county coordinate guard does **not** establish jurisdiction. A configured city or Pasco County polygon match is required; a mailing address or selected resource area is insufficient.
4. The adapter checks configured boundaries before retrieving the selected jurisdiction's parcel and land-use layers. In Pasco, a separate municipal layer checks the full parcel polygon when available, or the address point otherwise. Any municipal match or failed municipal check withholds county zoning/future land use while retaining county parcels. Conflicting, incomplete or unverified primary boundaries prevent property-layer assignment. The response includes `jurisdictionId`, `boundaryChecks` and `coverage`; unsuccessful checks remain inspectable. A St. Petersburg or Clearwater point never falls back to Tampa zoning.
5. Matching parcels/designations are retained up to six features per point query or 24 per whole-parcel query. Multiple parcels yield `ambiguous_parcel`. Multiple layer designations remain `ambiguous`; a transfer-limit response is `incomplete`. No first match is silently promoted to a determination.
6. The point can be near an edge, a shared building, or a parcel with split zoning. The adapter intersects a validated full parcel polygon with the configured zoning/land-use layers. Invalid, absent or ambiguous geometry falls back to explicitly labeled point context. Boundary touches can include neighboring designations, so multiple intersections require agency review and do not prove split zoning. The queries do not calculate intersection areas, legal boundaries, entitlements, or the percentage of each designation. They also do not check all overlays, deed restrictions, flood constraints, or site-specific approvals.

Whole-parcel geometry comes only from the server's parcel lookup and is used internally for read-only, form-encoded polygon queries. It is not accepted from the browser or included in the public property response. A single parcel polygon must use WGS84, contain or touch the selected point, and have closed, nondegenerate rings within the configured regional bounds. It may contain at most 5,000 vertices and 100 rings. Multiple parcels, missing or invalid geometry, and geometry exceeding those limits fall back to `parcelAnalysis.scope = address_point` with whole-parcel status `not_checked`. Whole-parcel checks cover only the selected jurisdiction's configured layers; other cross-jurisdiction questions require the responsible agencies.

`found`, `partial`, `not_found`, `missing_coverage`, `ambiguous`, `incomplete`, `invalid_input`, and `unavailable` distinguish evidence states. A source outage or a missing designation does not mean that no restriction exists. A property lookup does not infer eligible uses, density, approvals, ownership rights, or permission to build.

Only selected public parcel identification fields are requested. Owner names, owner mailing addresses, sale values and tax values are not queried or returned. [Security and privacy](../SECURITY.md#data-flow-and-privacy) explains transfer, transient caching and operator-controlled logging.

## Tampa Development Records adapter

The independent [Tampa Development Records project](https://github.com/Jaclenga/Tampa-Development-Records) is an activity source, **not** a regulations source.

This source covers Tampa only. Separate [official development adapters](#official-development-adapters) query Clearwater planning cases, St. Petersburg district projects, and Pasco in-review zoning/comprehensive-plan cases after jurisdiction verification. [Geographic coverage history](HISTORY.md#geographic-coverage) preserves their dated live observations.

`data/development-config.json` pins the actual normalized core CSV to commit `b1ac7fc705fe667ff046be11f76dcb8aa3b3d872`:

`data/processed/tampa_development_activity.csv`

The reviewed UTF-8 body is 2,564,822 bytes with SHA-256 `b3cfb6baa20dcab4408eaa30183edf725bba1edf1ed4e8b169429f28a118efef`. Runtime retrieval verifies this hash before parsing. This is the **August 23, 2026** normalized core snapshot: 3,323 activities from the project's eight-layer bounded census. Our validation found 3,269 searchable representative points; 54 rows were excluded for absent/invalid/out-of-area coordinates or duplicate identifiers. Counts describe the adapter's searchable universe, not completeness of development in Tampa.

The upstream collections observed during the September 12 review included a September 1 raw observation and a larger expanded Accela table. They are not silently substituted for the pinned normalized core table. The adapter does not claim to represent today's activity. Refresh requires reviewing the new file/schema, changing the pinned commit and hash, updating the snapshot date/registry metadata, and rerunning validation.

The parser supports quoted commas, embedded newlines, escaped quotes, CRLF, and UTF-8. It checks required columns, header uniqueness, row shape, bounded row count, identifiers, and coordinates. Required columns include `activity_id`, `source_record_id`, `latitude`, `longitude`, `source_endpoint`, `source_url`, `retrieved_at_utc`, `address`, `record_type`, `status`, and `status_date`. Source descriptions remain untrusted text and never become instructions. Government and Tampa Accela URLs are allowed as original-source links; unsupported link hosts/schemes are omitted.

Each output retains the activity ID, source record ID, independent repository link, original agency URL where supplied, GIS endpoint, source observation timestamp, type/status, source date and its meaning, location count, and source memberships. Do not equate `Issued`, a permit-like name, or a derived activity stage with actual construction completion. The project's incomplete manual validation does not establish an empirical accuracy rate.

`getNearbyDevelopment({latitude,longitude}, radiusMeters)` defaults to 1,000 meters and accepts 100–5,000 meters. It computes great-circle distance using the Haversine formula and mean Earth radius 6,371,008.8 meters. It compares the selected address point with each normalized representative record point. This is not a travel route, parcel-edge distance, or evidence of a legal relationship. Activities with several locations are represented by the published point; all-location search is a documented limitation.

All matching records are counted; the nearest 30 are returned, with `truncated` and `totalMatches` exposed. `activityByYear` groups nearby source-reported status/update/create dates **separately by date meaning**. Those are not construction starts, monthly observation counts, or measured trends. Dates can precede the upstream project's analytic cohort boundary because immutable source attributes retain older values. Future-dated values are flagged and excluded from retrospective date groups. A snapshot older than 30 days yields `potentially_outdated`; age never changes the source snapshot date.

## Official development adapters

[`data/development-config.json`](../data/development-config.json) specifies each adapter's jurisdiction, exact endpoint, field allowlist, mapping, and coverage. The browser cannot supply these values. Server-side jurisdiction verification happens before selecting a dataset; an unconfigured jurisdiction returns `missing_coverage` without querying a development dataset.

| Area | Published endpoint | Coverage and date meaning |
| --- | --- | --- |
| St. Petersburg | [Active Development Projects](https://egis.stpete.org/arcgis/rest/services/ServicesDSD/Active_Development_Projects/MapServer), layers 0, 1 and 2 | Selected Downtown, Grand Central and Skyway Marina project polygons; not a citywide permit inventory. Published project descriptions and statuses are retained, but source update dates are not supplied and statuses may be older. |
| Clearwater | [Planning Cases layer 2](https://gis.myclearwater.com/arcgis/rest/services/ArcGISMapServices/Planning_Cases_WGS84/MapServer/2) | Planning-case polygons, including zoning and ordinance cases; not a building-permit inventory. Ordinance dates do not establish construction activity. |
| Pasco | [Zoning In Review layer 15](https://pascogis.pascocountyfl.net/giswebeserver/rest/services/Zoning_Landuse_ProjectPipeline_MIL1/MapServer/15) and [Comprehensive Plan Amendments In Review layer 13](https://pascogis.pascocountyfl.net/giswebeserver/rest/services/Zoning_Landuse_ProjectPipeline_MIL1/MapServer/13) | In-review planning-case polygons, including older entries; not a complete development or permit inventory. Layer membership does not verify current approval status. |

Pasco's field allowlists retain project ID, type, published status, CPA project name and proposed land-use description where supplied, plus `last_edited_date`. That date is labeled **GIS record edit date**; it is not an application, hearing, adoption or construction date. Missing dates remain unknown. Planner/applicant/owner names, contact details, editor usernames, arbitrary links and notes are neither requested nor returned. Proposed land use is case information, not an adopted parcel designation; approved zoning and future-land-use layers remain separate from case activity. The authenticated Planning folder is not queried. County planning records do not establish municipal building-permit authority; use [official County permitting](https://www.pascocountyfl.gov/services/building_construction/index.php) to locate the appropriate permit records.

Official services select polygons intersecting the meter-radius query around the selected address. Results have `distanceMeters: null`; the interface describes the mapped project area intersecting the radius without inventing a centroid distance. Source dates retain their stated date type. Retrieval time is distinct from source currency, and successful retrieval does not verify each project's current status.

When only some configured layers respond, the combined result remains `partial`, including when the available layers return no records. If all configured layers fail, the result is `unavailable`. Exhausting the page limit returns `partial` and `totalMatchesExact: false`; unavailable sources cannot become zero confirmed activity. Display truncation is separate: at most 30 records are shown, while `totalMatches` counts the records retrieved and `truncated` also signals a longer result list.

If an operator omits the optional Pasco adapters, the fallback identifies the official `pasco-permits` navigation source, has no snapshot date or commit, and marks its count as unverified. It does not inherit the Tampa snapshot's provenance, coverage, or distance method.

To add another jurisdiction, verify its public boundary, service ownership, metadata, record queries and source scope. Add reviewed field mappings to the configuration and synthetic transport fixtures. A metadata page alone does not establish that live record retrieval works. Do not add owner, mailing, exemption or staff fields to property/development allowlists.

## Retrieval bounds and reproduction

GIS reads have a 12-second timeout, one-megabyte response cap, five-minute process-local cache and at most 64 cached responses. Tampa snapshot reads have a 15-second timeout, five-megabyte response cap, 10,000-row parser cap, SHA-256 integrity check and one-hour process-local cache with concurrent request coalescing. Official development layers use a 15-second timeout, one-megabyte cap per page and at most four 100-record pages per source, with five-minute caching and at most 64 cached responses. A numeric `OBJECTID` cursor avoids overlaps in legacy spatial offset paging; repeated/out-of-order IDs and changed field schemas are rejected, and incomplete results remain labeled. Reads validate UTF-8. Failures remain explicit; no fallback rows are invented. Fixed reviewed URLs prevent user-selected source fetching. Fetch uses `redirect: 'manual'` for Workerd compatibility; all 3xx responses fail before their bodies are read or targets followed.

The optional archival command preserves the pinned raw body, provenance manifest, and normalized searchable rows locally:

```sh
node src/lib/development/ingest.mjs
```

It writes under `data/raw/development/<commit>/`; the main app still fetches the pinned source on demand. This archive and narrative ingestion's downloaded HTML/PDF/GIS metadata are excluded from public source packages. [Distribution policy](DISTRIBUTION.md) explains packaging and terms; the upstream [DATA_LICENSE.md](https://github.com/Jaclenga/Tampa-Development-Records/blob/b1ac7fc705fe667ff046be11f76dcb8aa3b3d872/DATA_LICENSE.md) applies separately from the software license.

Run deterministic tests without live network access:

```sh
node --test --test-isolation=none tests/geospatial*.test.mjs
```

The tests cover distance units, antimeridian behavior, candidate selection, ambiguous addresses/parcels/designations, out-of-area routing, source failure, coordinate-system mismatch, exclusion of owner data, malformed CSV, hostile links, schema changes, stale snapshots, future dates, response bounds, cache coalescing, content integrity and redirect rejection. Expansion fixtures also cover Pasco municipal exclusion and outages, whole-parcel fallback, source truncation, official case pagination, jurisdiction gating, Pasco field privacy/date meanings, optional navigation fallback, St. Petersburg results, and partial or complete service outages. Fixtures identify themselves as test data.

Node fixture tests, dated live-adapter observations and actual Worker smoke tests have different scopes. [Release readiness](RELEASE_READINESS.md) links their recorded results. Use the [development guide](DEVELOPMENT.md) to run a live API smoke against an actual preview/deployed Worker; that check exercises address, property and development retrieval and needs outbound access. A local fixture pass alone does not establish hosted behavior or human source-data accuracy.
