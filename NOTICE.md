# Notices and attribution

TampaBayBot is an independent open-source project using public information. It is not endorsed by or an official service of Tampa, St. Petersburg, Clearwater, Hillsborough County, Pinellas County, Pasco County, Plan Hillsborough / Hillsborough County City-County Planning Commission, Florida Housing Finance Corporation, or the State of Florida.

It provides informational navigation, not legal advice, official eligibility/zoning determinations, permit approval, or guarantees of funding, construction, completeness or source availability. Verify important decisions with the responsible agency.

## Original software

Original TampaBayBot software is licensed under [MIT](LICENSE), copyright 2026 TampaBayBot contributors. Dependencies retain their own licenses; versions are recorded in `package-lock.json`.

## Interface and assets

The interface uses a plain text wordmark, system sans-serif type, white backgrounds, blue `#006AAF`, dark blue `#004572`, and charcoal `#292929`. The palette and navigation take inspiration from [Tampa.gov](https://www.tampa.gov/), inspected on September 12, 2026. No City seal, logo or photograph is used in the application; sharing metadata is text-only.

Lucide icons provide functional interface controls and retain their ISC license. [`docs/images/demo.png`](docs/images/demo.png) is a browser capture of the project's own interface using original fictional evidence from [`tests/fixtures/demo-corpus.mjs`](tests/fixtures/demo-corpus.mjs). It contains no downloaded source passages or real resident information and is distributed under the project's [MIT license](LICENSE). [Demo reproduction](docs/DEMO.md) describes how to regenerate it.

## Public sources and external data

The [register](data/sources.json) and [source documentation](docs/DATA_SOURCES.md) identify publishers, URLs, dates, hashes, coverage and known terms. Source text, documents, GIS data, agency names/trademarks, photographs and external records are not relicensed under MIT by their inclusion or use here.

Public alpha packages distribute the software and fetch configuration without downloaded evidence or response packets. The [source-only distribution policy](docs/DISTRIBUTION.md) is the canonical reference for exclusions, bootstrap commands and the dated publisher-terms review, including City copy permissions and Plan Hillsborough restrictions. No blanket redistribution permission is claimed for the combined corpus.

Tampa-served parcel data is attributed to the Hillsborough County Property Appraiser. Pinellas County serves the parcel and municipal-boundary layers used for St. Petersburg and Clearwater; their city GIS services supply local zoning and future land use. Tampa GIS and Plan Hillsborough supply the Tampa layers. Attribution identifies responsibility and does not imply endorsement. Redistribution terms for the added city/county snapshots remain unverified; they are excluded from source-only packages.

## Tampa Development Records

[Tampa Development Records](https://github.com/Jaclenga/Tampa-Development-Records) is a separate independent public-data project. [Development configuration](data/development-config.json) records the pinned commit, path, source snapshot date and SHA-256. Original City links are retained where supplied upstream.

Read its [DATA_LICENSE.md](https://github.com/Jaclenga/Tampa-Development-Records/blob/b1ac7fc705fe667ff046be11f76dcb8aa3b3d872/DATA_LICENSE.md) and repository notices before redistributing data. A local archive retains those external terms; it does not become TampaBayBot-owned data.

## Corrections

Use the repository issue process to report citation errors, misleading wording, broken official links, source-term concerns or accessibility barriers. Include the question, source and retrieval date where useful, and remove personal information. Do not submit application documents or sensitive household details in public issues.
