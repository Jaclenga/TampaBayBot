import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv as ingestCsv } from '../src/lib/ingestion/normalize.mjs';
import { parseCsv as developmentCsv } from '../src/lib/development/index.mjs';

test('CSV adapters preserve field text, blank-row handling and their distinct output shapes', () => {
  const text = '\uFEFFid,description,optional\r\n\r\n00012,"roof, window\r\nand ""door""",\r\n,,\r\n00013, ,';
  const rows = [
    { id: '00012', description: 'roof, window\r\nand "door"', optional: '' },
    { id: '00013', description: ' ', optional: '' },
  ];
  assert.deepEqual(developmentCsv(text), { headers: ['id', 'description', 'optional'], rows });
  assert.deepEqual(ingestCsv(text), rows.map((values, index) => ({ record_id: String(index + 2), values })));
});

test('ingestion retains permissive embedded quotes while development rejects them', () => {
  for (const value of ['a"b"c', '"ab"c']) {
    const text = `id,text\n001,${value}`;
    assert.deepEqual(ingestCsv(text), [{ record_id: '2', values: { id: '001', text: 'abc' } }]);
    assert.throws(() => developmentCsv(text), { message: 'Malformed CSV quoting.' });
  }
  assert.throws(() => ingestCsv('id\n"unfinished'), { message: 'Unterminated quoted CSV field' });
  assert.throws(() => developmentCsv('id\n"unfinished'), { message: 'Unterminated CSV quote.' });
});

test('CSV header BOM normalization remains specific to each adapter', () => {
  const text = '\uFEFFid,\uFEFFname\n001,Example';
  assert.deepEqual(ingestCsv(text), [{ record_id: '2', values: { id: '001', name: 'Example' } }]);
  assert.deepEqual(developmentCsv(text), {
    headers: ['id', '\uFEFFname'], rows: [{ id: '001', '\uFEFFname': 'Example' }],
  });
  assert.throws(() => ingestCsv('id,\uFEFFid\n1,2'), { message: 'CSV must have unique, nonempty column headers' });
});

test('development row limits count retained data rows and exclude the header', () => {
  assert.deepEqual(developmentCsv('id\n\n', { maxRows: 0 }), { headers: ['id'], rows: [] });
  assert.deepEqual(developmentCsv('id\n\n001\n\n', { maxRows: 1 }).rows, [{ id: '001' }]);
  assert.throws(() => developmentCsv('id\n001', { maxRows: 0 }), { message: 'CSV exceeds the row limit.' });
  assert.throws(() => developmentCsv('id\n001\n002', { maxRows: 1 }), { message: 'CSV exceeds the row limit.' });
});

test('CSV adapters retain schema validation and descriptive errors', () => {
  assert.throws(() => developmentCsv(null), { name: 'TypeError', message: 'CSV input must be text.' });
  assert.throws(() => developmentCsv(''), { message: 'CSV has no header.' });
  assert.throws(() => ingestCsv(''), { message: 'CSV must have unique, nonempty column headers' });
  for (const header of ['id,id', 'id,', '__proto__,id', 'constructor,id', 'prototype,id']) {
    assert.throws(() => developmentCsv(`${header}\n1,2`), { message: 'Invalid or duplicate CSV header.' });
  }
  assert.throws(() => ingestCsv('id,name\n001'), { message: 'CSV row 2 has 1 fields; expected 2' });
  assert.throws(() => developmentCsv('id,name\n001'), { message: 'CSV row does not match the header.' });
});
