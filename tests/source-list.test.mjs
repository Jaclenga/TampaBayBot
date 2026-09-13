import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateSources } from '../src/lib/source-list.mjs';

const sources = Object.freeze(Array.from({ length: 14 }, (_, index) => Object.freeze({
  source_id: `source-${index + 1}`,
  title: index === 12 ? 'Réhabilitation — home repair' : `Public resource ${index + 1}`,
  agency: index === 12 ? 'Housing office' : 'Public agency',
  description: index === 12 ? 'Applications for roof repairs.' : 'Official public information.',
  source_type: index === 12 ? 'pdf' : 'html',
  geographic_coverage: index === 12 ? 'Unincorporated area only.' : 'Municipal services.',
  jurisdiction_ids: index === 12 ? ['pasco-county'] : ['st-petersburg'],
  notes: 'Review-only annotation',
  private_field: 'Unpublished marker',
})));

test('source search covers the full list before pagination and only public search fields', () => {
  const result = paginateSources(sources, 'roof PDF unincorporated', 1);
  assert.deepEqual(result.items, [sources[12]]);
  assert.equal(result.total, 1);
  assert.equal(result.start, 1);
  assert.equal(result.end, 1);
  assert.equal(paginateSources(sources, 'annotation', 1).total, 0);
  assert.equal(paginateSources(sources, 'unpublished', 1).total, 0);
});

test('search normalizes accents, case and punctuation and requires every term across fields', () => {
  assert.deepEqual(paginateSources(sources, '  REHABILITACIÓN  ', 1).items, []);
  assert.deepEqual(paginateSources(sources, '  REHABILITATION... housing / roof ', 1).items, [sources[12]]);
  assert.equal(paginateSources(sources, 'rehabilitation municipal', 1).total, 0);
  assert.equal(paginateSources(sources, 'St Petersburg', 1).total, 13);
  assert.equal(paginateSources(sources, 'st-petersburg', 1).total, 13);
});

test('search recognizes displayed Spanish county labels without translating official source text', () => {
  assert.deepEqual(paginateSources(sources, 'condado de pásco repair', 1, 6, 'es').items, [sources[12]]);
  assert.equal(paginateSources(sources, 'condado pasco', 1, 6, 'en').total, 0);
  assert.deepEqual(paginateSources(sources, 'Pasco County', 1, 6, 'es').items, [sources[12]]);
  assert.equal(paginateSources(sources, 'reparación', 1, 6, 'es').total, 0);
});

test('blank searches preserve source order and page bounds clamp to available entries', () => {
  const first = paginateSources(sources, '   ', 0);
  assert.deepEqual(first.items, sources.slice(0, 6));
  assert.deepEqual([first.page, first.totalPages, first.total, first.start, first.end], [1, 3, 14, 1, 6]);
  const middle = paginateSources(sources, '', 2);
  assert.deepEqual(middle.items, sources.slice(6, 12));
  assert.deepEqual([middle.start, middle.end], [7, 12]);
  const last = paginateSources(sources, '', 99);
  assert.deepEqual(last.items, sources.slice(12));
  assert.deepEqual([last.page, last.start, last.end], [3, 13, 14]);
  assert.deepEqual(paginateSources(sources, 'repair', 3).items, [sources[12]]);
  assert.equal(paginateSources(sources, 'repair', 3).page, 1);
});

test('empty lists and unmatched queries have no result range or page links', () => {
  const empty = { items: [], page: 1, totalPages: 0, total: 0, start: 0, end: 0, pageNumbers: [] };
  assert.deepEqual(paginateSources([], '', 9), empty);
  assert.deepEqual(paginateSources(sources, 'no matching source', 9), empty);
});

test('page links stay consecutive and bounded with at most five centered pages', () => {
  const many = Array.from({ length: 61 }, () => sources[0]);
  assert.deepEqual(paginateSources(many, '', 1).pageNumbers, [1, 2, 3, 4, 5]);
  assert.deepEqual(paginateSources(many, '', 6).pageNumbers, [4, 5, 6, 7, 8]);
  assert.deepEqual(paginateSources(many, '', 11).pageNumbers, [7, 8, 9, 10, 11]);
  assert.deepEqual(paginateSources(sources, '', 2).pageNumbers, [1, 2, 3]);
});
