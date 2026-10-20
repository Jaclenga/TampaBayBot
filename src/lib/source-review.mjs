const DAY_MS = 86_400_000;

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

function dayEnd(day) {
  return day ? Date.parse(`${day}T23:59:59.999Z`) : NaN;
}

/** Human content review and automated link checks are independent. */
export function sourceReviewState(source, now = Date.now()) {
  const reviewedDay = calendarDay(source.last_content_reviewed_at);
  const explicitlyDue = calendarDay(source.next_review_at);
  const intervalDue = reviewedDay && Number.isInteger(source.refresh_days) && source.refresh_days > 0
    ? new Date(Date.parse(`${reviewedDay}T00:00:00Z`) + source.refresh_days * DAY_MS).toISOString().slice(0, 10)
    : null;
  const dueDay = [explicitlyDue, intervalDue].filter(Boolean).sort()[0] ?? null;
  const reviewed = ['reviewed', 'source_checked'].includes(source.review_status) && reviewedDay;
  const content = !reviewed ? 'needs_review' : dueDay && now > dayEnd(dueDay) ? 'overdue' : 'reviewed';
  const link = ['broken', 'http_error'].includes(source.link_status) ? 'error'
    : ['temporary_failure', 'rate_limited', 'access_restricted'].includes(source.link_status) ? 'inconclusive'
      : source.link_status === 'redirect' ? 'redirect' : null;
  return { content, reviewedDay, dueDay, link };
}
