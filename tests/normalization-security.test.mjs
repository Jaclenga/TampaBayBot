import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkUnits, normalize, parseCsv, sha256 } from '../src/lib/ingestion/normalize.mjs';
import { jsonBytes, normalizationLimits, validateNormalized } from '../src/lib/ingestion/normalization-limits.mjs';

const source = { source_id: 'bounded-example', source_type: 'html', title: 'Example', canonical_url: 'https://example.gov/source' };
const exceeded = error => error.code === 'normalization_limit_exceeded';

test('nested address blocks preserve their text once, together with ordinary list and table evidence', async () => {
  const guidance = 'Synthetic guidance. '.repeat(4096).trim();
  const bytes = Buffer.from(`<main>${'<address>'.repeat(64)}${guidance}${'</address>'.repeat(64)}<ul><li>Complete the application.<ul><li>Include proof of income.</li></ul></li></ul><table><tr><th>Household size</th><td>Income limit</td></tr><tr><td>Two residents</td><td>$60,000</td></tr></table></main>`);
  const result = await normalize(bytes, source);
  assert.deepEqual(result.units.map(unit => unit.text), [guidance, 'Complete the application. Include proof of income.', 'Household size | Income limit', 'Two residents | $60,000']);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < bytes.length + 1024);
  const chunks = chunkUnits(result, source, '2026-09-16', sha256(bytes));
  for (const chunk of chunks) {
    assert.equal(chunk.text, result.units[chunk.locator.unit_index].text.slice(chunk.locator.text_start, chunk.locator.text_end).trim());
    assert.equal(chunk.content_hash, sha256(chunk.text));
    assert.equal(chunk.raw_content_hash, sha256(bytes));
  }
});

test('HTML rejects cumulative normalized bytes, unit counts and links without returning truncated evidence', async () => {
  await assert.rejects(normalize(Buffer.from(`<main>${'<p>Read the complete program requirements.</p>'.repeat(10)}</main>`), source, { limits: { maxNormalizedBytes: 400 } }), exceeded);
  await assert.rejects(normalize(Buffer.from(`<main>${'<p>Read the complete program requirements.</p>'.repeat(3)}</main>`), source, { limits: { maxUnits: 2 } }), exceeded);
  await assert.rejects(normalize(Buffer.from(`<main><p>Read the complete program requirements.</p>${'<a href="/apply">Apply online</a>'.repeat(3)}</main>`), source, { limits: { maxLinks: 2 } }), exceeded);
  await assert.rejects(normalize(Buffer.from(`<main><p>Read the complete program requirements.</p><a href="/apply">${'link label '.repeat(30)}</a></main>`), source, { limits: { maxNormalizedBytes: 300 } }), exceeded);
});

test('repeated heading metadata is included in HTML normalization budgets', async () => {
  const html = `<main><h2>${'Large section title '.repeat(30)}</h2>${'<p>Read the complete program requirements.</p>'.repeat(3)}</main>`;
  await assert.rejects(normalize(Buffer.from(html), source, { limits: { maxNormalizedBytes: 1000 } }), exceeded);
});

test('CSV rejects repeated long headers before constructing a large serialized evidence collection', async () => {
  const csv = `${'header'.repeat(512)}\n${'1\n'.repeat(100)}`;
  assert.throws(() => parseCsv(csv, { limits: { maxNormalizedBytes: 16 * 1024 } }), exceeded);
  await assert.rejects(normalize(Buffer.from(csv), { ...source, source_type: 'csv' }, { limits: { maxNormalizedBytes: 16 * 1024 } }), exceeded);
  assert.throws(() => parseCsv('id\n1\n2\n3\n', { limits: { maxUnits: 2 } }), exceeded);
  assert.deepEqual(parseCsv('id,description\n0001,"An unchanged, exact value"\n'), [{ record_id: '2', values: { id: '0001', description: 'An unchanged, exact value' } }]);
});

test('all structured formats bound unit counts, escaped text and geometry metadata', async () => {
  for (const source_type of ['json', 'arcgis', 'geojson']) {
    const features = Array.from({ length: 3 }, () => ({ properties: { name: 'Original record' }, geometry: { type: 'LineString', coordinates: Array.from({ length: 40 }, () => [-82, 27]) } }));
    const bytes = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features }));
    await assert.rejects(normalize(bytes, { ...source, source_type }, { limits: { maxUnits: 2 } }), exceeded);
    await assert.rejects(normalize(bytes, { ...source, source_type }, { limits: { maxNormalizedBytes: 600 } }), exceeded);
    const escaped = Buffer.from(JSON.stringify({ description: '\u0000'.repeat(150) }));
    await assert.rejects(normalize(escaped, { ...source, source_type }, { limits: { maxNormalizedBytes: 1000 } }), exceeded);
  }
});

test('normalization rejects over-limit inputs before selecting or invoking any parser', async () => {
  for (const source_type of ['html', 'csv', 'json', 'arcgis', 'geojson', 'pdf']) {
    await assert.rejects(normalize(Buffer.alloc(65), { ...source, source_type }, { limits: { maxInputBytes: 64 } }), exceeded);
  }
});

test('PDF extraction applies the same cumulative normalized-output budget', async () => {
  // A tiny, local PDF with one text stream exercises the real parser safely.
  const stream = 'BT /F1 12 Tf 50 700 Td (Complete the program application and include proof of income.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = Buffer.from(pdf);
  const definition = { ...source, source_type: 'pdf' };
  const normalized = await normalize(bytes, definition);
  assert.ok(normalized.units.some(unit => unit.page === 1 && unit.text.includes('include proof of income.')));
  await assert.rejects(normalize(bytes, definition, { limits: { maxNormalizedBytes: 64 } }), exceeded);
});

test('JSON byte measurement includes escapes, UTF-8 and metadata without serializing first', () => {
  const values = [{ text: 'ASCII "\\\n\u0000 café 漢字 😀 \ud800', section: '\udc00', skipped: undefined, value: NaN }, [null, undefined, true, false, 1e30]];
  for (const value of values) {
    const actual = Buffer.byteLength(JSON.stringify(value));
    assert.equal(jsonBytes(value, actual), actual);
    assert.throws(() => jsonBytes(value, actual - 1), exceeded);
  }
  let deeplyNested = 'value';
  for (let i = 0; i < 12; i++) deeplyNested = { child: deeplyNested };
  assert.throws(() => jsonBytes(deeplyNested, 10_000, normalizationLimits({ maxDepth: 5 })), exceeded);
  assert.throws(() => jsonBytes(Array(10).fill(1), 10_000, normalizationLimits({ maxNodes: 5 })), exceeded);
});

test('validation and chunking reject oversized injected section, record and geometry metadata', () => {
  for (const metadata of [{ section: 's'.repeat(1000) }, { record_id: 'r'.repeat(1000) }, { geometry: { coordinates: Array.from({ length: 150 }, () => [1, 2]) } }]) {
    const normalized = { units: [{ text: 'Complete the program application.', ...metadata }], links: [] };
    assert.throws(() => validateNormalized(normalized, { limits: { maxNormalizedBytes: 500 } }), exceeded);
    assert.throws(() => chunkUnits(normalized, source, '2026-09-16', 'raw', { limits: { maxNormalizedBytes: 500 } }), exceeded);
  }
});

test('chunk limits include repeated source metadata and semantic annotations', () => {
  const normalized = { units: [{ text: 'Complete the program application. '.repeat(100), section: 's'.repeat(200) }] };
  assert.throws(() => chunkUnits(normalized, source, '2026-09-16', 'raw', { limits: { maxChunks: 1 } }), exceeded);
  assert.throws(() => chunkUnits(normalized, source, '2026-09-16', 'raw', { limits: { maxChunkBytes: 2000 } }), exceeded);
  const factual = { units: [{ text: 'Applications are closed. Maximum assistance: $1,000.' }] };
  const chunks = chunkUnits(factual, source, '2026-09-16', 'raw');
  assert.ok(chunks[0].facts.length >= 2);
  const length = Buffer.byteLength(JSON.stringify(chunks));
  assert.throws(() => chunkUnits(factual, source, '2026-09-16', 'raw', { limits: { maxChunkBytes: length - 1 } }), exceeded);
  assert.deepEqual(chunkUnits(factual, source, '2026-09-16', 'raw', { limits: { maxChunkBytes: length } }), chunks);
});
