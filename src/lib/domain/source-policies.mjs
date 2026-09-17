/** Reviewed source vocabulary. These selectors locate evidence; they never supply facts.
 * A wording change belongs here or in source.answer_policy, not in the answer engine.
 * Rules are ordered; the first matching preference wins. */
export const KNOWN_PROGRAM_ALIASES = ['rmap', 'hrrp'];

export const SOURCE_POLICIES = {
  'tampa-rmap': {
    sections: [
      { id: 'voucher', pattern: /Yes, Housing Choice Voucher/i },
      { id: 'fees', pattern: /does not cover or reimburse application fees/i },
      { id: 'application', pattern: /Applications must be submitted through the online portal only/i },
      { id: 'move-in', pattern: /Assistance is available for new move-in costs only/i },
      { id: 'overview', pattern: /This phase of RMAP is a new move-in assistance program only/i },
      { id: 'accommodation', pattern: /If an individual has a disability that substantially limits/i },
    ],
    preferredSections: [
      { when: /\b(hcv|section 8|voucher)\b/, sections: ['voucher'] },
      { when: /\b(fee|fees)\b/, sections: ['fees'] },
      { when: /\b(apply|application|online|person|portal)\b/, sections: ['application'] },
      { when: /\b(deposit|moving|move in)\b/, sections: ['move-in'] },
      { sections: ['overview'] },
    ],
    supplementalSections: [{ when: /\b(person|disability|disabled|accommodation|cannot.*online)\b/, section: 'accommodation', subject: 'housing' }],
  },
  'tampa-hrrp': { sections: [{ id: 'availability', pattern: /not currently accepting new applications/i }], preferredSections: [{ sections: ['availability'] }] },
  'hillsborough-help': {
    sections: [
      { id: 'shelter', pattern: /partners with community agencies that provide temporary housing/i },
      { id: 'disaster', pattern: /Qualified homeowners whose homes were damaged/i },
      { id: 'overview', pattern: /Here, you will find resources related to affordable housing/i },
      { id: 'contact', pattern: /Find your closest Community Resource Center or contact the Call Center/i },
    ],
    preferredSections: [
      { when: /\b(homeless|sleep|shelter|nowhere)\b/, sections: ['shelter'] },
      { when: /\b(hurricane|helene|milton)\b/, sections: ['disaster'] },
      { sections: ['overview'] },
    ],
    supplementalSections: [{ when: /\b(homeless|sleep|shelter|nowhere)\b/, section: 'contact', subject: 'housing' }],
  },
  'tampa-housing': {
    sections: [
      { id: 'contact', pattern: /Call the Housing Information Line at/i },
      { id: 'shelter', pattern: /Serving the needs of the homeless community/i },
      { id: 'overview', pattern: /The Housing and Community Development Division \(HCD\) plays a lead role/i },
    ],
    preferredSections: [
      { when: /\b(tenant|landlord|eviction|evicted|evicton|legal)\b/, sections: ['contact'] },
      { when: /\b(homeless|sleep|shelter)\b/, sections: ['shelter'] },
      { sections: ['overview'] },
    ],
  },
  'florida-housing': {
    sections: [
      { id: 'local-purchase', pattern: /Your county or city government may offer down payment/i },
      { id: 'purchase', pattern: /The Homebuyer Loan Program makes purchasing/i },
      { id: 'rental', pattern: /Floridahousingsearch.org is a free/i },
    ],
    preferredSections: [
      { when: /\b(ship)\b/, sections: ['local-purchase'] },
      { when: /\b(buy|buying|homebuyer|down payment|mortgage)\b/, sections: ['purchase'] },
      { sections: ['rental'] },
    ],
  },
  'tampa-zoning': { sections: [{ id: 'overview', pattern: /Welcome to the City of Tampa Zoning Maps/i }] },
  'plan-hillsborough-maps': {
    sections: [{ id: 'accuracy', pattern: /This map is not a survey/i }, { id: 'updates', pattern: /Maps are processed quarterly/i }],
    preferredSections: [{ when: /\b(survey|accuracy)\b/, sections: ['accuracy'] }, { sections: ['updates'] }],
  },
  'tampa-permits': {
    sections: [{ id: 'condominium', pattern: /Although a condominium/i }, { id: 'overview', pattern: /Didn.t find the permit type/i }],
    preferredSections: [{ when: /\b(condo|condominium)\b/, sections: ['condominium'] }, { sections: ['overview'] }],
  },
  'tampa-permit-guide': { sections: [{ id: 'overview', pattern: /This guide contains minimum permit application filing requirements/i }] },
  'tampa-development-contact': {
    sections: [
      { id: 'variance', pattern: /Variances\/Design Exceptions/i },
      { id: 'rezoning', pattern: /Rezonings\/Special Use/i },
      { id: 'construction', pattern: /Construction Services Division/i },
      { id: 'overview', pattern: /General Inquiries Development Coordination/i },
    ],
    preferredSections: [
      { when: /\b(variance|exception)\b/, sections: ['variance'] },
      { when: /\b(rezon|subdivision)/, sections: ['rezoning'] },
      { when: /\b(permit|construction)\b/, sections: ['construction'] },
      { sections: ['overview'] },
    ],
  },
  'st-petersburg-renters': {
    sections: [{ id: 'urgent', pattern: /Seek help as soon as you know you will not be able to pay rent/i }, { id: 'overview', pattern: /This guide helps tenants through the rental process/i }],
    preferredSections: [{ when: /\b(eviction|evicted|behind|overdue|notice)\b/, sections: ['urgent'] }, { sections: ['overview'] }],
  },
  'st-petersburg-rehab': {
    sections: [{ id: 'income', pattern: /Loan applicant income is limited to 80% Area Median Income/i }, { id: 'overview', pattern: /Funding is available to qualified applicants who own and occupy/i }],
    preferredSections: [{ when: /\b(income|ami|limit|limits)\b/, sections: ['income'] }, { sections: ['overview'] }],
    supplementalSections: [{ section: 'income', selectedOnly: true }],
  },
  'st-petersburg-zoning': {
    sections: [{ id: 'code', pattern: /Chapter 16 of the City Code is formally known/i }, { id: 'overview', pattern: /To look up zoning on your parcel/i }],
    preferredSections: [{ when: /\b(chapter|code|ldr)\b/, sections: ['code'] }, { sections: ['overview'] }],
  },
  'st-petersburg-permits': { sections: [{ id: 'overview', pattern: /Once the plans are ready to be submitted/i }] },
  'clearwater-housing': {
    sections: [{ id: 'shelter', pattern: /Call 211 for assistance for people experiencing homelessness/i }, { id: 'overview', pattern: /Rents and eligibility vary/i }],
    preferredSections: [{ when: /\b(homeless|sleep|shelter|nowhere)\b/, sections: ['shelter'] }, { sections: ['overview'] }],
  },
  'clearwater-rehab': { sections: [{ id: 'availability', pattern: /Due to current funding limitations/i }] },
  'clearwater-zoning': { sections: [{ id: 'overview', pattern: /View the city.s future land use and zoning maps/i }] },
  'clearwater-permits': { sections: [{ id: 'overview', pattern: /Step 1.Visit Clearwater.s Accela portal/i }] },
  'pinellas-housing-directory': { sections: [{ id: 'overview', pattern: /Welcome to the Community Housing Guide/i }] },
  'pinellas-family-housing': { sections: [{ id: 'overview', pattern: /The Family Housing Assistance Program \(FHAP\) helps families/i }] },
  'pinellas-permits': { sections: [{ id: 'overview', pattern: /Pinellas County Building and Development Review Services department serves/i }] },
  'pasco-housing': { sections: [{ id: 'overview', pattern: /Mission: Improving the lives of Pasco.s citizens/i }] },
  'pasco-rehab': {
    sections: [{ id: 'overview', pattern: /Pasco County Community Development administers a program/i }, { id: 'loan', pattern: /The funds provided through Pasco County will be a zero-interest 30 year loan/i }],
    preferredSections: [{ sections: ['overview'] }], supplementalSections: [{ section: 'loan', selectedOnly: true }],
  },
  'pasco-help': { sections: [{ id: 'contact', pattern: /Please call our office at 727-834-3297/i }] },
  'pasco-maps': { sections: [{ id: 'overview', pattern: /To use the full version of our interactive mapper/i }] },
  'pasco-permits': { sections: [{ id: 'contact', pattern: /Questions\? Email BCSCustomerService/i }] },
};

/** Source-specific metadata signals for deterministic retrieval. */
export const RETRIEVAL_PREFERENCES = [
  { subject: 'development', sourceId: 'tampa-development-contact', weight: 0.5 },
];

/** Ordered routing preferences. An unlisted source still participates in retrieval. */
export const GUIDANCE_PRIORITIES = [
  { jurisdiction: 'tampa', subject: 'zoning', category: 'navigation', when: /\b(contact|who|agency|department|phone)\b/, sources: ['tampa-development-contact'] },
  { jurisdiction: 'tampa', subject: 'zoning', when: /\b(flu|future land use|comprehensive)\b/, sources: ['plan-hillsborough-maps', 'tampa-development-contact'], terminal: true },
  { jurisdiction: 'tampa', subject: 'zoning', sources: ['tampa-zoning', 'tampa-development-contact'] },
  { jurisdiction: 'tampa', subject: 'permitting', when: /\b(new construction|application guide|documents|checklist)\b/, sources: ['tampa-permit-guide', 'tampa-development-contact'], terminal: true },
  { jurisdiction: 'tampa', subject: 'permitting', sources: ['tampa-permits', 'tampa-development-contact'] },
  { jurisdiction: 'tampa', subject: 'development', sources: ['tampa-development-contact'] },
  { jurisdiction: 'pasco-county', subject: 'zoning', unless: /\b(comprehensive|2050|plan update)\b/, sources: ['pasco-maps'], terminal: true },
  ...Object.entries({ 'st-petersburg': 'st-petersburg', clearwater: 'clearwater', 'hillsborough-county': 'hillsborough', 'pinellas-county': 'pinellas', 'pasco-county': 'pasco' }).flatMap(([jurisdiction, prefix]) => [
    { jurisdiction, subject: 'zoning', sources: [`${prefix}-zoning`] },
    { jurisdiction, subject: 'permitting', sources: [`${prefix}-permits`] },
    { jurisdiction, subject: 'development', sources: [`${prefix}-permits`] },
  ]),
];
