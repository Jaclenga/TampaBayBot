export const en = {
  brand: "TampaBayBot",
  language: {
    label: "Language / Idioma",
    scope: "Questions, property tools, and reference pages are available in English and Spanish. Source quotations and official record text remain in their original language.",
  },
  nav: {
    ask: "Ask a question",
    sources: "Public sources",
    about: "About",
    evaluation: "Evaluation",
  },
  hero: {
    title: "Tampa Bay housing information",
    description:
      "Find housing help, property details, permits, and public records.",
  },
  form: {
    label: "Question or address",
    area: "Your area",
    region: "Tampa Bay region",
    areaHint: "Choose a city or county for local details. Use Tampa Bay region if you’re unsure or need regional resources.",
    placeholder: "How can I get help with housing?",
    submit: "Search",
    busy: "Searching...",
    privacy:
      "Leave out names, account numbers, and private details. This app does not save questions.",
    empty: "Enter a housing question or a Tampa Bay street address.",
    error: "We couldn’t complete that search. Please try again.",
    max: "Keep your question under 1,000 characters.",
  },
  examplesLabel: "Try a question",
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
  answer: {
    title: "Answer",
    area: "Source coverage",
    modelUsed:
      "A language model selected these source excerpts. Their wording was checked against the saved evidence.",
    modelFallback:
      "Model assistance could not provide a verified result. This answer uses the standard source search.",
    meaning: "What this means",
    evidence: "Sources",
    next: "Next steps",
    verify: "Requirements to verify",
    clear: "New question",
    followup: "Ask a follow-up. Topic context clears with a new question or page reload.",
    continuing: "Using the topic from your previous question.",
    sourceLanguage: "Source language",
    languageUnknown: "Not recorded",
    originalQuotes: "Source quotations stay in their original language and are not translated.",
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
    label: "Tampa Bay street address",
    placeholder: "For example, 315 E Kennedy Blvd, Tampa",
    submit: "Find address",
    busy: "Looking up the address…",
    disclosure:
      "Address searches are sent to public GIS services in Hillsborough, Pinellas, and Pasco counties. No address history is saved by this app.",
    jurisdictionHint: "A mailing address does not confirm city boundaries.",
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
    needs_jurisdiction: "Choose a city or county",
    official_judgment: "Confirm with the responsible agency",
    out_of_scope: "Outside this service",
    unavailable_source: "Source unavailable",
    missing_geographic_coverage: "Outside available coverage",
  } as Record<string, string>,
  sourcePage: {
    title: "Public sources",
    description:
      "Government sources and public datasets used by TampaBayBot, with coverage, dates, and original links.",
    official: "First-party public source",
    synthetic: "Fictional demonstration source",
    independent: "Independent public-data project",
    view: "Visit source",
    frequency: "Expected refresh",
    retrieved: "Last retrieved",
    terms: "Source terms",
    unavailable: "Not yet retrieved",
    original: "Original source descriptions and terms are shown in their recorded language.",
    coverage: "Areas covered",
    seeMore: "See more",
    seeLess: "See less",
    showing: (visible: number, total: number) => `Showing ${visible} of ${total} sources`,
    refreshDays: "days",
    back: "Back to your question",
    method: "How answers are made",
    methodText:
      "The app retrieves passages from a versioned public-source index and shows exact excerpts. An optional local or API language model can select excerpts; the app checks their wording and citations before displaying them. It cannot make official determinations. Source documents are data, never instructions.",
    method2:
      "Location searches use public GIS layers for the confirmed jurisdiction, including Pasco addresses and parcels. Pasco county zoning and future land use are withheld inside incorporated areas. Nearby records use a pinned Tampa snapshot, selected St. Petersburg district projects, Clearwater planning cases, and Pasco zoning and comprehensive-plan cases under review. These are limited published records, not a complete permit or construction inventory. Each source has its own coverage and currency limits.",
  },
  about: {
    title: "About TampaBayBot",
    intro:
      "TampaBayBot brings housing resources, property context, and public development records into one place to help Tampa Bay residents find an understandable next step. Source coverage is shown for each jurisdiction.",
    approachTitle: "How answers work",
    approach:
      "Each answer keeps its evidence close. We show the source, explain uncertainty, and route important decisions to the responsible agency. This first release offers source-backed navigation, not personalized legal or eligibility decisions.",
    privacyTitle: "Privacy",
    privacy:
      "The app does not save questions, addresses, conversations, or personal profiles. Requests pass through the hosting provider. Address lookups go to public GIS services; an optional map goes to OpenStreetMap. Avoid entering sensitive personal information.",
    languageTitle: "Language",
    language:
      "Questions, property tools, and reference pages support English and Spanish. Source quotations, official names, record descriptions, and source notes remain in their original language, with the recorded source language shown when available.",
    limitsTitle: "What this release can and cannot do",
    limits:
      "This is a v0.1 review build. It uses saved source snapshots and live property lookups, which can fail or return multiple matches. It cannot guarantee complete development records or decide what is legally permitted. Human audits and assistive-technology testing are still required before a public release.",
    accessTitle: "Accessibility",
    access:
      "Use the entire service with a keyboard. Every property and activity result has a text view; opening a map is optional. The layout supports small screens, visible focus, larger text, and reduced motion. Automated checks help us find issues, but they do not establish full WCAG conformance.",
  },
  footer: {
    statement:
      "TampaBayBot is an independent open-source project, not affiliated with any city or county government. Verify important decisions with the responsible agency.",
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
    home: "TampaBayBot home",
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
