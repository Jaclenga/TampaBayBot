import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceReviewState } from '../src/lib/source-review.mjs';

test('a successful link check never advances or clears a due human content review', () => {
  const source = {
    review_status: 'reviewed', last_content_reviewed_at: '2026-10-09', next_review_at: '2026-10-15',
    refresh_days: 30, link_status: 'ok', last_link_checked_at: '2026-10-20T12:00:00Z',
  };
  assert.deepEqual(sourceReviewState(source, Date.parse('2026-10-15T23:59:59Z')), {
    content: 'reviewed', reviewedDay: '2026-10-09', dueDay: '2026-10-15', link: null,
  });
  assert.equal(sourceReviewState(source, Date.parse('2026-10-16T00:00:00Z')).content, 'overdue');
  assert.equal(sourceReviewState({ ...source, link_status: 'broken' }, Date.parse('2026-10-16T00:00:00Z')).link, 'error');
});

test('missing substantive review and inconclusive link checks remain distinct', () => {
  const source = { review_status: 'needs_review', last_content_reviewed_at: null, link_status: 'rate_limited' };
  assert.deepEqual(sourceReviewState(source, Date.parse('2026-10-20T12:00:00Z')), {
    content: 'needs_review', reviewedDay: null, dueDay: null, link: 'inconclusive',
  });
  assert.equal(sourceReviewState({ ...source, link_status: 'redirect' }).link, 'redirect');
  assert.equal(sourceReviewState({ ...source, link_status: 'ok' }).content, 'needs_review');
});
