"use client";
import Link from "next/link";
import { ArrowLeft, ArrowDownToLine } from "lucide-react";
import { evaluationEn } from "@/lib/i18n/evaluation-en";
import { evaluationEs } from "@/lib/i18n/evaluation-es";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
import { dateLabel } from "@/lib/i18n/format";

type QualityMetric = {
  passed: number;
  failed: number;
  notApplicable: number;
};

type AutomatedQuality = {
  factualAccuracy: QualityMetric;
  citationCorrectness: QualityMetric;
  citationCompleteness: QualityMetric;
};

type EvaluationData = {
  result: typeof import("@/evaluation/results/latest.json");
  suiteReport: Pick<typeof import("@/evaluation/suite/results/latest.json"), "mode" | "automatedQuality" | "completedAt" | "summary">;
  agentReviewCount: number;
};

export default function EvaluationContent({ result, suiteReport, agentReviewCount }: EvaluationData) {
  const { locale } = useLocale();
  const copy = locale === "es" ? evaluationEs : evaluationEn;
  usePageTitle(`${copy.title} | TampaBayBot`);
  if (result.benchmark_count === 0) return (
    <main id="main" lang={locale} className="document-page content-width">
      <Link href="/" className="back-link">{copy.back}</Link>
      <h1>{copy.title}</h1>
      <p>{copy.noEvaluation}</p>
      <p>{copy.noEvaluationNext}</p>
    </main>
  );
  const offlineReport = suiteReport.mode === "offline" ? suiteReport : null;
  const automatedQuality = offlineReport?.automatedQuality as AutomatedQuality | null;
  return (
    <main id="main" lang={locale} className="document-page content-width">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {copy.back}
      </Link>
      <div className="page-intro">
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </div>
      <div className="evaluation-stats">
        {[
          { value: result.benchmark_count, label: copy.benchmark },
          { value: agentReviewCount, label: copy.inspected },
          { value: 0, label: copy.human },
        ].map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <p className="evaluation-intro">{copy.explanation}</p>
      <div className="evaluation-table">
        <table>
          <caption>{copy.tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.check}</th>
              <th scope="col">{copy.result}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(copy.labels).map(([key, label]) => {
              const metric = result.metrics[key as keyof typeof result.metrics];
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>
                    {"passed" in metric
                      ? `${metric.passed} / ${metric.total}`
                      : copy.notScored}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {offlineReport && (
        <section aria-labelledby="offline-suite-title">
          <h2 id="offline-suite-title">{copy.suiteTitle}</h2>
          <p className="evaluation-intro">{copy.suiteExplanation}</p>
          <p>
            {copy.suitePublished}: {" "}
            <time dateTime={offlineReport.completedAt}>
              {dateLabel(offlineReport.completedAt, locale)}
            </time>
          </p>
          <div className="evaluation-table">
            <table>
              <caption>{copy.suiteCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.suiteName}</th>
                  <th scope="col">{copy.suiteCases}</th>
                  <th scope="col">{copy.suitePassed}</th>
                  <th scope="col">{copy.suiteFailed}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(offlineReport.summary.suites).map(([name, suite]) => (
                  <tr key={name} data-testid={`offline-suite-${name}`}>
                    <th scope="row">{copy.suiteLabels[name] ?? name}</th>
                    <td>{suite.cases}</td>
                    <td>{suite.passed}</td>
                    <td>{suite.failed}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr data-testid="offline-suite-total">
                  <th scope="row">{copy.suiteTotal}</th>
                  <td>{offlineReport.summary.cases}</td>
                  <td>{offlineReport.summary.passed}</td>
                  <td>{offlineReport.summary.failed}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p data-testid="offline-suite-outcome">
            {offlineReport.summary.failed > 0
              ? copy.suiteFailures
              : copy.suiteNoFailures}
          </p>
          {automatedQuality && (
            <>
              <h3>{copy.qualityTitle}</h3>
              <p className="evaluation-intro">
                {copy.qualityExplanation}
              </p>
              <div className="evaluation-table">
                <table>
                  <caption>{copy.qualityCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.check}</th>
                      <th scope="col">{copy.suitePassed}</th>
                      <th scope="col">{copy.suiteFailed}</th>
                      <th scope="col">{copy.qualityNotApplicable}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: copy.qualityAccuracy, metric: automatedQuality.factualAccuracy },
                      { label: copy.qualityCitationCorrectness, metric: automatedQuality.citationCorrectness },
                      { label: copy.qualityCitationCompleteness, metric: automatedQuality.citationCompleteness },
                    ].map(({ label, metric }) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{metric.passed}</td>
                        <td>{metric.failed}</td>
                        <td>{metric.notApplicable}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      <div className="about-sections">
        <section>
          <div>
            <h2>{copy.humanTitle}</h2>
            <p>{copy.humanText}</p>
          </div>
        </section>
        <section>
          <div>
            <h2>{copy.unknownTitle}</h2>
            <p>{copy.unknownText}</p>
          </div>
        </section>
      </div>
      <section className="artifact-links">
        <h2>{copy.downloads}</h2>
        {[
          ...(offlineReport
            ? [{ label: copy.suiteDownload, url: "/api/evaluation?artifact=suite" }]
            : []),
          { label: copy.summary, url: "/api/evaluation" },
          { label: copy.responses, url: "/api/evaluation?artifact=responses" },
          { label: copy.agent, url: "/api/evaluation?artifact=agent" },
          { label: copy.humanPackets, url: "/api/evaluation?artifact=human" },
          { label: copy.registry, url: "/api/sources" },
        ].map((item) => (
          <a href={item.url} key={item.url} download>
            <ArrowDownToLine size={16} aria-hidden="true" />
            {item.label}
          </a>
        ))}
      </section>
    </main>
  );
}
