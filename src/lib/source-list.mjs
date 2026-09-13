import { JURISDICTIONS } from './coverage.mjs';
import { jurisdictionLabel } from './i18n/public-text.mjs';

const areaLabels = new Map(JURISDICTIONS.map(area => [area.id, area.label]));

function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Search public source metadata before slicing a stable, one-based page. */
export function paginateSources(sources, query, requestedPage, pageSize = 6, locale = 'en') {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const matches = terms.length ? sources.filter(source => {
    const areas = (source.jurisdiction_ids ?? []).flatMap(id => {
      const label = areaLabels.get(id) ?? id;
      return [id, label, jurisdictionLabel(label, locale)];
    });
    const text = normalize([
      source.title, source.agency, source.description, source.source_type,
      source.geographic_coverage, ...areas,
    ].filter(value => typeof value === 'string').join(' '));
    return terms.every(term => text.includes(term));
  }) : sources;
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 6;
  const total = matches.length;
  const totalPages = Math.ceil(total / size);
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages || 1);
  const offset = (page - 1) * size;
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  return {
    items: matches.slice(offset, offset + size),
    page,
    totalPages,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + size, total),
    pageNumbers: Array.from({ length: Math.min(5, totalPages) }, (_, index) => windowStart + index),
  };
}
