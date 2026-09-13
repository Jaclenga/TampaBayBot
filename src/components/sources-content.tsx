"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import type { Source } from "@/lib/core/answer.mjs";
import { JURISDICTIONS } from "@/lib/coverage.mjs";
import { jurisdictionLabel } from "@/lib/i18n/public-text.mjs";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
import { dateLabel } from "@/lib/i18n/format";
import { SourceLink } from "@/components/site-shell";
import { isAuthoritative } from "@/lib/retrieval/search.mjs";
import { paginateSources } from "@/lib/source-list.mjs";

export default function SourcesContent({ sources }: { sources: Source[] }) {
  const { locale, copy: en } = useLocale();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsSummary = useRef<HTMLParagraphElement>(null);
  const results = useMemo(() => paginateSources(sources, query, page, 6, locale), [sources, query, page, locale]);
  usePageTitle(`${en.sourcePage.title} | ${en.brand}`);

  function goToPage(nextPage: number) {
    if (nextPage === results.page) return;
    setPage(nextPage);
    requestAnimationFrame(() => resultsSummary.current?.focus());
  }
  return (
    <main id="main" lang={locale} className="document-page content-width">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {en.sourcePage.back}
      </Link>
      <div className="page-intro">
        <h1>{en.sourcePage.title}</h1>
        <p>{en.sourcePage.description}</p>
        <p className="small muted">{en.sourcePage.original}</p>
      </div>
      <div className="source-search" role="search" aria-label={en.sourcePage.search}>
        <label htmlFor="source-search">{en.sourcePage.search}</label>
        <div className="source-search-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchInput}
            id="source-search"
            type="search"
            value={query}
            placeholder={en.sourcePage.searchPlaceholder}
            aria-controls="public-source-list"
            onChange={event => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          {query && (
            <button className="text-button" type="button" onClick={() => {
              setQuery("");
              setPage(1);
              searchInput.current?.focus();
            }}>
              {en.sourcePage.clearSearch}
            </button>
          )}
        </div>
      </div>
      <p ref={resultsSummary} className="source-results-summary small muted" role="status" tabIndex={-1}>
        {en.sourcePage.showing(results.start, results.end, results.total)}
      </p>
      <div className="source-grid" id="public-source-list">
        {results.items.map((source) => (
          <article className="source-card" key={source.source_id}>
            <div className="source-meta">
              <span>
                {source.demo === true ? en.sourcePage.synthetic : isAuthoritative(source)
                  ? en.sourcePage.official
                  : en.sourcePage.independent}
              </span>
              <span>{source.source_type?.toUpperCase()}</span>
            </div>
            <h2 lang={source.language === 'es' ? 'es' : 'en'}>{source.title}</h2>
            <p className="source-agency" lang={source.language === 'es' ? 'es' : 'en'}>{source.agency}</p>
            <p lang="en">{String(source.description ?? '')}</p>
            <div className="source-coverage">
              {en.sourcePage.coverage}: {(source.jurisdiction_ids ?? []).map(id => jurisdictionLabel(JURISDICTIONS.find(area => area.id === id)?.label ?? id, locale)).join(', ')}
            </div>
            <dl>
              <div>
                <dt>{en.sourcePage.retrieved}</dt>
                <dd>{dateLabel(source.retrieval_date, locale)}</dd>
              </div>
              <div>
                <dt>{en.answer.updated}</dt>
                <dd>{dateLabel(source.source_updated_date, locale)}</dd>
              </div>
              <div>
                <dt>{en.sourcePage.frequency}</dt>
                <dd>{typeof source.refresh_days === 'number' ? `${source.refresh_days} ${en.sourcePage.refreshDays}` : <span lang="en">{String(source.expected_refresh_frequency ?? '')}</span>}</dd>
              </div>
            </dl>
            <SourceLink url={source.canonical_url} className="text-link">
              {en.sourcePage.view}
            </SourceLink>
            <details>
              <summary>{en.labels.sourceTerms}</summary>
              <p lang="en">{String(source.geographic_coverage ?? '')}</p>
              <p lang="en">{String(source.notes ?? '')}</p>
              <p lang="en">{String(source.license_or_terms_status ?? '')}</p>
              <p className="small">
                {en.labels.sourceId}: {source.source_id}
              </p>
            </details>
          </article>
        ))}
      </div>
      {results.total === 0 && <p className="source-empty">{en.sourcePage.noResults}</p>}
      {results.totalPages > 1 && (
        <nav className="source-pagination" aria-label={en.sourcePage.pagination}>
          <p className="small muted">{en.sourcePage.pageStatus(results.page, results.totalPages)}</p>
          <div className="source-page-buttons">
            <button type="button" disabled={results.page === 1} aria-controls="public-source-list" onClick={() => goToPage(1)}>{en.sourcePage.first}</button>
            <button type="button" disabled={results.page === 1} aria-controls="public-source-list" onClick={() => goToPage(results.page - 1)}>{en.sourcePage.previous}</button>
            {results.pageNumbers.map(number => (
              <button key={number} type="button" aria-label={en.sourcePage.pageLabel(number)} aria-current={number === results.page ? "page" : undefined} aria-controls="public-source-list" onClick={() => goToPage(number)}>{number}</button>
            ))}
            <button type="button" disabled={results.page === results.totalPages} aria-controls="public-source-list" onClick={() => goToPage(results.page + 1)}>{en.sourcePage.next}</button>
            <button type="button" disabled={results.page === results.totalPages} aria-controls="public-source-list" onClick={() => goToPage(results.totalPages)}>{en.sourcePage.last}</button>
          </div>
        </nav>
      )}
      <section className="method-callout">
        <div>
          <h2>{en.sourcePage.method}</h2>
          <p>{en.sourcePage.methodText}</p>
          <p>{en.sourcePage.method2}</p>
          <Link href="/about" className="text-link">
            {en.labels.projectAbout}
          </Link>
        </div>
      </section>
    </main>
  );
}
