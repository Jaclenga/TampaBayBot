"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Source } from "@/lib/core/answer.mjs";
import { JURISDICTIONS } from "@/lib/coverage.mjs";
import { jurisdictionLabel } from "@/lib/i18n/public-text.mjs";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
import { dateLabel } from "@/lib/i18n/format";
import { SourceLink } from "@/components/site-shell";
import { isAuthoritative } from "@/lib/retrieval/search.mjs";
export default function SourcesContent({ sources }: { sources: Source[] }) {
  const { locale, copy: en } = useLocale();
  usePageTitle(`${en.sourcePage.title} | ${en.brand}`);
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
      <div className="source-grid">
        {sources.map((source) => (
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
