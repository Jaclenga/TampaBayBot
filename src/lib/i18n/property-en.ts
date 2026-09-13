import { en } from "./en.ts";

/** Property-flow copy stays separate from rendering and request logic. */
export const propertyEn = {
  ...en.property,
  disclosure: 'The address is sent to official Hillsborough, Pinellas and Pasco address services. Property lookup checks Tampa, St. Petersburg, Clearwater and Pasco County boundaries. County land-use layers cover unincorporated Pasco only.',
  sourceTitle: 'Development records',
  official: 'Official city GIS records',
  officialCounty: 'Official county GIS planning records',
  sourceDetails: 'Source details',
  areaMatch: 'Mapped project area intersects the search radius',
  liveLabel: 'Live query',
  noDevelopmentQuery: 'No development records were queried for this location.',
  originalRecords: 'Official names, descriptions, and record statuses remain in their original language.',
  officialNavigation: 'Official agency navigation',
  noDataset: 'No configured dataset',
  parcelAnalysis: 'Whole-parcel map check',
  parcelScopes: { whole_parcel: 'Full parcel polygon', address_point: 'Address point only; whole parcel not checked' },
  partialCount: 'This count covers returned records only. Additional matches may exist.',
  activityNote: 'Coverage varies by source: a Tampa snapshot, selected St. Petersburg projects, Clearwater planning cases, and Pasco zoning and comprehensive-plan cases under review. Check each source status and coverage.',
  distance: 'Tampa records use straight-line point distance; official city layers use project-area intersections',
  chooseDifferent: "Choose a different match",
  loadingActivity: "Loading nearby records…",
  projectTitle: "Tampa Development Records",
  independent: "Independent public-data project",
  methodology: "Project & methodology",
  coverageLimits: "Coverage and data limits",
  recordDescription: "Record description",
  dataEndpoint: "Original data endpoint",
  provenance: "Dataset provenance",
  history: "Activity over time in this search area",
  historyExplanation:
    "Counts use the date field identified in each row. They describe records in the snapshot, not completed construction.",
  historyCaption: "Nearby record counts by year and recorded date type",
  year: "Year",
  dateType: "Date type",
  historyRecords: "Records",
  matchSource: "Address match source",
  jurisdictionSource: "Verify the jurisdiction boundary",
  boundaryChecks: "Inspect jurisdiction source results",
  pinLabel: "Property identification number",
  featureUpdated: "Source feature updated",
  snapshotLabel: "Snapshot",
  retrievedLabel: "Retrieved",
  staleAlert:
    "This snapshot may be outdated. Check current status with the original agency.",
  futureDateAlert:
    "The source date is in the future. Verify its meaning with the original agency.",
  layerStates: {
    ambiguous:
      "More than one mapped match. Confirm which designation applies with the agency.",
    incomplete:
      "The source limited this response. Additional mapped matches may exist.",
  } as Record<string, string>,
  recordNumber: (id: string) => `Record ${id}`,
  resultsCount: (shown: number, total: number, meters: number) =>
    `Showing ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} matching records within ${meters.toLocaleString("en-US")} meters.`,
  distanceAway: (meters: number) =>
    `${Math.round(meters).toLocaleString("en-US")} m away`,
};
