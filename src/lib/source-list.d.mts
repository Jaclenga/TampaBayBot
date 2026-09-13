import type { Source } from './core/answer.mjs';

export interface SourcePage<T extends Source> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  start: number;
  end: number;
  pageNumbers: number[];
}

export function paginateSources<T extends Source>(
  sources: readonly T[],
  query: string,
  requestedPage: number,
  pageSize?: number,
  locale?: 'en' | 'es',
): SourcePage<T>;
