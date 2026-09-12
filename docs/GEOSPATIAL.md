# Address, parcel, and development evidence

The GIS adapter uses first-party published services and requires an address selection in the interface before requesting property context. A successful geocode is a candidate, not an automatic parcel determination. Runtime code uses Web APIs for the Sites worker runtime; no GIS account, geocoding token, or Node dependency is required. Node-only validation does not establish edge-runtime compatibility; the deployed/preview Worker also needs a live smoke check.

## Verified services and fields

All services below were read and queried on September 12, 2026. Machine-readable URLs and query fields live in `data/gis-config.json`. Every result carries a registry source ID and an exact feature query URL.

| Purpose | Published endpoint | Returned evidence |
| --- | --- | --- |
| Address candidates | [City SiteAddressLocator](https://arcgis.tampagov.net/arcgis/rest/services/Locators/SiteAddressLocator/GeocodeServer) | Address point, match type, score, WGS84 latitude/longitude |
| Property identity | [City-served HCPA Tax Parcel layer 0](https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0) | FOLIO, PIN, site address, site city, municipality code |
| City jurisdiction | [City Tampa Boundary layer 0](https://arcgis.tampagov.net/arcgis/rest/services/AdministrativeArea/TampaBoundary/FeatureServer/0) | Municipality, feature ID, feature update timestamp |
| Mapped zoning | [City OpenData/Planning layer 28](https://arcgis.tampagov.net/arcgis/rest/services/OpenData/Planning/MapServer/28) | ZONECLASS, ZONEDESC, LASTUPDATE, reference fields |
| Future land use | [Plan Hillsborough FutureLU_TA layer 0](https://gis.tpcmaps.org/arcgis/rest/services/LandUse/FutureLU_TA/MapServer/0) | FLUE, FLU_DESC, JURISDICTION |

The first four share registry entry `tampa-gis`; future land use uses `planhillsborough-flu`. Tax parcels are HCPA information served by the City. Parcel service metadata says daily updates; future-land-use metadata says quarterly updates. These are publisher expectations, not guarantees of freshness. A feature's LASTUPDATE is shown separately from our retrieval timestamp; a long-lived boundary's old edit date does not prove the boundary is obsolete.

## Geometry and uncertainty rules

1. `lookupAddress(address)` calls the official address-point locator using the `SingleLine` field and explicitly requests `outSR=4326`. Only PointAddress/Subaddress candidates with score at least 75 and valid local coordinates are offered. A score is a locator match score, not a probability of correctness. Street approximations, ZIP centroids, malformed responses, and other coordinate systems are rejected.
2. Even one candidate yields `selection_required`. Multiple distinct candidates yield `ambiguous_address`; identical duplicates are removed. The UI must obtain selection before calling `getPropertyContext({address,latitude,longitude})`.
3. Context queries use longitude,latitude order in ArcGIS geometry, `inSR=4326`, and polygon/point intersection. A broad coordinate guard rejects distant points but does **not** establish jurisdiction. Only the City boundary polygon confirms City of Tampa coverage. A Tampa mailing address is insufficient.
4. The adapter retrieves boundary and parcel independently. It fetches Tampa zoning and future land use only after City jurisdiction is confirmed. A boundary outage leaves jurisdiction unverified, with the available parcel evidence still shown.
5. All matching parcels/designations are retained, up to a declared six-feature limit. Multiple parcels yield `ambiguous_parcel`. Multiple layer designations remain `ambiguous`; a transfer-limit response is `incomplete`. No first match is silently promoted to a determination.
6. The point can be near an edge, a shared building, or a parcel with split zoning. This v0.1 does not overlay the entire parcel polygon against every zoning/land-use polygon. Whole-parcel and official determinations require agency review. It also does not check all overlays, deed restrictions, flood constraints, or site-specific approvals.

`found`, `partial`, `not_found`, `missing_coverage`, `ambiguous`, `incomplete`, `invalid_input`, and `unavailable` distinguish evidence states. A source outage or a missing designation does not mean that no restriction exists. A property lookup does not infer eligible uses, density, approvals, ownership rights, or permission to build.

Only selected public parcel identification fields are requested. Owner names, owner mailing addresses, sale values, and tax values are not queried or returned. Address/location requests are sent to the City GIS service; the application does not persist them to a database. Bounded process-local response caches can retain request URLs and responses for five minutes, and expire with the worker process. Hosting/proxy logs are controlled separately by the deployment operator.

## Tampa Development Records adapter

The independent [Tampa Development Records project](https://github.com/Jaclenga/Tampa-Development-Records) is an activity source, **not** a regulations source. `data/development-config.json` pins the actual normalized core CSV to commit `b1ac7fc705fe667ff046be11f76dcb8aa3b3d872`:

`data/processed/tampa_development_activity.csv`

The reviewed UTF-8 body is 2,564,822 bytes with SHA-256 `b3cfb6baa20dcab4408eaa30183edf725bba1edf1ed4e8b169429f28a118efef`. Runtime retrieval verifies this hash before parsing. This is the **August 23, 2026** normalized core snapshot: 3,323 activities from the project's eight-layer bounded census. Our validation found 3,269 searchable representative points; 54 rows were excluded for absent/invalid/out-of-area coordinates or duplicate identifiers. Counts describe the adapter's searchable universe, not completeness of development in Tampa.

The upstream repository also publishes a September 1 raw observation and a much larger expanded Accela table. They are not silently substituted for this normalized core table. This release neither claims to represent today's activity nor imports the expanded Accela corpus. Refresh requires reviewing the new file/schema, changing the pinned commit and hash, updating the snapshot date/registry metadata, and rerunning validation.

The parser supports quoted commas, embedded newlines, escaped quotes, CRLF, and UTF-8. It checks required columns, header uniqueness, row shape, bounded row count, identifiers, and coordinates. Required columns include `activity_id`, `source_record_id`, `latitude`, `longitude`, `source_endpoint`, `source_url`, `retrieved_at_utc`, `address`, `record_type`, `status`, and `status_date`. Source descriptions remain untrusted text and never become instructions. Government and Tampa Accela URLs are allowed as original-source links; unsupported link hosts/schemes are omitted.

Each output retains the activity ID, source record ID, independent repository link, original agency URL where supplied, GIS endpoint, source observation timestamp, type/status, source date and its meaning, location count, and source memberships. Do not equate `Issued`, a permit-like name, or a derived activity stage with actual construction completion. The project's incomplete manual validation does not establish an empirical accuracy rate.

`getNearbyDevelopment({latitude,longitude}, radiusMeters)` defaults to 1,000 meters and accepts 100–5,000 meters. It computes great-circle distance using the Haversine formula and mean Earth radius 6,371,008.8 meters. It compares the selected address point with each normalized representative record point. This is not a travel route, parcel-edge distance, or evidence of a legal relationship. Activities with several locations are represented by the published point; all-location search is a documented limitation.

All matching records are counted; the nearest 30 are returned, with `truncated` and `totalMatches` exposed. `activityByYear` groups nearby source-reported status/update/create dates **separately by date meaning**. Those are not construction starts, monthly observation counts, or measured trends. Dates can precede the upstream project's analytic cohort boundary because immutable source attributes retain older values. Future-dated values are flagged and excluded from retrospective date groups. A snapshot older than 30 days yields `potentially_outdated`; age never changes the source snapshot date.

## Retrieval bounds and reproduction

GIS reads have a 12-second timeout, one-megabyte response cap, five-minute process-local cache, and at most 64 cached responses. A failure is explicit; no invented fallback rows appear. Development reads have a 15-second timeout, five-megabyte response cap, 10,000-row parser cap, SHA-256 integrity check, and one-hour process-local cache with concurrent request coalescing. Fixed reviewed URLs prevent user-supplied source fetching. Fetch uses `redirect: 'manual'` because Workerd does not implement `redirect: 'error'`; all 3xx responses fail the status check before their bodies are read or targets followed. The independent development CSV archive and credentials are not committed. The repository does preserve selected official raw HTML/PDF/GIS metadata used by narrative ingestion.

The optional archival command preserves the pinned raw body, provenance manifest, and normalized searchable rows locally:

```sh
node lib/development/ingest.mjs
```

It writes under `data/raw/development/<commit>/`. The main app still fetches the pinned source on demand. Archive contents carry source-specific terms; the repository's software license does not relicense City records. See the upstream [DATA_LICENSE.md](https://github.com/Jaclenga/Tampa-Development-Records/blob/b1ac7fc705fe667ff046be11f76dcb8aa3b3d872/DATA_LICENSE.md).

Run deterministic tests without live network access:

```sh
node --test --test-isolation=none tests/geospatial.test.mjs
```

The tests cover real distance units, antimeridian behavior, candidate selection, ambiguous addresses/parcels/designations, out-of-area routing, source failure, coordinate-system mismatch, exclusion of owner data, malformed CSV, hostile links, schema changes, stale snapshots, future dates, response bounds, cache coalescing, content integrity, and Worker-compatible redirect rejection. Fixtures explicitly identify themselves as test data. The successful live public-building check is recorded in `docs/geospatial-live-validation.json`; it is a dated Node integration observation, not a current promise or a human audit of source accuracy. Run `scripts/smoke.mjs` against the actual preview/deployed Worker as well, and inspect its recorded result before claiming Worker integration success. That check exercises address, property-layer, and development retrieval in the hosting runtime; it is separate from the offline redirect regression test.
