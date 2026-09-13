/** Original, MIT-licensed fiction. No agency text, real program, or resident data. */
import { createHash } from 'node:crypto';
export function makeDemoCorpus(now = new Date()) {
  const retrievedAt = new Date(now).toISOString();
  const definitions = [
    ['demo-housing', 'tampa', 'Fictional rental assistance', ['housing', 'navigation'], [
      'Fictional rental assistance helps demo households with moving costs. This is an invented program used only to demonstrate cited answers; it is not a real government benefit.',
      'Maximum demo assistance: $1,234.',
      'Demo applications are closed. Do not submit personal information or apply for this fictional benefit.',
    ]],
    ['demo-clearwater', 'clearwater', 'Fictional home repair resource', ['housing', 'navigation'], [
      'This fictional Clearwater home repair resource demonstrates city-specific evidence. It is invented test content and does not describe an actual program or eligibility rule.',
    ]],
    ['demo-permits', 'tampa', 'Fictional permit guide', ['permitting', 'navigation'], [
      'This fictional permit guide demonstrates a source citation for a renovation question. Contact the actual responsible agency before beginning a real project; this example grants no permission.',
    ]],
  ];
  const sources = definitions.map(([id, jurisdiction, title, categories]) => ({
    source_id: id, title, description: 'Original fictional demonstration content. Not an official source.',
    agency: 'Fictional demonstration agency', canonical_url: `https://example.invalid/${id}`,
    authoritative_status: 'first-party synthetic fixture', source_type: 'html', language: 'en', categories,
    jurisdiction_ids: [jurisdiction], geographic_coverage: `Fictional ${jurisdiction} example`,
    keywords: ['demo', 'fictional', 'housing', 'rent', 'moving', 'repair', 'permit'],
    retrieval_date: retrievedAt, source_updated_date: null, refresh_days: 30,
    status: 'available', demo: true,
    license_or_terms_status: 'Original synthetic MIT-licensed fixture. No downloaded third-party content.',
    next_step: { label: 'Fictional example link (not a real service)', url: `https://example.invalid/${id}` },
  }));
  const chunks = definitions.flatMap(([id, , title, , passages]) => passages.map((text, index) => ({
    id: `${id}-${index + 1}`, source_id: id, title, section: 'Fictional demonstration only',
    text, retrieved_at: retrievedAt, content_hash: createHash('sha256').update(text).digest('hex'),
    url: `https://example.invalid/${id}`, demo: true,
  })));
  return { sources, chunks };
}
