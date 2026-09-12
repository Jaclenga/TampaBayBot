import { en } from "./en";

/** Property-flow copy stays separate from rendering and request logic. */
export const propertyEn = {
  ...en.property,
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
