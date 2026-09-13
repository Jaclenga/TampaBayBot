# Geographic coverage and verification

Verification date: September 12, 2026, America/New_York (the final live checks occurred September 13 UTC). The synthetic test suite makes no network requests. Live observations below are separate, read-only checks against official services and are not guarantees of future availability.

## Working expansion

| Capability | Implemented behavior | Live verification |
| --- | --- | --- |
| Pasco addresses | County locator adds selectable address-point candidates. Street approximations remain excluded; mailing-city labels never establish authority. | `8731 Citizens Drive New Port Richey FL` returned two county address-point candidates. Scores were 71.88 with the city suffix; the reviewed Pasco threshold is 70 and explicit selection remains required. |
| Pasco property | County boundary establishes Pasco coverage. A parcel identifier and site address are available countywide. A separate municipal boundary query blocks county zoning and future land use for incorporated locations or an unavailable municipal check. | The selected government-campus point returned parcel `35-25-16-0030-01000-0000` and a different parcel site address, disclosed to the user. The whole parcel did not intersect the municipal layer and returned multiple county land-use intersections for review. |
| Whole-parcel checks | A single, bounded, valid WGS84 parcel polygon replaces the address point for zoning and future-land-use intersections. Multiple matches and source truncation remain explicit. | Tampa City Hall at `315 E Kennedy Blvd` returned parcel `193571.0000`, zoning `CBD-1`, future land use `CBD`, with `parcelAnalysis.scope = whole_parcel`. The Pasco campus also completed whole-parcel queries. |
| Clearwater development | The official Planning Cases layer supplies bounded nearby case polygons, record links, source dates where supplied, and source coverage. | At the existing civic point near `100 N Osceola Ave` (`27.9675039, -82.8014007`), the adapter returned 286 planning-case polygons within the official 1,000-meter spatial query; 30 were displayed. This is not a count of construction starts or a building-permit inventory. |

Pasco metadata and live query endpoints are on the County's own GIS host:

- [Address locator](https://pascogis.pascocountyfl.net/giswebs/rest/services/LocatorCompositeName/GeocodeServer)
- [County boundary](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Boundaries/MapServer/1) and [municipal boundaries](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Boundaries/MapServer/3)
- [Parcels](https://pascogis.pascocountyfl.net/giswebs/rest/services/PascoMapper/Parcels/MapServer/7)
- [County zoning](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Landuse_Planning/MapServer/4) and [future land use](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Landuse_Planning/MapServer/1)
- [Clearwater Planning Cases](https://gis.myclearwater.com/arcgis/rest/services/ArcGISMapServices/Planning_Cases_WGS84/MapServer/2)

## St. Petersburg: adapter ready, live source unavailable

The City publishes [Active Development Projects](https://egis.stpete.org/arcgis/rest/services/ServicesDSD/Active_Development_Projects/MapServer), including Downtown, Grand Central and Skyway Marina district polygons. Metadata was accessible and field mappings were verified. Actual record queries, including simple count queries without a spatial filter, returned ArcGIS `400` errors. The alternative [PermitsExternal service](https://egis.stpete.org/arcgis/rest/services/ServicesDSD/PermitsExternal/FeatureServer) also exposed metadata but returned record-query errors/timeouts; its layer names explicitly describe 2019–2021 coverage.

The app includes the district-project adapter with individual source statuses and links, and returns `unavailable` when these services fail. It does not show an empty successful result or claim live St. Petersburg development coverage was verified. No private credentials, unofficial replacement dataset, or guessed status meaning is used. Recheck the configured service when the City restores query access. Pasco development records remain unconfigured and link to [official County permitting](https://www.pascocountyfl.gov/services/building_construction/index.php).

## Meaning of a whole-parcel result

The server retrieves geometry only for parcel lookup and uses it internally for read-only form-encoded polygon queries. Geometry is not accepted from the browser or included in the public property response. It must be WGS84, contain the selected point, have closed nondegenerate rings within the regional bounds, and remain below 5,000 vertices and 100 rings. Multiple parcels, missing geometry, wrong coordinates, or excessive geometry fall back to an explicit `address_point` result with `not_checked` whole-parcel status.

The configured zoning/future-land-use layers are intersected with the full returned polygon; these queries do not calculate intersection areas, legal boundaries, entitlements, or the percentage of each designation. Boundary touches can include neighboring designations, so multiple matches indicate a need for agency review and do not prove a split-zoning condition. Coverage is limited to the selected jurisdiction's configured layers. In Pasco, any municipal intersection across the parcel prevents use of county land-use layers. Other cross-jurisdiction questions still require the responsible agencies.

## Development source contracts

The existing pinned Tampa CSV remains separately labeled as an independent snapshot. Official adapters in `data/development-config.json` specify the jurisdiction, exact endpoint, field allowlist, mapping, and coverage; the browser cannot supply any of these values. Server-side jurisdiction verification happens before selecting an adapter.

An unconfigured jurisdiction returns `missing_coverage` without querying a development dataset. Pasco's fallback identifies the official `pasco-permits` navigation source, has no snapshot date or commit, and marks its count as unverified. It does not inherit the Tampa snapshot's provenance, coverage, or distance method. When only some St. Petersburg district layers respond, the combined result remains `partial` even if the available layer returns no records; all failed layers produce `unavailable`.

The official query uses the service's meter-radius spatial intersection. Polygon results have `distanceMeters: null` and the interface says the mapped project area intersects the radius. It does not invent a centroid distance. Source dates retain their stated date type, including Clearwater's ordinance date. Retrieval time is distinct from source currency.

Pagination is bounded to four pages of 100 records per source, with 30 records displayed. A numeric `OBJECTID` cursor avoids overlaps observed in Clearwater's legacy offset paging. Results reject repeated/out-of-order IDs and changed field schemas. Timeouts, response-byte limits, UTF-8 validation, bounded caches, and manual redirect rejection apply to all reads. Exhausting a page limit returns `partial` and `totalMatchesExact: false`; an unavailable source cannot become zero confirmed activity. The [ArcGIS query contract](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/) defines spatial queries and transfer-limit handling.

To add another jurisdiction, first verify its public boundary, service ownership, metadata, record queries and source scope. Add reviewed field mappings to the configuration and synthetic transport fixtures. A metadata page alone is insufficient evidence that live record retrieval works. Do not copy owner, mailing, exemption or staff fields into property/development allowlists.

## Regression verification

Run `node --test --test-isolation=none tests/geospatial*.test.mjs`. The 44 tests cover existing GIS and snapshot behavior plus Pasco candidate selection, municipal exclusion and outages, second zoning designations away from the address point, invalid and ambiguous geometry fallback, source truncation, official case pagination, provenance, schema failures, jurisdiction gating, Pasco navigation metadata, and partial or complete St. Petersburg source outages. `npx tsc --noEmit` also passed after these changes. These checks are reproducible without the private source corpus or live GIS access.
