"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Search, Undo2 } from "lucide-react";
import type { ResidentAnswer } from "@/lib/core/answer.mjs";
import { en as english } from "@/lib/i18n/en";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
import { localizeAnswer } from "@/lib/i18n/answer.mjs";
import type { ConversationContext } from "@/lib/core/conversation.mjs";
import { SourceLink } from "./site-shell";
import PropertyLookup from "./property-lookup";
import { dateLabel } from "@/lib/i18n/format";
import { JURISDICTIONS } from "@/lib/coverage.mjs";
import type { JurisdictionId } from "@/lib/coverage.mjs";
import { publicText, jurisdictionLabel, quotedSegments } from "@/lib/i18n/public-text.mjs";

const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
function CitedText({ answer }: { answer: ResidentAnswer }) {
  const { copy: en } = useLocale();
  return (
    <>
      {answer.answer.split(/(\[E\d+\])/).map((text, index) => {
        const id = text.match(/^\[(E\d+)\]$/)?.[1];
        return id && answer.evidence.some((item) => item.id === id) ? (
          <a
            key={index}
            className="citation-link"
            href={`#evidence-${id}`}
            aria-label={`${en.labels.citation} ${id}`}
            onClick={(event) => {
              const detail = document.getElementById(`evidence-${id}`);
              if (detail instanceof HTMLDetailsElement) {
                event.preventDefault();
                detail.open = true;
                detail.querySelector("summary")?.focus();
              }
            }}
          >
            {text}
          </a>
        ) : (
          quotedSegments(text, answer.evidence).map((segment, part) => segment.language
            ? <span key={`${index}-${part}`} lang={segment.language}>{segment.text}</span>
            : segment.text)
        );
      })}
    </>
  );
}

export default function ResidentApp({ modelNotice }: { modelNotice: string }) {
  const { locale, copy: en } = useLocale();
  usePageTitle(`${en.hero.title} | ${en.brand}`);
  const privacyNotice = modelNotice === english.modelPrivacy.disabled ? en.modelPrivacy.disabled
    : modelNotice === english.modelPrivacy.enabled ? en.modelPrivacy.enabled : modelNotice;
  const ready = useSyncExternalStore(
    subscribeToReady,
    clientReady,
    serverReady,
  );
  const [question, setQuestion] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState<JurisdictionId>("tampa-bay");
  const [rawAnswer, setAnswer] = useState<ResidentAnswer | null>(null);
  const answer = useMemo(() => rawAnswer ? localizeAnswer(rawAnswer, locale) : null, [rawAnswer, locale]);
  const [conversation, setConversation] = useState<ConversationContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const answerTitle = useRef<HTMLHeadingElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (rawAnswer) answerTitle.current?.focus();
  }, [rawAnswer]);
  async function ask(text = question) {
    if (!text.trim()) {
      setError(en.form.empty);
      input.current?.focus();
      return;
    }
    if (text.length > 1000) {
      setError(en.form.max);
      input.current?.focus();
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setQuestion(text);
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, jurisdictionId, ...(conversation ? { conversation } : {}) }),
        signal: request.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || en.form.error);
      if (!request.signal.aborted) {
        setAnswer(result);
        setConversation(result.conversation ?? null);
        if (!result.needsJurisdiction && result.jurisdictionId) setJurisdictionId(result.jurisdictionId);
      }
    } catch (err) {
      if (!request.signal.aborted)
        setError(err instanceof Error ? err.message : en.form.error);
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  function reset() {
    controller.current?.abort();
    setBusy(false);
    setAnswer(null);
    setConversation(null);
    setQuestion("");
    setError("");
    input.current?.focus();
  }
  return (
    <main id="main" lang={locale}>
      <section
        className={`hero ${answer ? "hero-compact" : ""}`}
        aria-labelledby="hero-title"
      >
        <div className="hero-inner">
          <h1 id="hero-title">{en.hero.title}</h1>
          <p className="hero-description">{en.hero.description}</p>
          {locale === 'es' && <p className="small muted">{en.language.scope}</p>}
          <form
            className="question-form"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
            aria-busy={busy}
          >
            <div className="area-picker">
              <label htmlFor="jurisdiction">{en.form.area}</label>
              <select
                id="jurisdiction"
                value={jurisdictionId}
                disabled={!ready}
                aria-describedby="jurisdiction-hint"
                onChange={(event) => {
                  controller.current?.abort();
                  setBusy(false);
                  if (!answer?.needsJurisdiction) setConversation(null);
                  setAnswer(null);
                  setError("");
                  setJurisdictionId(event.target.value as JurisdictionId);
                }}
              >
                {JURISDICTIONS.map((area) => (
                  <option key={area.id} value={area.id}>{area.id === "tampa-bay" ? en.form.region : jurisdictionLabel(area.label, locale)}</option>
                ))}
              </select>
              <p className="small muted" id="jurisdiction-hint">{en.form.areaHint}</p>
            </div>
            <label htmlFor="question">{en.form.label}</label>
            <div className={`question-input ${error ? "invalid" : ""}`}>
              <textarea
                id="question"
                disabled={!ready}
                ref={input}
                rows={2}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setError("");
                }}
                maxLength={1000}
                placeholder={en.form.placeholder}
                aria-invalid={!!error}
                aria-describedby={
                  error ? "question-error question-privacy" : "question-privacy"
                }
              />
              <button
                className="primary-button"
                type="submit"
                disabled={!ready || busy}
              >
                {busy ? en.form.busy : en.form.submit}
                <Search size={18} aria-hidden="true" />
              </button>
            </div>
            {error && (
              <p className="error-text" id="question-error" role="alert">
                {error}
              </p>
            )}
            <p className="privacy-hint" id="question-privacy">
              {en.form.privacy} {privacyNotice}
            </p>
            {conversation && <p className="small muted">{en.answer.followup}</p>}
          </form>
          <p className="sr-only" role="status">
            {busy ? en.form.busy : ""}
          </p>
        </div>
      </section>
      {answer && (
        <section
          className={`answer-layout content-width ${answer.nextSteps.length ? "" : "answer-only"}`}
          aria-labelledby="answer-title"
        >
          <div className="answer-main">
            <div className="section-topline">
              <span
                className={`status-label ${answer.status === "answered" ? "positive" : ""}`}
              >
                {en.status[answer.status] || answer.status.replaceAll("_", " ")}
              </span>
              <button className="text-button" onClick={reset}>
                <Undo2 size={15} aria-hidden="true" />
                {en.answer.clear}
              </button>
            </div>
            <h2 id="answer-title" tabIndex={-1} ref={answerTitle}>
              {en.answer.title}
            </h2>
            <p className="answer-lead">
              <CitedText answer={answer} />
            </p>
            {answer.conversationUsed && <p className="small muted">{en.answer.continuing}</p>}
            {answer.jurisdictionLabel && (
              <p className="small muted">{en.answer.area}: {jurisdictionLabel(answer.jurisdictionLabel, locale)}</p>
            )}
            {answer.generation?.status === "used" && (
              <p className="muted small">{en.answer.modelUsed}</p>
            )}
            {answer.generation?.status === "fallback" && (
              <p className="muted small">{en.answer.modelFallback}</p>
            )}
            {answer.meaning && (
              <section className="meaning">
                <h3>{en.answer.meaning}</h3>
                <p>{answer.meaning}</p>
              </section>
            )}
            {answer.evidence.length > 0 && answer.coverage && (
              <p className="small muted">{answer.coverage.statement}</p>
            )}
            {answer.warnings.length > 0 && (
              <ul className="warning-list">
                {answer.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {!!answer.requirementsToVerify?.length && (
              <details className="verification">
                <summary>{en.answer.verify}</summary>
                <ul>
                  {answer.requirementsToVerify.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </details>
            )}
            {answer.evidence.length > 0 && (
              <section className="evidence-section">
                <h3>
                  {en.answer.evidence}
                  <span>{answer.evidence.length}</span>
                </h3>
                <p className="muted small">{en.answer.snapshot}</p>
                <p className="muted small">{en.answer.originalQuotes}</p>
                <div className="evidence-list">
                  {answer.evidence.map((item, index) => (
                    <details
                      className="evidence-card"
                      id={`evidence-${item.id}`}
                      key={item.id}
                      open={index === 0}
                    >
                      <summary>
                        <span className="evidence-number">{index + 1}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.agency}</small>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </summary>
                      <div className="evidence-body">
                        <blockquote lang={item.language ?? 'und'}>{item.quote}</blockquote>
                        <dl>
                          <div>
                            <dt>{en.answer.sourceLanguage}</dt>
                            <dd>{item.language === 'en' ? 'English' : item.language === 'es' ? 'Español' : en.answer.languageUnknown}</dd>
                          </div>
                          <div>
                            <dt>{en.answer.retrieved}</dt>
                            <dd>{dateLabel(item.retrieved_at, locale)}</dd>
                          </div>
                          <div>
                            <dt>{en.answer.updated}</dt>
                            <dd>{dateLabel(item.source_updated_date, locale)}</dd>
                          </div>
                          {item.section && (
                            <div>
                              <dt>{en.labels.section}</dt>
                              <dd lang={item.language ?? 'und'}>{item.section}</dd>
                            </div>
                          )}
                          {item.page && (
                            <div>
                              <dt>{en.labels.page}</dt>
                              <dd>{item.page}</dd>
                            </div>
                          )}
                          {item.record_id && (
                            <div>
                              <dt>{en.labels.record}</dt>
                              <dd>{item.record_id}</dd>
                            </div>
                          )}
                          {item.layer && (
                            <div>
                              <dt>{en.labels.layer}</dt>
                              <dd>{item.layer}</dd>
                            </div>
                          )}
                        </dl>
                        {item.stale && (
                          <p className="stale-note">
                            {en.status.potentially_outdated}
                          </p>
                        )}
                        <SourceLink url={item.url}>
                          {en.answer.source}
                        </SourceLink>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}
            {answer.needsAddress && (
              <PropertyLookup
                initialAddress={
                  /^\s*\d+\s+\S/.test(answer.query) ? answer.query : ""
                }
              />
            )}
          </div>
          {answer.nextSteps.length > 0 && (
            <aside className="next-steps" aria-labelledby="next-title">
              <h2 id="next-title">{en.answer.next}</h2>
              <ol>
                {answer.nextSteps.map((step) => (
                  <li key={step.url}>
                    <SourceLink url={step.url}>{publicText(step.label, locale)}</SourceLink>
                    <small lang="en">{step.agency}</small>
                  </li>
                ))}
              </ol>
              <Link href="/sources" className="text-link">
                {en.nav.sources}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </aside>
          )}
        </section>
      )}
    </main>
  );
}
