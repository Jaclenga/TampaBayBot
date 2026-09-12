import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowDownToLine } from "lucide-react";
import result from "@/evaluation/results/latest.json";
import suiteReport from "@/evaluation/suite/results/latest.json";
import agentReview from "@/evaluation/agent-audit/responses.json";
import { evaluationEn as copy } from "@/lib/i18n/evaluation-en";
import { dateLabel } from "@/lib/i18n/format";
export const metadata: Metadata = { title: "Evaluation results | ParcelPrivateer" };
export default function Evaluation() {
  if (result.benchmark_count === 0) return (
    <main id="main" className="document-page content-width">
      <Link href="/" className="back-link">{copy.back}</Link>
      <h1>{copy.title}</h1>
      <p>No evaluation has been run for this installation. Results from another installation do not establish the quality of this one.</p>
      <p>Source information must be loaded and reviewed before evaluating answers. Independent human and accessibility reviews remain necessary.</p>
    </main>
  );
  const offlineReport = suiteReport.mode === "offline" ? suiteReport : null;
  return (
    <main id="main" className="document-page content-width">
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
          { value: agentReview.length, label: copy.inspected },
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
                      : "Not scored"}
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
              {dateLabel(offlineReport.completedAt)}
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
          {offlineReport.automatedQuality && (
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
                      { label: copy.qualityAccuracy, metric: offlineReport.automatedQuality.factualAccuracy },
                      { label: copy.qualityCitationCorrectness, metric: offlineReport.automatedQuality.citationCorrectness },
                      { label: copy.qualityCitationCompleteness, metric: offlineReport.automatedQuality.citationCompleteness },
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
