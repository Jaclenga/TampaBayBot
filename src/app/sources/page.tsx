import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sources } from "@/lib/corpus";
import { en } from "@/lib/i18n/en";
import { dateLabel } from "@/lib/i18n/format";
import { SourceLink } from "@/components/site-shell";
export const metadata: Metadata = { title: "Public sources | TampaBayBot" };
export default function Sources() {
  return (
    <main id="main" className="document-page content-width">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {en.sourcePage.back}
      </Link>
      <div className="page-intro">
        <h1>{en.sourcePage.title}</h1>
        <p>{en.sourcePage.description}</p>
      </div>
      <div className="source-grid">
        {sources.map((source) => (
          <article className="source-card" key={source.source_id}>
            <div className="source-meta">
              <span>
                {source.authoritative_status === "first-party"
                  ? en.sourcePage.official
                  : en.sourcePage.independent}
              </span>
              <span>{source.source_type.toUpperCase()}</span>
            </div>
            <h2>{source.title}</h2>
            <p className="source-agency">{source.agency}</p>
            <p>{source.description}</p>
            <div className="source-coverage">
              {source.geographic_coverage}
            </div>
            <dl>
              <div>
                <dt>{en.sourcePage.retrieved}</dt>
                <dd>{dateLabel(source.retrieval_date)}</dd>
              </div>
              <div>
                <dt>{en.answer.updated}</dt>
                <dd>{dateLabel(source.source_updated_date)}</dd>
              </div>
              <div>
                <dt>{en.sourcePage.frequency}</dt>
                <dd>{source.expected_refresh_frequency}</dd>
              </div>
            </dl>
            <SourceLink url={source.canonical_url} className="text-link">
              {en.sourcePage.view}
            </SourceLink>
            <details>
              <summary>{en.labels.sourceTerms}</summary>
              <p>{source.notes}</p>
              <p>{source.license_or_terms_status}</p>
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
