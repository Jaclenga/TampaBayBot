import { intentText } from '../core/router.mjs';

// Needs describe the resident's request, not eligibility or a program catalogue.
// Keep separate needs so a repair request cannot hide a request for rent help.
const NEED_PATTERNS = {
  repair: /\b(?:repair(?:s|ing)?|roof|hrrp|rehab|rehabilitation|fix(?:ing)?|home preservation|weatherization)\b/,
  accessibility: /\b(?:accessibility|accessible|wheelchair|ramps?|disability|disabled|home modifications?|accesibilidad|accesible|rampas?|silla de ruedas)\b/,
  buy: /\b(?:buy|buying|purchase|purchasing|homebuyers?|homeownership|down payment|closing costs?|ship)\b/,
  rent: /\b(?:rent|rental|rmap|eviction|evicted|arrears|back rent|past.due|existing lease|housing (?:choice )?vouchers?|rental subsid(?:y|ies)|section 8)\b/,
  rental: /\b(?:affordable (?:apartments?|rental|rent)|(?:find|finding|search|searching|looking for) (?:an? |an? affordable |affordable )?(?:apartments?|rental|rentals)|cheaper place|rent an? (?:apartment|home)|rental search)\b/,
  move: /\b(?:move|moving|relocat(?:e|ing|ion)|deposits?|new lease|move.in)\b/,
  utilities: /\b(?:utilities|utility|electricity|electric|water|gas|power|energy|servicios publicos|electricidad|luz)\b/,
  shelter: /\b(?:homeless|homelessness|shelter|sleep tonight|place to sleep|no (?:safe )?place to (?:live|stay|sleep)|sleep(?:ing)? (?:in (?:my |a |the )?(?:car|vehicle)|outside|rough)|nowhere to (?:live|stay|sleep)|eviction|evicted)\b/,
};

function requestedClauses(question) {
  // Split before normalization removes punctuation. Conjunctions introducing a
  // fresh request end a negation; alternatives such as "not buying or moving"
  // deliberately remain together.
  return String(question ?? '').split(/[.!?;,\n]|\b(?:but|however|instead|pero|sino)\b|\band (?=(?:i |we |need |also |want |looking ))|\by (?=(?:necesito|quiero|busco)\b)/i)
    .map(clause => intentText(clause)
      .replace(/\b(?:not only|no solo)\b/g, 'also')
      .replace(/\bno estoy segur[oa]\b/g, 'unsure')
      .replace(/\b(?:do not|dont|does not|doesnt|no) (?:need|want|require|busco|quiero|necesita)\b.*$/g, '')
      .replace(/\bnot (?:help|assistance) (?:with|for|to|buying|paying)\b.*$/g, '')
      .replace(/\b(?:not|never) (?:currently |already |yet |being |facing |looking to |planning to |in need of )?(?:homeless|homelessness|sleeping|shelter|evict(?:ed|ion)|moving|move|relocating|buying|buy|purchasing|disabled|behind|overdue|seeking|interested in)\b.*$/g, '')
      .replace(/\b(?:not|rather than) (?:home )?(?:repairs?|rent|rental|utilities|utility|financial assistance|financial help|accessibility|deposits?|down payment)\b.*$/g, '')
      .replace(/\bno (?:estoy|estamos|soy|somos|voy a|vamos a)\b.*$/g, '')
      .replace(/\b(?:no|without) (?:home )?(?:repairs?|rent assistance|rental assistance|utilities|utility assistance|financial assistance|financial help|shelter|deposit|down payment)\b.*$/g, ''))
    .filter(Boolean);
}

export function housingNeeds(question) {
  const clauses = requestedClauses(question);
  const financialRefusal = /\b(?:do not|dont|does not|doesnt|no) (?:need|want|require) (?:any )?(?:(?:financial|monetary|cash) (?:assistance|help|aid|support)|(?:help|assistance) (?:financiera|economica))\b/.test(intentText(question));
  const found = new Set();
  for (const clause of clauses) {
    // A statement of tenure is context, not a renewed assistance request after
    // declining financial help. A separate affirmative request can still name
    // an exception, such as help paying a utility bill.
    if (financialRefusal && !/\b(?:need|want|looking for|seeking)\b.{0,60}\b(?:help|assistance|aid|programs?|pay|paying)\b/.test(clause)) continue;
    for (const [need, pattern] of Object.entries(NEED_PATTERNS)) {
      if (!pattern.test(clause)) continue;
      // An affordable-rental search is not itself a request to pay existing rent.
      if (need === 'rent' && NEED_PATTERNS.rental.test(clause) &&
          !/\b(?:assistance|back rent|arrears|behind|overdue|past.due|eviction|evicted|existing lease|pay|paying|rmap)\b/.test(clause)) continue;
      if (need === 'rent' && /\b(?:arrears|past.due)\b/.test(clause) && NEED_PATTERNS.utilities.test(clause) &&
          !/\b(?:rent|rental|rmap|eviction|evicted|existing lease)\b/.test(clause)) continue;
      // Water damage or an energy-efficient roof describes a repair, not a bill.
      if (need === 'utilities' && !/\b(?:bills?|pay|paying|overdue|shut.?off|disconnect|utilities|utility|servicios publicos)\b/.test(clause)) continue;
      found.add(need);
    }
  }
  return Object.keys(NEED_PATTERNS).filter(need => found.has(need));
}
