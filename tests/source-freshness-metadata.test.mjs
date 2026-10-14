import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8'));
const linkStatuses = new Set(['not_checked', 'ok', 'redirect', 'broken', 'temporary_failure', 'rate_limited', 'access_restricted', 'http_error']);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value));

test('reviewed source registry separates link checks from substantive reviews', () => {
  assert.ok(registry.length >= 30);
  assert.equal(new Set(registry.map(source => source.source_id)).size, registry.length);
  for (const source of registry) {
    assert.match(source.source_id, /^[a-z0-9-]+$/);
    assert.equal(new URL(source.canonical_url).protocol, 'https:', source.source_id);
    assert.ok(source.last_content_reviewed_at === null || validDate(source.last_content_reviewed_at), source.source_id);
    assert.ok(typeof source.review_status === 'string' && source.review_status.trim(), source.source_id);
    assert.ok(source.next_review_at === null || validDate(source.next_review_at), source.source_id);
    assert.ok(source.last_link_checked_at === null || validDate(source.last_link_checked_at), source.source_id);
    assert.ok(linkStatuses.has(source.link_status), source.source_id);
    assert.ok(Array.isArray(source.known_issues) && source.known_issues.every(issue => typeof issue === 'string' && issue.trim()), source.source_id);
    assert.ok(source.review_notes === null || typeof source.review_notes === 'string', source.source_id);
    if (source.review_status === 'reviewed') assert.ok(source.last_content_reviewed_at, `${source.source_id}: reviewed date missing`);
  }
});
