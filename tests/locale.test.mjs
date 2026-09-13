import test from 'node:test';
import assert from 'node:assert/strict';
import { publicText, quotedSegments, jurisdictionLabel } from '../src/lib/i18n/public-text.mjs';
import { dateLabel } from '../src/lib/i18n/format.ts';
import { propertyEs } from '../src/lib/i18n/property-es.ts';

test('Spanish source dates use the same UTC day and preserve uninterpreted original date text', () => {
  assert.equal(dateLabel('2026-09-12T01:00:00+02:00', 'es'), new Intl.DateTimeFormat('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-09-11')));
  assert.equal(dateLabel('07/05/2026', 'es'), '07/05/2026 (según la fuente)');
  assert.equal(dateLabel('2026-02-31', 'es'), '2026-02-31 (según la fuente)');
  assert.equal(dateLabel(undefined, 'es'), 'La fuente no indica la fecha');
});

test('property messages preserve exact counts and uncertainty while translating their navigation', () => {
  const english = '7 published project or planning-case areas intersect the 1000-meter search radius.';
  assert.equal(publicText(english, 'en'), english);
  const spanish = publicText(english, 'es');
  assert.match(spanish, /^7 áreas/);
  assert.match(spanish, /1000 metros/);
  assert.match(publicText('A missing result does not prove that no development or permit activity exists.', 'es'), /no demuestra/);
  assert.match(publicText('The source snapshot is 91 days old. Verify current status with the original agency.', 'es'), /91 días.*Verifique/);
  assert.match(propertyEs.resultsCount(3, 17, 1000), /3 de 17/);
  assert.match(propertyEs.parcelScopes.address_point, /no se comprobó toda la parcela/);
});

test('combined Pasco coverage preserves both case scopes and the absence of adopted designations', () => {
  const zoning = 'Published County GIS Zoning In Review case polygons only, including older entries. Not a complete development or building-permit inventory; in-review layer membership does not verify current approval status.';
  const plan = 'Published County GIS CPA In Review comprehensive-plan amendment polygons only, including older entries. Proposed land-use descriptions are case information, not adopted parcel designations or proof of construction.';
  const translated = publicText(`${zoning} ${plan}`, 'es');
  assert.match(translated, /Zoning In Review/);
  assert.match(translated, /CPA In Review/);
  assert.match(translated, /no confirma el estado actual de aprobación/);
  assert.match(translated, /no designaciones adoptadas/);
});

test('unknown official text and names are never automatically translated', () => {
  const record = 'Official Project 43: Proposed density 7 units. Pending agency review.';
  assert.equal(publicText(record, 'es'), record);
  assert.equal(publicText('St. Petersburg Downtown Development Projects', 'es'), 'St. Petersburg Downtown Development Projects');
  assert.equal(jurisdictionLabel('Pasco County', 'es'), 'Condado de Pasco');
  assert.equal(jurisdictionLabel('St. Petersburg', 'es'), 'St. Petersburg');
});

test('inline quote language segmentation preserves every character and favors the complete quotation', () => {
  const text = 'La fuente dice: “Maximum assistance: $1,234. Only new leases.” [E1] y “Solicitud cerrada.” [E2]';
  const segments = quotedSegments(text, [
    { quote: 'Maximum assistance: $1,234.', language: 'en' },
    { quote: 'Maximum assistance: $1,234. Only new leases.', language: 'en' },
    { quote: 'Solicitud cerrada.', language: 'es' },
  ]);
  assert.equal(segments.map(segment => segment.text).join(''), text);
  assert.deepEqual(segments.filter(segment => segment.language).map(segment => [segment.text, segment.language]), [
    ['Maximum assistance: $1,234. Only new leases.', 'en'], ['Solicitud cerrada.', 'es'],
  ]);
  assert.deepEqual(quotedSegments('Unknown original phrase.', [{ quote: 'Unknown original phrase.' }]), [{ text: 'Unknown original phrase.', language: 'und' }]);
});
