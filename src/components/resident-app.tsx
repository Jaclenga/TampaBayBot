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
import CrisisPlan from "./crisis-plan";
import { buildCrisisPlan } from "@/lib/housing/crisis.mjs";
import type { CrisisResource } from "@/lib/housing/crisis.mjs";
import housingCatalog from "../../pages-demo/src/housing-resources.json";

const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
type ServerErrorCode = "sensitive_input" | "guard_blocked" | "guard_unavailable" |
  "invalid_input" | "request_timeout" | "request_aborted" | "service_unavailable";
type FormErrorCode = "empty" | "max" | "error" | ServerErrorCode;
function serverErrorCode(value: unknown): ServerErrorCode | "error" {
  switch (value) {
    case "sensitive_input":
    case "guard_blocked":
    case "guard_unavailable":
    case "invalid_input":
    case "request_timeout":
    case "request_aborted":
    case "service_unavailable":
      return value;
    default:
      return "error";
  }
}
function CitedText({ answer }: { answer: ResidentAnswer }) {
  const { copy: en } = useLocale();
  return (
    <>
      {answer.answer.split(/(\[E\d+\])/).map((text, index) => {
        const id = text.match(/^\[(E\d+)\]$/)?.[1];
        const source = id ? answer.evidence.find((item) => item.id === id) : null;
        return source ? (
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
        ) : id ? (
          <span key={index} className="unverified-reference">{en.answer.unverifiedReference}</span>
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
  const [referenceTime] = useState(() => Date.now());
  const answer = useMemo(() => {
    if (!rawAnswer) return null;
    const localized = localizeAnswer(rawAnswer, locale);
    if (!rawAnswer.crisisPlan?.input) return localized;
    return { ...localized, crisisPlan: buildCrisisPlan(rawAnswer.crisisPlan.input,
      housingCatalog.resources as unknown as CrisisResource[], { locale, now: referenceTime }) ?? undefined };
  }, [rawAnswer, locale, referenceTime]);
  const [conversation, setConversation] = useState<ConversationContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<FormErrorCode | null>(null);
  const error = errorCode === "empty" ? en.form.empty :
    errorCode === "max" ? en.form.max :
    errorCode === "error" ? en.form.error :
    errorCode ? en.form.serverErrors[errorCode] : "";
  const input = useRef<HTMLTextAreaElement>(null);
  const answerTitle = useRef<HTMLHeadingElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (rawAnswer) answerTitle.current?.focus();
  }, [rawAnswer]);
  async function ask(text = question) {
    if (!text.trim()) {
      setErrorCode("empty");
      input.current?.focus();
      return;
    }
    if (text.length > 1000) {
      setErrorCode("max");
      input.current?.focus();
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setQuestion(text);
    setBusy(true);
    setErrorCode(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Keep the response canonical so an interface-language change can
        // re-render it in either language without translating an earlier translation.
        body: JSON.stringify({ question: text, jurisdictionId, locale: "en", ...(conversation ? { conversation } : {}) }),
        signal: request.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        if (!request.signal.aborted) setErrorCode(serverErrorCode(result?.code));
        return;
      }
      if (!request.signal.aborted) {
        setAnswer(result);
        setConversation(result.conversation ?? null);
        if (!result.needsJurisdiction && result.jurisdictionId) setJurisdictionId(result.jurisdictionId);
      }
    } catch {
      if (!request.signal.aborted) setErrorCode("error");
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
    setErrorCode(null);
    input.current?.focus();
  }
  return (
    <main id="main" lang={locale} tabIndex={-1}>
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
                  setErrorCode(null);
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
                  setErrorCode(null);
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
              {en.form.privacy} {privacyNotice} <a href="/privacy/">{en.footer.privacy}</a>
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
                id="answer-status"
                className={`status-label ${answer.status === "answered" ? "positive" : ""}`}
              >
                {en.status[answer.status] || answer.status.replaceAll("_", " ")}
              </span>
              <button className="text-button" onClick={reset}>
                <Undo2 size={15} aria-hidden="true" />
                {en.answer.clear}
              </button>
            </div>
            <h2 id="answer-title" tabIndex={-1} ref={answerTitle} aria-describedby="answer-status">
              {en.answer.title}
            </h2>
            <p className="answer-lead">
              <CitedText answer={answer} />
            </p>
            {answer.crisisPlan && <CrisisPlan plan={answer.crisisPlan} now={referenceTime} />}
            {answer.conversationUsed && <p className="small muted">{en.answer.continuing}</p>}
            {answer.jurisdictionLabel && (
              <p className="small muted">{en.answer.area}: {jurisdictionLabel(answer.jurisdictionLabel, locale)}</p>
            )}
            {answer.generation?.status === "used" && (
              <p className="muted small">{en.answer.modelUsed}</p>
            )}
            {answer.generation?.status === "fallback" && (
              <p className="muted small">{answer.generation.reason === "invalid_evidence" ? en.answer.citationFallback : en.answer.modelFallback}</p>
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
              <section className="answer-uncertainty" aria-label={en.answer.uncertainty}>
                <h3>{en.answer.uncertainty}</h3>
                <ul className="warning-list">
                  {answer.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </section>
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
                        <span className="evidence-number">{item.id}</span>
                        <span>
                          <strong lang={item.language ?? 'und'}>{item.title}</strong>
                          <small lang={item.language ?? 'und'}>{item.publisher || item.agency}</small>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </summary>
                      <div className="evidence-body">
                        <p className="source-statement-label"><strong>{en.answer.sourceStatement}</strong></p>
                        <blockquote lang={item.language ?? 'und'}>{item.quote}</blockquote>
                        {item.previewStatus === 'permitted' && item.preview && item.preview.length <= 200 && item.quote.includes(item.preview) && item.preview !== item.quote && (
                          <details className="source-preview">
                            <summary>{en.answer.preview}</summary>
                            <p lang={item.language ?? 'und'}>{item.preview}</p>
                          </details>
                        )}
                        <dl>
                          <div>
                            <dt>{en.answer.publisher}</dt>
                            <dd>{item.publisher || item.agency}</dd>
                          </div>
                          <div>
                            <dt>{en.answer.sourceLanguage}</dt>
                            <dd>{item.language === 'en' ? <span lang="en">English</span> : item.language === 'es' ? <span lang="es">Español</span> : en.answer.languageUnknown}</dd>
                          </div>
                          <div>
                            <dt>{en.answer.retrieved}</dt>
                            <dd>{dateLabel(item.retrieved_at, locale)}</dd>
                          </div>
                          {(item.source_date || item.source_updated_date) && <div>
                            <dt>{en.answer.sourceDate}</dt>
                            <dd>{dateLabel(item.source_date || item.source_updated_date, locale)}</dd>
                          </div>}
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
                        <div className="source-url"><strong>{en.answer.sourceUrl}:</strong> <SourceLink url={item.url}>{item.url}</SourceLink></div>
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
