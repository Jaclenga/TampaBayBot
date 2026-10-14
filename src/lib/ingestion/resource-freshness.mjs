import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { load } from 'cheerio';
import { readBoundedBody, retryDelay } from './fetch.mjs';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const LINK_PRIORITY = ['broken', 'redirect', 'rate_limited', 'temporary_failure', 'access_restricted', 'http_error', 'not_checked', 'ok'];
const LINK_STATUSES = new Set(LINK_PRIORITY);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(value).digest('hex');

function clean(text) { return String(text ?? '').replace(/\s+/g, ' ').trim(); }
function dateOnly(value) { return String(value ?? '').slice(0, 10); }
function reviewIntervalDue(reviewedAt, days) {
  if (!reviewedAt || !Number.isInteger(days) || days < 1) return null;
  const start = Date.parse(`${dateOnly(reviewedAt)}T00:00:00.000Z`);
  return Number.isFinite(start) ? new Date(start + days * 86_400_000).toISOString().slice(0, 10) : null;
}
function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function validOfficialUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
function validateRecords(records) {
  const ids = new Set();
  for (const record of records) {
    const key = `${record.catalog}:${record.resource_id}`;
    if (!/^[a-z0-9-]+$/.test(record.resource_id ?? '') || ids.has(key)) throw new Error(`Invalid or duplicate resource ID: ${key}`);
    ids.add(key);
    if (!validOfficialUrl(record.official_url)) throw new Error(`Invalid official source URL: ${key}`);
    if (record.last_content_reviewed_at !== null && record.last_content_reviewed_at !== undefined &&
        !(validCalendarDate(record.last_content_reviewed_at) ||
          record.catalog === 'rag' && validCalendarDate(dateOnly(record.last_content_reviewed_at)) &&
          Number.isFinite(Date.parse(record.last_content_reviewed_at)))) throw new Error(`Invalid content review date: ${key}`);
    if (record.next_review_at !== null && record.next_review_at !== undefined &&
        !validCalendarDate(record.next_review_at)) throw new Error(`Invalid next review date: ${key}`);
    if (record.last_link_checked_at !== null && record.last_link_checked_at !== undefined &&
        (typeof record.last_link_checked_at !== 'string' || !Number.isFinite(Date.parse(record.last_link_checked_at)))) throw new Error(`Invalid link check date: ${key}`);
    if (!LINK_STATUSES.has(record.link_status)) throw new Error(`Invalid link status: ${key}`);
    if (typeof record.review_status !== 'string' || !record.review_status.trim()) throw new Error(`Missing review status: ${key}`);
    if (!Array.isArray(record.known_issues) || record.known_issues.some(issue => typeof issue !== 'string' || !issue.trim())) throw new Error(`Invalid known issues: ${key}`);
    if (record.reviewed_content_hash && !/^[a-f0-9]{64}$/.test(record.reviewed_content_hash)) throw new Error(`Invalid reviewed content hash: ${key}`);
  }
}
function uniqueLinks(links) {
  const byUrl = new Map();
  for (const link of links) {
    if (!link.url) continue;
    if (!byUrl.has(link.url)) byUrl.set(link.url, { role: link.role, url: link.url });
    else byUrl.get(link.url).role += `+${link.role}`;
  }
  return [...byUrl.values()];
}

/** Only authored, public URLs are checked. No resident request or browser state is read. */
export function resourceRecords(directory, sources) {
  const housing = directory.resources.map(resource => ({
    catalog: 'housing', resource_id: resource.id, official_url: resource.sourceUrl,
    last_content_reviewed_at: resource.verifiedAt,
    review_status: resource.verificationStatus,
    next_review_at: resource.nextReviewAt,
    review_interval_days: resource.refreshDays,
    last_link_checked_at: resource.lastLinkCheckedAt,
    link_status: resource.linkStatus,
    known_issues: resource.knownIssues,
    reviewed_content_hash: resource.reviewedContentHash,
    links: uniqueLinks([
      { role: 'resource', url: resource.url },
      { role: 'official_source', url: resource.sourceUrl },
      { role: 'intake', url: resource.intakeUrl },
      ...(resource.contacts ?? []).filter(contact => contact.kind === 'web').map(contact => ({ role: 'contact', url: contact.value })),
    ]),
  }));
  const rag = sources.map(source => ({
    catalog: 'rag', resource_id: source.source_id, official_url: source.canonical_url,
    last_content_reviewed_at: source.last_content_reviewed_at,
    review_status: source.review_status,
    next_review_at: source.next_review_at,
    review_interval_days: source.refresh_days,
    last_link_checked_at: source.last_link_checked_at,
    link_status: source.link_status,
    known_issues: source.known_issues,
    reviewed_content_hash: null,
    links: uniqueLinks([
      { role: 'official_source', url: source.canonical_url },
      { role: 'acquisition', url: source.fetch_url },
      { role: 'next_step', url: source.next_step?.url },
      ...(source.related_endpoints ?? []).map(endpoint => ({ role: `endpoint:${endpoint.role}`, url: endpoint.url })),
    ]),
  }));
  return [...housing, ...rag];
}

/** Hash visible semantic blocks, excluding common navigation and form chrome. */
export function semanticHtmlFingerprint(html) {
  const $ = load(html);
  $('script,style,noscript,nav,footer,aside,form,svg,iframe,.breadcrumb').remove();
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body').first();
  const blocks = root.find('h1,h2,h3,h4,h5,h6,p,li,tr,address').toArray()
    .filter(node => !$(node).parents('li,tr,address').length)
    .map(node => clean($(node).text())).filter(text => text.length > 12);
  // No text to compare is an unavailable comparison, never a matched review.
  return blocks.length ? hash(JSON.stringify(blocks)) : null;
}

function safeRedirectTarget(location, base) {
  if (!location) return null;
  try {
    const target = new URL(location, base);
    if (!['https:', 'http:'].includes(target.protocol)) return null;
    target.username = ''; target.password = ''; target.search = ''; target.hash = '';
    return target.href;
  } catch { return null; }
}
function publicUrl(input) {
  try {
    const url = new URL(input);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.href;
  } catch { return '[invalid URL]'; }
}

function responseStatus(code) {
  if (REDIRECTS.has(code)) return 'redirect';
  if (code === 404 || code === 410) return 'broken';
  if (code === 429) return 'rate_limited';
  if (RETRYABLE.has(code) || code >= 500) return 'temporary_failure';
  if (code === 401 || code === 403) return 'access_restricted';
  if (code >= 200 && code < 300) return 'ok';
  return 'http_error';
}

function cancelBody(response) { try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* best effort */ } }

/** GET uses manual redirect handling and the same bounded body/retry helpers as source ingestion. */
export async function checkResourceUrl(input, {
  fetchImpl = fetch, now = () => new Date().toISOString(), wait = sleep,
  maxAttempts = 3, timeoutMs = 8000, totalTimeoutMs = 30000,
  maxHtmlBytes = 1024 * 1024, clock = () => performance.now(), wallClock = Date.now,
} = {}) {
  const checkedAt = now();
  let url;
  try { url = new URL(input); } catch { return { status: 'http_error', checked_at: checkedAt, attempts: 0, reason: 'invalid_url' }; }
  if (url.protocol !== 'https:' || url.username || url.password) return { status: 'http_error', checked_at: checkedAt, attempts: 0, reason: 'invalid_url' };
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5 || timeoutMs < 1 || timeoutMs > 45000 ||
      totalTimeoutMs < 1 || totalTimeoutMs > 180000 || !Number.isInteger(maxHtmlBytes) || maxHtmlBytes < 1024 || maxHtmlBytes > 30 * 1024 * 1024) {
    throw new Error('Invalid bounded resource-check configuration');
  }
  const deadline = clock() + totalTimeoutMs;
  let last = { status: 'temporary_failure', checked_at: checkedAt, attempts: 0, reason: 'not_attempted' };
  for (let index = 0; index < maxAttempts; index++) {
    const remaining = deadline - clock();
    if (remaining <= 0) return { ...last, reason: 'retry_budget_exhausted' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    let response;
    try {
      response = await Promise.race([
        fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal,
          headers: { 'User-Agent': 'TampaBayBot/0.1 (public-source research; github.com/Jaclenga/TampaBayBot)', Accept: '*/*' } }),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('request_timeout')), { once: true })),
      ]);
      if (controller.signal.aborted) throw new Error('request_timeout');
      const status = responseStatus(response.status);
      last = { status, checked_at: checkedAt, attempts: index + 1, http_status: response.status };
      if (status === 'redirect') {
        last.redirect_target = safeRedirectTarget(response.headers.get('location'), url);
        cancelBody(response); return last;
      }
      if (status === 'ok') {
        const type = response.headers.get('content-type') ?? '';
        if (/\btext\/html\b/i.test(type)) {
          try {
            const bytes = await readBoundedBody(response, { maxBytes: maxHtmlBytes, signal: controller.signal,
              deadline: Math.min(deadline, clock() + Math.min(timeoutMs, remaining)), clock });
            last.content_fingerprint = semanticHtmlFingerprint(bytes.toString('utf8'));
            last.content_check = last.content_fingerprint ? 'hashed' : 'no_semantic_blocks';
          } catch (error) {
            last.content_check = error.code === 'source_size_limit' ? 'too_large' : 'read_failed';
          }
        } else { last.content_check = 'unsupported_type'; cancelBody(response); }
        return last;
      }
      const retryAfter = response.headers.get('retry-after');
      cancelBody(response);
      if (!RETRYABLE.has(response.status) || index + 1 === maxAttempts) return last;
      let delay;
      try { delay = retryDelay(retryAfter, index, { now: wallClock(), baseDelayMs: 250, maxDelayMs: 2000 }); }
      catch { return { ...last, reason: 'retry_after_exceeds_budget' }; }
      if (clock() + delay >= deadline) return { ...last, reason: 'retry_budget_exhausted' };
      await wait(delay);
    } catch (error) {
      last = { status: 'temporary_failure', checked_at: checkedAt, attempts: index + 1,
        reason: controller.signal.aborted || error.message === 'request_timeout' ? 'timeout' : 'network_error' };
      if (index + 1 === maxAttempts) return last;
      const delay = Math.min(2000, 250 * 2 ** index);
      if (clock() + delay >= deadline) return { ...last, reason: 'retry_budget_exhausted' };
      await wait(delay);
    } finally { clearTimeout(timer); }
  }
  return last;
}

async function mapLimited(values, limit, operation) {
  const result = new Array(values.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) { const index = cursor++; if (index >= values.length) break; result[index] = await operation(values[index]); }
  }));
  return result;
}

function stageChanges(report) {
  const byId = new Map();
  for (const source of report?.sources ?? []) byId.set(source.source_id, source);
  return byId;
}

function reason(code, role) { return role ? { code, role } : { code }; }
function mostSevere(statuses) { return LINK_PRIORITY.find(status => statuses.includes(status)) ?? 'not_checked'; }

export async function auditResourceFreshness({ directory, sources, sourceStageReport = null,
  live = false, now = () => new Date().toISOString(), fetchImpl, wait, checkOptions = {}, concurrency = 4 } = {}) {
  if (!Array.isArray(directory?.resources) || !Array.isArray(sources)) throw new Error('Housing catalog and source registry are required');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('Resource check concurrency must be 1–8');
  const records = resourceRecords(directory, sources);
  validateRecords(records);
  const generatedAt = now(); const today = dateOnly(generatedAt);
  const checked = new Map();
  if (live) {
    const urls = [...new Set(records.flatMap(record => record.links.map(link => link.url)))];
    const results = await mapLimited(urls, concurrency, url => checkResourceUrl(url, { fetchImpl, wait, now, ...checkOptions }));
    urls.forEach((url, index) => checked.set(url, results[index]));
  }
  const staged = stageChanges(sourceStageReport);
  const resources = records.map(record => {
    const intervalDue = reviewIntervalDue(record.last_content_reviewed_at, record.review_interval_days);
    const effectiveDue = [record.next_review_at, intervalDue].filter(Boolean).sort()[0] ?? null;
    const links = record.links.map(link => ({ role: link.role, url: publicUrl(link.url),
      ...(live ? checked.get(link.url) : { status: record.link_status ?? 'not_checked', checked_at: record.last_link_checked_at ?? null }),
    }));
    const linkStatus = mostSevere(links.map(link => link.status));
    const attention = [];
    if (record.review_status !== 'source_checked' && record.review_status !== 'reviewed') attention.push(reason('human_review_needed'));
    if (effectiveDue && effectiveDue < today) attention.push(reason('review_overdue'));
    if (!record.next_review_at && record.review_status === 'reviewed') attention.push(reason('next_review_date_missing'));
    if ((record.known_issues ?? []).length) attention.push(reason('known_issue'));
    for (const link of links) {
      if (link.status !== 'ok') attention.push(reason(`link_${link.status}`, link.role));
    }
    const content = { status: 'not_compared', baseline: record.catalog === 'housing' ? 'reviewedContentHash' : 'normalized_content_hash' };
    if (record.catalog === 'housing' && live) {
      const sourceCheck = checked.get(record.official_url);
      if (sourceCheck?.content_fingerprint) {
        content.observed_hash = sourceCheck.content_fingerprint;
        content.status = !record.reviewed_content_hash ? 'baseline_missing'
          : record.reviewed_content_hash === sourceCheck.content_fingerprint ? 'unchanged' : 'potential_change';
      } else content.status = sourceCheck?.content_check ?? 'unavailable';
      if (content.status === 'potential_change') attention.push(reason('potential_content_change'));
    }
    if (record.catalog === 'rag' && sourceStageReport) {
      const change = staged.get(record.resource_id);
      if (change?.result === 'acquired' && change.before?.normalized_content_hash &&
          change.after?.normalized_content_hash && change.before.normalized_content_hash !== change.after.normalized_content_hash) {
        content.status = 'potential_change'; attention.push(reason('potential_content_change'));
      } else if (change?.result === 'acquired' && !change.before?.normalized_content_hash) content.status = 'baseline_missing';
      else if (change?.result === 'unavailable') {
        content.status = 'acquisition_failed';
        content.stage_error_code = /^[a-z][a-z0-9_]{0,100}$/.test(change.error_code ?? '') ? change.error_code : 'unspecified';
        attention.push(reason('source_acquisition_failed'));
      }
      else if (change?.result === 'acquired') content.status = 'unchanged';
    }
    return { catalog: record.catalog, resource_id: record.resource_id, official_url: publicUrl(record.official_url),
      last_content_reviewed_at: record.last_content_reviewed_at ?? null, review_status: record.review_status,
      next_review_at: record.next_review_at ?? null, effective_review_due_at: effectiveDue,
      previous_link_check_at: record.last_link_checked_at ?? null,
      link_status: linkStatus, links, content, attention };
  });
  const byReason = {};
  for (const resource of resources) for (const item of resource.attention) byReason[item.code] = (byReason[item.code] ?? 0) + 1;
  return { schema_version: 1, mode: live ? 'live' : 'offline', generated_at: generatedAt,
    summary: { resources: resources.length, unique_links_checked: checked.size,
      resources_needing_attention: resources.filter(resource => resource.attention.length).length,
      by_reason: Object.fromEntries(Object.entries(byReason).sort(([a], [b]) => a.localeCompare(b))) },
    limitations: [
      'HTTP success checks link availability only. Program accuracy, eligibility, funding, deadlines, contacts and current capacity require human review.',
      'Potential content changes are comparison signals, not verified updates. A missing reviewed baseline cannot establish unchanged content.',
      'The report contains only public registry URLs, IDs, dates, status codes and hashes; it does not read resident requests.',
      ...(sourceStageReport?.status && sourceStageReport.status !== 'awaiting_review'
        ? ['Source staging was incomplete; RAG content-change comparison may be partial.'] : []),
    ], resources };
}

export function freshnessMarkdown(report) {
  const lines = [`# Resource freshness attention`, '', `Mode: ${report.mode}; generated: ${report.generated_at}.`,
    `Resources needing attention: ${report.summary.resources_needing_attention}/${report.summary.resources}. Unique links checked: ${report.summary.unique_links_checked}.`, '',
    'A successful link check does not verify program details or availability.', '', '## Reasons', ''];
  for (const [code, count] of Object.entries(report.summary.by_reason)) lines.push(`- ${code}: ${count}`);
  if (!Object.keys(report.summary.by_reason).length) lines.push('- None');
  lines.push('', '## Resources needing attention', '', '| Catalog | Resource ID | Reasons |', '| --- | --- | --- |');
  for (const resource of report.resources.filter(item => item.attention.length)) {
    const reasons = resource.attention.map(item => item.role ? `${item.code} (${item.role})` : item.code);
    lines.push(`| ${resource.catalog} | ${resource.resource_id} | ${reasons.join(', ')} |`);
  }
  if (!report.summary.resources_needing_attention) lines.push('| — | — | None |');
  lines.push('', 'Review the JSON report for URL, HTTP status, redirect target, check time, and content hash details.', '');
  return lines.join('\n');
}
