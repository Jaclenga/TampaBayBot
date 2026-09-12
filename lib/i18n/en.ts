export const en = {
  brand: "ParcelPrivateer",
  nav: {
    ask: "Ask a question",
    sources: "Public sources",
    about: "About",
    evaluation: "Evaluation",
  },
  hero: {
    title: "Tampa housing information",
    description:
      "Find housing assistance, property information, permits, and public records.",
  },
  form: {
    label: "Ask a question or enter an address",
    placeholder: "How can I get help with housing?",
    submit: "Search",
    busy: "Searching...",
    privacy:
      "Skip names, account numbers, and other private details. Questions are not saved by this app.",
    empty: "Enter a housing question or a Tampa street address.",
    error: "We couldn’t complete that search. Please try again.",
    max: "Keep your question under 1,000 characters.",
  },
  examplesLabel: "Popular questions",
  modelPrivacy: {
    disabled:
      "Model assistance is off. Your question is not sent to a language model.",
    enabled:
      "Model assistance is on. Your question and selected public-source passages are sent to this site's configured model service, which may process or retain them.",
  },
  examples: [
    "Where can I find help paying for housing?",
    "What zoning applies to this address?",
    "Are there development records near me?",
  ],
  servicesTitle: "Browse by topic",
  servicesIntro: "Choose a topic to get started.",
  services: [
    {
      id: "housing",
      label: "Housing assistance",
      text: "Explore help for renters and homeowners.",
      prompt: "Where can I find help paying for housing?",
    },
    {
      id: "zoning",
      label: "Zoning & land use",
      text: "Find official maps and property information.",
      prompt: "How do I find the zoning and future land use for a property?",
    },
    {
      id: "permitting",
      label: "Permits & projects",
      text: "Find the right permit information.",
      prompt: "Who handles permits for a home renovation?",
    },
    {
      id: "development",
      label: "Development nearby",
      text: "Explore what public records show.",
      prompt: "Are there recent development records near me?",
    },
    {
      id: "navigation",
      label: "Agency contacts",
      text: "Reach the right office, form, or resource.",
      prompt: "Which agency should I contact about a housing question?",
    },
  ],
  answer: {
    title: "Answer",
    modelUsed:
      "A language model selected these source excerpts. Their wording was checked against the saved evidence.",
    modelFallback:
      "Model assistance could not provide a verified result. This answer uses the standard source search.",
    meaning: "What this means",
    evidence: "Evidence you can inspect",
    next: "What you can do next",
    verify: "Requirements to verify",
    clear: "Start a new question",
    source: "Read original source",
    retrieved: "Retrieved",
    updated: "Source updated",
    unknownDate: "Not provided by source",
    count: "sources",
    snapshot:
      "Answers use saved public-source snapshots. Follow the official link for the latest information.",
  },
  property: {
    title: "Add a property to your question",
    label: "Tampa street address",
    placeholder: "For example, 315 E Kennedy Blvd, Tampa",
    submit: "Find address",
    busy: "Looking up the address…",
    disclosure:
      "Address searches are sent to the City of Tampa’s public GIS service. No address history is saved by this app.",
    select: "Confirm the matching address",
    choose: "Use this address",
    loading: "Checking public property layers…",
    titleResult: "Property context",
    zoning: "Rules for property use",
    futureLandUse: "Long-term land-use plan",
    parcel: "Property record",
    map: "Show location map",
    mapDisclosure:
      "Opening the map shares these coordinates with OpenStreetMap.",
    mapTitle: "Map of the selected location",
    nearby: "Development nearby",
    radius: "Search distance",
    meters: "meters",
    distance: "Straight-line distance from the selected point",
    activityNote:
      "A nearby record describes observed activity. It does not establish what is allowed on this property, approval, or a legal relationship.",
    records: "Public records",
    record: "View source record",
    noRecords:
      "No records were returned within this distance. This does not mean no development has occurred.",
    geoError:
      "Public property information could not be loaded. Try again or use the official source links.",
    unknown: "Not determined",
    source: "View GIS source",
    optional:
      "Property context is optional. You can still use the official resources above.",
  },
  status: {
    answered: "Sources found",
    insufficient_evidence: "More information needed",
    conflicting_evidence: "Sources need reconciliation",
    potentially_outdated: "Check current information",
    needs_location: "A location will help",
    official_judgment: "Confirm with the responsible agency",
    out_of_scope: "Outside this service",
    unavailable_source: "Source unavailable",
    missing_geographic_coverage: "Outside available coverage",
  } as Record<string, string>,
  sourcePage: {
    title: "Public sources",
    description:
      "Government sources and public datasets used by ParcelPrivateer, with coverage, dates, and original links.",
    official: "First-party public source",
    independent: "Independent public-data project",
    view: "Visit source",
    frequency: "Expected refresh",
    retrieved: "Last retrieved",
    terms: "Source terms",
    unavailable: "Not yet retrieved",
    back: "Back to your question",
    method: "How answers are made",
    methodText:
      "The app retrieves passages from a versioned public-source index and shows exact excerpts. An optional local or API language model can select excerpts; the app checks their wording and citations before displaying them. It cannot make official determinations. Source documents are data, never instructions.",
    method2:
      "Location searches query public GIS layers. Nearby development records come from the independent Tampa Development Records project and retain original-source provenance. Sources can be incomplete, unavailable, or outdated.",
  },
  about: {
    title: "About ParcelPrivateer",
    intro:
      "ParcelPrivateer brings housing resources, property context, and public development records into one place to help Tampa residents find an understandable next step.",
    approachTitle: "How answers work",
    approach:
      "Each answer keeps its evidence close. We show the source, explain uncertainty, and route important decisions to the responsible agency. This first release offers source-backed navigation, not personalized legal or eligibility decisions.",
    privacyTitle: "Privacy",
    privacy:
      "The app does not save questions, addresses, conversations, or personal profiles. Requests pass through the hosting provider. Address lookups go to public GIS services; an optional map goes to OpenStreetMap. Avoid entering sensitive personal information.",
    languageTitle: "Language",
    language:
      "The interface currently supports English. UI messages are separated from application logic for translation. Legal and regulatory source material is shown in its original language.",
    limitsTitle: "What this release can and cannot do",
    limits:
      "This is a v0.1 review build. It uses saved source snapshots and live property lookups, which can fail or return multiple matches. It cannot guarantee complete development records or decide what is legally permitted. Human audits and assistive-technology testing are still required before a public release.",
    accessTitle: "Accessibility",
    access:
      "Use the entire service with a keyboard. Every property and activity result has a text view; opening a map is optional. The layout supports small screens, visible focus, larger text, and reduced motion. Automated checks help us find issues, but they do not establish full WCAG conformance.",
  },
  footer: {
    statement:
      "ParcelPrivateer is an independent open-source project, not affiliated with the City of Tampa. Verify important decisions with the responsible agency.",
    access: "Accessibility",
    privacy: "Privacy",
    navigation: "Footer navigation",
  },
  common: {
    skip: "Skip to main content",
    opens: "opens in a new tab",
    close: "Close",
    retry: "Try again",
  },
  labels: {
    home: "ParcelPrivateer home",
    navigation: "Main navigation",
    section: "Section",
    page: "Page",
    record: "Record",
    layer: "GIS layer",
    sourceTerms: "Coverage, freshness & source terms",
    sourceId: "Source ID",
    projectAbout: "Read about the project",
    citation: "Read evidence",
  },
};
