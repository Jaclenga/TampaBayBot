import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { auditResourceFreshness, checkResourceUrl, freshnessMarkdown, resourceRecords, semanticHtmlFingerprint } from '../src/lib/ingestion/resource-freshness.mjs';
import { sourceChange } from '../src/lib/ingestion/refresh.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/resource-freshness.json', import.meta.url), 'utf8'));
const now = () => '2026-10-14T12:00:00.000Z';
const html = body => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const result = (status, headers) => new Response(null, { status, headers });

test('offline report uses stored metadata and never calls the network', async () => {
  const report = await auditResourceFreshness({ ...fixture, now, fetchImpl: () => { throw new Error('network used'); } });
  assert.equal(report.mode, 'offline');
  assert.equal(report.summary.unique_links_checked, 0);
  assert.equal(report.resources.find(item => item.resource_id === 'overdue-clinic').attention.some(item => item.code === 'review_overdue'), true);
  assert.equal(report.resources.find(item => item.resource_id === 'fresh-shelter').last_content_reviewed_at, '2026-10-01');
  assert.match(freshnessMarkdown(report), /review_overdue/);
});

test('offline audit rejects duplicate IDs and invalid review dates', async () => {
  const duplicate = structuredClone(fixture.directory);
  duplicate.resources.push(structuredClone(duplicate.resources[0]));
  await assert.rejects(auditResourceFreshness({ directory: duplicate, sources: fixture.sources, now }), /duplicate resource ID/);
  const badDate = structuredClone(fixture.directory);
  badDate.resources[0].nextReviewAt = '2026-02-30';
  await assert.rejects(auditResourceFreshness({ directory: badDate, sources: fixture.sources, now }), /Invalid next review date/);
});

test('the earlier configured date or review interval flags an overdue resource', async () => {
  const directory = structuredClone(fixture.directory);
  directory.resources[0].verifiedAt = '2026-10-01';
  directory.resources[0].refreshDays = 90;
  directory.resources[0].nextReviewAt = '2026-10-10';
  directory.resources[1].verifiedAt = '2026-09-01';
  directory.resources[1].refreshDays = 30;
  directory.resources[1].nextReviewAt = '2026-12-01';
  const report = await auditResourceFreshness({ directory, sources: [], now });
  for (const id of ['fresh-shelter', 'changed-program']) {
    assert.ok(report.resources.find(item => item.resource_id === id).attention.some(item => item.code === 'review_overdue'));
  }
  assert.equal(report.resources.find(item => item.resource_id === 'changed-program').effective_review_due_at, '2026-10-01');
});

test('semantic fingerprint excludes navigation changes and detects program text changes', () => {
  assert.equal(semanticHtmlFingerprint(fixture.oldHtml), semanticHtmlFingerprint(fixture.oldHtml.replace('Old footer', 'New footer').replace('Menu', 'Different menu')));
  assert.notEqual(semanticHtmlFingerprint(fixture.oldHtml), semanticHtmlFingerprint(fixture.newHtml));
});

test('successful link checks do not advance human review or availability', async () => {
  const directory = structuredClone(fixture.directory);
  directory.resources[1].reviewedContentHash = semanticHtmlFingerprint(fixture.oldHtml);
  directory.resources[1].availabilityStatus = 'unknown';
  directory.resources[0].question = 'PRIVATE RESIDENT INPUT';
  directory.resources[0].sourceUrl = 'https://example.org/shelter?token=PRIVATE_URL_TOKEN';
  const fetchImpl = async url => html(url.pathname === '/program' ? fixture.newHtml : fixture.oldHtml);
  const report = await auditResourceFreshness({ directory, sources: fixture.sources, live: true, now, fetchImpl, wait: async () => {} });
  const changed = report.resources.find(item => item.resource_id === 'changed-program');
  assert.equal(changed.link_status, 'ok');
  assert.equal(changed.content.status, 'potential_change');
  assert.ok(changed.attention.some(item => item.code === 'potential_content_change'));
  assert.equal(changed.last_content_reviewed_at, '2026-10-01');
  assert.equal(changed.review_status, 'source_checked');
  assert.equal(directory.resources[1].availabilityStatus, 'unknown');
  assert.ok(!JSON.stringify(report).includes('PRIVATE RESIDENT INPUT'));
  assert.ok(!JSON.stringify(report).includes('PRIVATE_URL_TOKEN'));
  assert.ok(!JSON.stringify(report).includes('Call the official provider'));
  assert.equal(report.summary.unique_links_checked, 5);
});

test('a broken intake link is not hidden by a successful program page', async () => {
  const directory = structuredClone(fixture.directory);
  directory.resources[0].intakeUrl = 'https://example.org/intake';
  const report = await auditResourceFreshness({ directory, sources: [], live: true, now, wait: async () => {},
    fetchImpl: async url => url.pathname === '/intake' ? result(404) : html(fixture.oldHtml) });
  const shelter = report.resources.find(item => item.resource_id === 'fresh-shelter');
  assert.equal(shelter.link_status, 'broken');
  assert.ok(shelter.attention.some(item => item.code === 'link_broken' && item.role === 'intake'));
});

test('redirect is recorded without following or storing query tokens', async () => {
  let calls = 0;
  const checked = await checkResourceUrl('https://example.org/original', { now, fetchImpl: async () => {
    calls++;
    return result(301, { location: 'https://official.example/new?token=PRIVATE#section' });
  } });
  assert.equal(calls, 1);
  assert.equal(checked.status, 'redirect');
  assert.equal(checked.redirect_target, 'https://official.example/new');
  assert.ok(!JSON.stringify(checked).includes('PRIVATE'));
});

test('missing pages are broken while temporary failures and rate limits remain distinct', async () => {
  const missing = await checkResourceUrl('https://example.org/missing', { now, fetchImpl: async () => result(404) });
  assert.equal(missing.status, 'broken');
  assert.equal(missing.attempts, 1);
  let attempts = 0;
  const temporary = await checkResourceUrl('https://example.org/temporary', { now, maxAttempts: 2, wait: async () => {},
    fetchImpl: async () => { attempts++; return result(503); } });
  assert.equal(temporary.status, 'temporary_failure');
  assert.equal(attempts, 2);
  const limited = await checkResourceUrl('https://example.org/limited', { now, wait: async () => {},
    fetchImpl: async () => result(429, { 'retry-after': '120' }) });
  assert.equal(limited.status, 'rate_limited');
  assert.equal(limited.reason, 'retry_after_exceeds_budget');
});

test('a transient server error can recover within the retry bound', async () => {
  let attempts = 0;
  const checked = await checkResourceUrl('https://example.org/recovered', { now, wait: async () => {}, fetchImpl: async () => {
    attempts++;
    return attempts === 1 ? result(503) : html(fixture.oldHtml);
  } });
  assert.equal(checked.status, 'ok');
  assert.equal(checked.attempts, 2);
});

test('timeouts stop after bounded attempts and never become broken links', async () => {
  const checked = await checkResourceUrl('https://example.org/slow', { now, timeoutMs: 5, totalTimeoutMs: 500,
    maxAttempts: 2, wait: async () => {}, fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }) });
  assert.equal(checked.status, 'temporary_failure');
  assert.equal(checked.reason, 'timeout');
  assert.equal(checked.attempts, 2);
});

test('invalid or insecure URLs are flagged without a network request', async () => {
  const checked = await checkResourceUrl('http://example.org/unsafe', { now,
    fetchImpl: () => { throw new Error('network used'); } });
  assert.equal(checked.status, 'http_error');
  assert.equal(checked.reason, 'invalid_url');
});

test('source-stage normalized changes require review only with a previous baseline', async () => {
  const stage = { sources: [{ source_id: 'official-rag-source', result: 'acquired',
    before: { normalized_content_hash: 'a'.repeat(64) }, after: { normalized_content_hash: 'b'.repeat(64) } }] };
  const report = await auditResourceFreshness({ ...fixture, now, sourceStageReport: stage });
  const source = report.resources.find(item => item.resource_id === 'official-rag-source');
  assert.equal(source.content.status, 'potential_change');
  assert.ok(source.attention.some(item => item.code === 'potential_content_change'));
  stage.sources[0].before.normalized_content_hash = null;
  const initial = await auditResourceFreshness({ ...fixture, now, sourceStageReport: stage });
  assert.equal(initial.resources.find(item => item.resource_id === 'official-rag-source').content.status, 'baseline_missing');
});

test('freshness metadata edits do not count as retrieval configuration changes', () => {
  const before = { source_id: 'official-rag-source', canonical_url: 'https://example.org/rag', review_status: 'needs_review', last_link_checked_at: null };
  const after = { ...before, review_status: 'reviewed', last_content_reviewed_at: '2026-10-14', last_link_checked_at: '2026-10-14T12:00:00.000Z' };
  assert.deepEqual(sourceChange(before, after, [], []).configuration_fields_changed, []);
});

test('the normalized registry retains organization, category, jurisdiction and human review state', async () => {
  const records = resourceRecords(fixture.directory, fixture.sources);
  const housing = records.find(item => item.resource_id === 'fresh-shelter');
  assert.equal(housing.organization, 'Example Shelter');
  assert.deepEqual(housing.categories, ['emergency']);
  assert.deepEqual(housing.jurisdiction, ['hillsborough']);
  assert.equal(housing.last_content_reviewed_at, '2026-10-01');
  assert.equal(housing.review_status, 'source_checked');
  const report = await auditResourceFreshness({ ...fixture, now });
  const entry = report.resources.find(item => item.resource_id === 'fresh-shelter');
  assert.equal(report.schema_version, 2);
  assert.equal(entry.url, 'https://example.org/shelter');
  assert.equal(entry.factual_verification.status, 'source_checked');
  assert.equal(entry.factual_verification.eligibility, 'not_checked_by_monitor');
  assert.equal(entry.factual_verification.hours, 'not_checked_by_monitor');
  assert.equal(entry.factual_verification.contact_details, 'not_checked_by_monitor');
  assert.equal(report.summary.actionable_findings, 0, 'offline metadata alone does not create issues');
});

test('live actionable findings separate broken links, redirects and overdue reviews from transient failures', async () => {
  const directory = structuredClone(fixture.directory);
  directory.resources[0].intakeUrl = 'https://example.org/intake?private=TOKEN';
  directory.resources[1].sourceUrl = 'https://example.org/program-source';
  const report = await auditResourceFreshness({ directory, sources: fixture.sources, live: true, now,
    hostIntervalMs: 0, checkOptions: { maxAttempts: 1 },
    fetchImpl: async url => {
      if (url.pathname === '/intake') return result(404);
      if (url.pathname === '/program-source') return result(301, { location: 'https://example.org/new-program?private=TOKEN' });
      if (url.pathname === '/rag') return result(503);
      return html(fixture.oldHtml);
    } });
  assert.deepEqual(report.actionable.map(item => item.code).sort(),
    ['link_broken', 'link_redirect_review', 'review_overdue']);
  assert.equal(report.summary.actionable_findings, 3);
  assert.equal(report.actionable.find(item => item.code === 'link_broken').url, 'https://example.org/intake');
  assert.ok(!JSON.stringify(report).includes('TOKEN'));
  assert.equal(report.resources.find(item => item.resource_id === 'official-rag-source').link_status, 'temporary_failure');
  assert.match(freshnessMarkdown(report), /## Actionable findings/);
});

test('host rate limit spaces requests to the same publisher even with concurrent workers', async () => {
  let time = 0;
  const starts = [];
  const report = await auditResourceFreshness({ ...fixture, live: true, now, concurrency: 4,
    hostIntervalMs: 200, rateClock: () => time, wait: async delay => { time += delay; },
    fetchImpl: async () => { starts.push(time); return result(204); } });
  assert.deepEqual(starts, [0, 200, 400, 600]);
  assert.equal(report.summary.unique_links_checked, 4);
  assert.equal(report.check_policy.per_host_interval_ms, 200);
  assert.equal(report.check_policy.max_attempts, 3);
  assert.equal(report.check_policy.timeout_ms, 8000);
});

test('retry attempts also respect the per-host interval', async () => {
  let time = 0;
  const starts = [];
  const directory = { resources: [structuredClone(fixture.directory.resources[0])] };
  const report = await auditResourceFreshness({ directory, sources: [], live: true, now,
    hostIntervalMs: 500, rateClock: () => time, wait: async delay => { time += delay; },
    checkOptions: { maxAttempts: 2 }, fetchImpl: async () => {
      starts.push(time);
      return starts.length === 1 ? result(503) : result(204);
    } });
  assert.deepEqual(starts, [0, 500]);
  assert.equal(report.resources[0].link_status, 'ok');
});

test('link-only operational records do not acquire a fabricated factual verification', async () => {
  const operationalRecords = [{ catalog: 'operational', resource_id: 'county-map',
    organization: 'Example County GIS', categories: ['property'], jurisdiction: ['pasco'],
    authority: 'official', official_url: 'https://gis.example.org/MapServer/0', link_only: true,
    last_content_reviewed_at: null, review_status: 'needs_review', next_review_at: null,
    review_interval_days: null, last_link_checked_at: null, link_status: 'not_checked',
    known_issues: [], reviewed_content_hash: null,
    links: [{ role: 'gis_parcel', url: 'https://gis.example.org/MapServer/0' }] }];
  const report = await auditResourceFreshness({ directory: { resources: [] }, sources: [], operationalRecords, now });
  const entry = report.resources[0];
  assert.equal(entry.factual_verification.status, 'not_applicable');
  assert.equal(entry.factual_verification.last_verified_at, null);
  assert.ok(!entry.attention.some(item => item.code === 'human_review_needed'));
  assert.equal(report.actionable.length, 0);
});
