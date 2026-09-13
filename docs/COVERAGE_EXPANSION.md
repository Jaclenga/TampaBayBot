# Geographic coverage and verification

Development verification updated September 13, 2026, America/New_York. Property and whole-parcel observations remain the September 12 checks described below (completed September 13 UTC). The synthetic test suite makes no network requests. Live observations below are separate, read-only checks against official services and are not guarantees of future availability.

## Working expansion

| Capability | Implemented behavior | Live verification |
| --- | --- | --- |
| Pasco addresses | County locator adds selectable address-point candidates. Street approximations remain excluded; mailing-city labels never establish authority. | `8731 Citizens Drive New Port Richey FL` returned two county address-point candidates. Scores were 71.88 with the city suffix; the reviewed Pasco threshold is 70 and explicit selection remains required. |
| Pasco property | County boundary establishes Pasco coverage. A parcel identifier and site address are available countywide. A separate municipal boundary query blocks county zoning and future land use for incorporated locations or an unavailable municipal check. | The selected government-campus point returned parcel `35-25-16-0030-01000-0000` and a different parcel site address, disclosed to the user. The whole parcel did not intersect the municipal layer and returned multiple county land-use intersections for review. |
| Whole-parcel checks | A single, bounded, valid WGS84 parcel polygon replaces the address point for zoning and future-land-use intersections. Multiple matches and source truncation remain explicit. | Tampa City Hall at `315 E Kennedy Blvd` returned parcel `193571.0000`, zoning `CBD-1`, future land use `CBD`, with `parcelAnalysis.scope = whole_parcel`. The Pasco campus also completed whole-parcel queries. |
| Clearwater development | The official Planning Cases layer supplies bounded nearby case polygons, record links, source dates where supplied, and source coverage. | At the existing civic point near `100 N Osceola Ave` (`27.9675039, -82.8014007`), the adapter returned 286 planning-case polygons within the official 1,000-meter spatial query; 30 were displayed. This is not a count of construction starts or a building-permit inventory. |
| Pasco planning cases | County GIS Zoning In Review and Comprehensive Plan Amendments In Review layers supply project identifiers, published statuses, case names where supplied and GIS edit dates. Planner, applicant, owner and contact fields are excluded. | On September 13, the selected government-campus point for `8731 Citizens Drive` (`28.268094840198, -82.669964798343`) returned 7 case polygons within 1,000 meters. Both services were available and the bounded query completed. These include older in-review entries and are not a complete inventory of permits or construction. |
| St. Petersburg development | Official Downtown, Grand Central and Skyway Marina district-project polygons retain their published project descriptions/statuses. Source update dates remain unknown. | On September 13, the application client verified the City Hall jurisdiction at `27.7732, -82.6398` and returned 21 project polygons within 1,000 meters. All three district queries were available and complete; the earlier query outage was not reproduced. |

Pasco metadata and live query endpoints are on the County's own GIS host:

- [Address locator](https://pascogis.pascocountyfl.net/giswebs/rest/services/LocatorCompositeName/GeocodeServer)
- [County boundary](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Boundaries/MapServer/1) and [municipal boundaries](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Boundaries/MapServer/3)
- [Parcels](https://pascogis.pascocountyfl.net/giswebs/rest/services/PascoMapper/Parcels/MapServer/7)
- [County zoning](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Landuse_Planning/MapServer/4) and [future land use](https://pascogis.pascocountyfl.net/giswebs/rest/services/FeatureDatasets/Landuse_Planning/MapServer/1)
- [Clearwater Planning Cases](https://gis.myclearwater.com/arcgis/rest/services/ArcGISMapServices/Planning_Cases_WGS84/MapServer/2)
- [Pasco Zoning In Review](https://pascogis.pascocountyfl.net/giswebeserver/rest/services/Zoning_Landuse_ProjectPipeline_MIL1/MapServer/15) and [Comprehensive Plan Amendments In Review](https://pascogis.pascocountyfl.net/giswebeserver/rest/services/Zoning_Landuse_ProjectPipeline_MIL1/MapServer/13)

## St. Petersburg: query availability restored

The City publishes [Active Development Projects](https://egis.stpete.org/arcgis/rest/services/ServicesDSD/Active_Development_Projects/MapServer), including Downtown, Grand Central and Skyway Marina district polygons. The September 12 checks returned ArcGIS `400` errors despite accessible metadata. Rechecking September 13 returned 32 Downtown records in a simple count query; the application client's bounded spatial query then succeeded across all three district layers and returned 21 polygons around City Hall. No endpoint replacement, private credentials or alternative dataset was needed.

Successful retrieval does not verify the current status of each project. The service does not supply source update dates; the interface preserves published status wording and warns that it can be older. Individual source failures still produce `partial` or `unavailable`, never a confirmed zero activity result. The earlier [PermitsExternal service](https://egis.stpete.org/arcgis/rest/services/ServicesDSD/PermitsExternal/FeatureServer) observations remain historical and it is not used by this adapter.

## Pasco: bounded planning-case coverage

The County's public [Zoning/Landuse Project Pipeline service](https://pascogis.pascocountyfl.net/giswebeserver/rest/services/Zoning_Landuse_ProjectPipeline_MIL1/MapServer) exposes polygon queries with distance, ordering and pagination support. Only its Zoning In Review and CPA In Review layers enter nearby development results. Approved zoning/future-land-use layers stay separate from case activity. The authenticated Planning folder is not queried by this application.

The field allowlists retain project ID, type, published status, CPA project name and proposed land-use description where supplied, plus `last_edited_date`. That date is labeled **GIS record edit date**; it is not an application, hearing, adoption or construction date. Missing dates remain unknown. Planner/applicant names, emails, editor usernames, arbitrary links and notes are neither requested nor returned. Source descriptions explain that proposed land use is case information, not an adopted parcel designation. County planning records do not establish municipal building-permit authority; use [official County permitting](https://www.pascocountyfl.gov/services/building_construction/index.php) for the appropriate permit records.

## Meaning of a whole-parcel result

The server retrieves geometry only for parcel lookup and uses it internally for read-only form-encoded polygon queries. Geometry is not accepted from the browser or included in the public property response. It must be WGS84, contain the selected point, have closed nondegenerate rings within the regional bounds, and remain below 5,000 vertices and 100 rings. Multiple parcels, missing geometry, wrong coordinates, or excessive geometry fall back to an explicit `address_point` result with `not_checked` whole-parcel status.

The configured zoning/future-land-use layers are intersected with the full returned polygon; these queries do not calculate intersection areas, legal boundaries, entitlements, or the percentage of each designation. Boundary touches can include neighboring designations, so multiple matches indicate a need for agency review and do not prove a split-zoning condition. Coverage is limited to the selected jurisdiction's configured layers. In Pasco, any municipal intersection across the parcel prevents use of county land-use layers. Other cross-jurisdiction questions still require the responsible agencies.

## Development source contracts

The existing pinned Tampa CSV remains separately labeled as an independent snapshot. Official adapters in `data/development-config.json` specify the jurisdiction, exact endpoint, field allowlist, mapping, and coverage; the browser cannot supply any of these values. Server-side jurisdiction verification happens before selecting an adapter.

An unconfigured jurisdiction returns `missing_coverage` without querying a development dataset. If an operator omits the optional Pasco adapters, its fallback identifies the official `pasco-permits` navigation source, has no snapshot date or commit, and marks its count as unverified. It does not inherit the Tampa snapshot's provenance, coverage, or distance method. When only some configured city or county layers respond, the combined result remains `partial` even if an available layer returns no records; all failed layers produce `unavailable`.

The official query uses the service's meter-radius spatial intersection. Polygon results have `distanceMeters: null` and the interface says the mapped project area intersects the radius. It does not invent a centroid distance. Source dates retain their stated date type, including Clearwater's ordinance date. Retrieval time is distinct from source currency.

Pagination is bounded to four pages of 100 records per source, with 30 records displayed. A numeric `OBJECTID` cursor avoids overlaps observed in Clearwater's legacy offset paging. Results reject repeated/out-of-order IDs and changed field schemas. Timeouts, response-byte limits, UTF-8 validation, bounded caches, and manual redirect rejection apply to all reads. Exhausting a page limit returns `partial` and `totalMatchesExact: false`; an unavailable source cannot become zero confirmed activity. The [ArcGIS query contract](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/) defines spatial queries and transfer-limit handling.

To add another jurisdiction, first verify its public boundary, service ownership, metadata, record queries and source scope. Add reviewed field mappings to the configuration and synthetic transport fixtures. A metadata page alone is insufficient evidence that live record retrieval works. Do not copy owner, mailing, exemption or staff fields into property/development allowlists.

## Regression verification

Run `node --test --test-isolation=none tests/geospatial*.test.mjs`. All 47 targeted tests passed after the September 13 development changes. They cover existing GIS and snapshot behavior plus Pasco candidate selection, municipal exclusion and outages, whole-parcel geometry fallback, source truncation, official case pagination, provenance, schema failures, jurisdiction gating, Pasco field privacy and date meanings, optional navigation fallback, restored St. Petersburg results, and partial or complete service outages. These checks are reproducible without a downloaded source corpus or live GIS access.
