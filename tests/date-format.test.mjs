import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel } from '../src/lib/i18n/format.ts';

test('ISO calendar dates and timestamp offsets format consistently in UTC', () => {
  assert.equal(dateLabel('2026-09-12'), 'Sep 12, 2026');
  assert.equal(dateLabel('2026-09-12T01:00:00+02:00'), 'Sep 11, 2026');
  assert.equal(dateLabel('2026-08-23T02:06:02+00:00'), 'Aug 23, 2026');
});

test('ambiguous locale dates retain exact original wording without guessing month/day order', () => {
  assert.equal(dateLabel('5/7/2026, 4:13:48 PM'), '5/7/2026, 4:13:48 PM (as listed by source)');
  assert.equal(dateLabel('07/05/2026'), '07/05/2026 (as listed by source)');
  assert.equal(dateLabel('May 2026'), 'May 2026 (as listed by source)');
});

test('impossible or timezone-free dates stay traceable and are not silently normalized', () => {
  assert.equal(dateLabel('2026-02-31'), '2026-02-31 (as listed by source)');
  assert.equal(dateLabel('2026-09-12T08:00:00'), '2026-09-12T08:00:00 (as listed by source)');
  assert.equal(dateLabel('2026-99-12'), '2026-99-12 (as listed by source)');
});

test('missing dates remain distinct from supplied opaque source text', () => {
  assert.equal(dateLabel(null), 'Not provided by source');
  assert.equal(dateLabel(undefined), 'Not provided by source');
  assert.equal(dateLabel('  '), 'Not provided by source');
  assert.equal(dateLabel('unknown'), 'unknown (as listed by source)');
  assert.equal(dateLabel('abc\u0000def'), 'abc def (as listed by source)');
  assert.equal(dateLabel('x'.repeat(1000)), 'x'.repeat(99) + '… (as listed by source)');
});
