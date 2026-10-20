"use client";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { sourceReviewState } from "@/lib/source-review.mjs";

const reviewLabels = {
  en: {
    distinction: "Automated link checks test access only. Eligibility, hours, contact details, and availability require a substantive source review and direct confirmation with the agency.",
    content: "Content review", lastReview: "Last substantive review", due: "Review due", link: "Automated link check", known: "Known source issue",
    reviewed: "Substantive review recorded", needsReview: "No substantive source review is recorded. Confirm current details with the agency.",
    overdue: "Content review is overdue. Check the official source before relying on its details.",
    linkWarning: {
      error: "A link returned an error at the last automated check. Confirm the destination directly; this does not establish whether the service is available.",
      inconclusive: "The automated link check was inconclusive. Confirm the destination directly.",
      redirect: "The link redirected at the last automated check. Confirm its destination before relying on it.",
    },
    linkStatus: { not_checked: "Not checked", ok: "Accessible at last check", redirect: "Redirected", broken: "Error", temporary_failure: "Temporary failure", rate_limited: "Rate limited", access_restricted: "Access restricted", http_error: "HTTP error" },
  },
  es: {
    distinction: "Las comprobaciones automáticas solo prueban el acceso al enlace. Los requisitos, horarios, contactos y disponibilidad requieren una revisión de la fuente y confirmación directa con la agencia.",
    content: "Revisión del contenido", lastReview: "Última revisión sustantiva", due: "Próxima revisión", link: "Comprobación automática del enlace", known: "Advertencia conocida de la fuente (en inglés)",
    reviewed: "Revisión sustantiva registrada", needsReview: "No consta una revisión sustantiva de la fuente. Confirme los detalles actuales con la agencia.",
    overdue: "La revisión del contenido está vencida. Consulte la fuente oficial antes de usar sus detalles.",
    linkWarning: {
      error: "Un enlace devolvió un error en la última comprobación automática. Confirme el destino directamente; esto no determina si el servicio está disponible.",
      inconclusive: "La comprobación automática del enlace no fue concluyente. Confirme el destino directamente.",
      redirect: "El enlace redirigió en la última comprobación automática. Confirme el destino antes de usarlo.",
    },
    linkStatus: { not_checked: "Sin comprobar", ok: "Accesible en la última comprobación", redirect: "Redirigió", broken: "Error", temporary_failure: "Fallo temporal", rate_limited: "Límite de solicitudes", access_restricted: "Acceso restringido", http_error: "Error HTTP" },
  },
} as const;

const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function SourcesContent({ sources }: { sources: Source[] }) {
  const { locale, copy: en } = useLocale();
  const ready = useSyncExternalStore(subscribeToReady, clientReady, serverReady);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsSummary = useRef<HTMLParagraphElement>(null);
  const results = useMemo(() => paginateSources(sources, query, page, 6, locale), [sources, query, page, locale]);
  const reviewText = reviewLabels[locale];
  usePageTitle(`${en.sourcePage.title} | ${en.brand}`);

  function goToPage(nextPage: number) {
    if (nextPage === results.page) return;
    setPage(nextPage);
    requestAnimationFrame(() => resultsSummary.current?.focus());
  }
  return (
    <main id="main" lang={locale} className="document-page content-width" tabIndex={-1}>
      <Link href="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {en.sourcePage.back}
      </Link>
      <div className="page-intro">
        <h1>{en.sourcePage.title}</h1>
        <p>{en.sourcePage.description}</p>
        <p className="small muted">{en.sourcePage.original}</p>
        <p className="small muted">{reviewText.distinction}</p>
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
            disabled={!ready}
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
        {results.items.map((source) => {
          const sourceLanguage = source.language === 'en' || source.language === 'es' ? source.language : 'und';
          const review = sourceReviewState(source);
          const linkStatus = source.link_status && source.link_status in reviewText.linkStatus
            ? reviewText.linkStatus[source.link_status as keyof typeof reviewText.linkStatus]
            : reviewText.linkStatus.not_checked;
          return (
          <article className="source-card" key={source.source_id}>
            <div className="source-meta">
              <span>
                {source.demo === true ? en.sourcePage.synthetic : isAuthoritative(source)
                  ? en.sourcePage.official
                  : en.sourcePage.independent}
              </span>
              <span>{source.source_type?.toUpperCase()}</span>
            </div>
            <h2 lang={sourceLanguage}>{source.title}</h2>
            <p className="source-agency"><strong>{en.answer.publisher}:</strong> <span lang={sourceLanguage}>{source.agency}</span></p>
            {(sourceLanguage === 'und' || (locale === 'es' && sourceLanguage === 'en')) && <p className="source-language-note small muted">{sourceLanguage === 'en' ? en.sourcePage.englishOnly : en.sourcePage.languageUnrecorded}</p>}
            <p lang={sourceLanguage}>{String(source.description ?? '')}</p>
            {review.content !== "reviewed" && <p className="source-review-caution"><strong>{reviewText.content}:</strong> {review.content === "overdue" ? reviewText.overdue : reviewText.needsReview} {review.content === "overdue" && review.dueDay && `${reviewText.due}: ${dateLabel(review.dueDay, locale)}.`}</p>}
            {source.known_issues?.map((issue) => <p className="source-review-caution" key={issue}><strong>{reviewText.known}:</strong> <span lang="en">{issue}</span></p>)}
            {review.link && <p className="source-review-caution"><strong>{reviewText.link}:</strong> {reviewText.linkWarning[review.link]}</p>}
            <div className="source-coverage">
              {en.sourcePage.coverage}: {(source.jurisdiction_ids ?? []).map(id => jurisdictionLabel(JURISDICTIONS.find(area => area.id === id)?.label ?? id, locale)).join(', ')}
            </div>
            <dl>
              <div>
                <dt>{en.sourcePage.retrieved}</dt>
                <dd>{dateLabel(source.retrieval_date, locale)}</dd>
              </div>
              {source.source_updated_date && <div>
                <dt>{en.answer.sourceDate}</dt>
                <dd>{dateLabel(source.source_updated_date, locale)}</dd>
              </div>}
              <div className="source-registry-url">
                <dt>{en.answer.sourceUrl}</dt>
                <dd><SourceLink url={source.canonical_url}>{source.canonical_url}</SourceLink></dd>
              </div>
              <div>
                <dt>{en.sourcePage.frequency}</dt>
                <dd>{typeof source.refresh_days === 'number' ? `${source.refresh_days} ${en.sourcePage.refreshDays}` : <span lang="en">{String(source.expected_refresh_frequency ?? '')}</span>}</dd>
              </div>
              <div><dt>{reviewText.content}</dt><dd>{review.content === "reviewed" ? reviewText.reviewed : review.content === "overdue" ? reviewText.overdue : reviewText.needsReview}</dd></div>
              {review.reviewedDay && <div><dt>{reviewText.lastReview}</dt><dd>{dateLabel(review.reviewedDay, locale)}</dd></div>}
              {review.dueDay && <div><dt>{reviewText.due}</dt><dd>{dateLabel(review.dueDay, locale)}</dd></div>}
              <div><dt>{reviewText.link}</dt><dd>{linkStatus}{source.last_link_checked_at ? ` · ${dateLabel(source.last_link_checked_at, locale)}` : ""}</dd></div>
            </dl>
            <SourceLink url={source.canonical_url} className="text-link">
              {en.sourcePage.view}
            </SourceLink>
            <details>
              <summary>{en.labels.sourceTerms}</summary>
              <p lang={sourceLanguage}>{String(source.geographic_coverage ?? '')}</p>
              <p lang={sourceLanguage}>{String(source.notes ?? '')}</p>
              <p lang={sourceLanguage}>{String(source.license_or_terms_status ?? '')}</p>
              <p className="small">
                {en.labels.sourceId}: {source.source_id}
              </p>
            </details>
          </article>
          );
        })}
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
