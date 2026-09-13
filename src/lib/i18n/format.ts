export const dateFormatEn = {
  unknownDate: "Not provided by source",
  asListedBySource: "as listed by source",
};

/** ISO source dates display in UTC; opaque source text remains visible without interpreting it. */
export function dateLabel(value: string | null | undefined, locale: 'en' | 'es' = 'en'): string {
  const copy = locale === 'es' ? { unknownDate: 'La fuente no indica la fecha', asListedBySource: 'según la fuente' } : dateFormatEn;
  if (typeof value !== "string" || !value.trim())
    return copy.unknownDate;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const original = clean.length > 100 ? `${clean.slice(0, 99)}…` : clean;
  const asProvided = `${original} (${copy.asListedBySource})`;
  if (
    !/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/.test(
      value,
    )
  )
    return asProvided;
  const day = value.slice(0, 10);
  const calendar = new Date(`${day}T00:00:00Z`);
  const date = new Date(value);
  if (
    !Number.isFinite(calendar.valueOf()) ||
    calendar.toISOString().slice(0, 10) !== day ||
    !Number.isFinite(date.valueOf())
  )
    return asProvided;
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
