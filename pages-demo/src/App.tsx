import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, classifyHealth, dateLabel, getAiUsage, postJson } from "./api";
import type {
  AddressCandidate, AddressLookup, AiUsage, DevelopmentResult, Evidence,
  LayerResult, PropertyContext, ResidentAnswer,
} from "./api";
import HousingHelp from "./HousingHelp";
import { resourceSourceStatus } from "./housing-help";

const AI_UNAVAILABLE_MESSAGE = "TampaBayBot's AI chat is temporarily unavailable. You can still browse verified housing assistance resources.";
const DIRECTORY_ONLY = import.meta.env.VITE_DIRECTORY_ONLY === "true";
const inferenceFailures = new Set(["provider_quota", "provider_capacity", "timeout", "provider_failure", "invalid_model", "model_unavailable", "invalid_config", "invalid_output", "response_too_large", "ai_configuration", "ai_unavailable"]);

function inferenceUnavailable(generation: ResidentAnswer["generation"]): boolean {
  return Boolean(generation?.reason && inferenceFailures.has(generation.reason));
}

function resetLabel(resetAt: string | null): string | null {
  if (!resetAt) return null;
  const reset = new Date(resetAt);
  if (!Number.isFinite(reset.getTime())) return null;
  return `The application question allowance resets ${reset.toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} UTC.`;
}

const areas = [
  ["tampa-bay", "Tampa Bay region"], ["tampa", "City of Tampa"],
  ["st-petersburg", "St. Petersburg"], ["clearwater", "Clearwater"],
  ["hillsborough-county", "Hillsborough County"],
  ["pinellas-county", "Pinellas County"], ["pasco-county", "Pasco County"],
] as const;

function safeUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function SourceLink({ url, children }: { url: string | null | undefined; children: React.ReactNode }) {
  const href = safeUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span></a> : null;
}

function CitedText({ answer, turnId }: { answer: ResidentAnswer; turnId: number }) {
  return <>{answer.answer.split(/(\[E\d+\])/).map((part, index) => {
    const id = /^\[(E\d+)\]$/.exec(part)?.[1];
    return id && answer.evidence.some((item) => item.id === id)
      ? <a key={index} className="inline-citation" href={`#source-${turnId}-${id}`}>{part}</a>
      : <span key={index}>{part}</span>;
  })}</>;
}

function EvidenceList({ evidence, turnId }: { evidence: Evidence[]; turnId: number }) {
  if (!evidence.length) return null;
  return <div className="sources-list">
    <h4>Sources <span>{evidence.length}</span></h4>
    <p className="muted small">These are captured passages. Check each original source for current details.</p>
    {evidence.map((source) => <article className="source-card" id={`source-${turnId}-${source.id}`} key={source.id}>
      <div className="source-meta"><span className="source-id">{source.id}</span><span>{source.agency}</span></div>
      <h5>{source.title}</h5>
      <blockquote>{source.quote}</blockquote>
      <p className="small muted">{source.section ? `${source.section} · ` : ""}Retrieved {dateLabel(source.retrieved_at)}{source.source_updated_date ? ` · Source updated ${dateLabel(source.source_updated_date)}` : ""}{source.stale ? " · May be outdated" : ""}</p>
      <SourceLink url={source.url}>Open source</SourceLink>
    </article>)}
  </div>;
}

function ChatCrisisResource({ resource }: { resource: NonNullable<ResidentAnswer["crisisPlan"]>["resources"][number] }) {
  const sourceStatus = resourceSourceStatus(resource);
  const coverage = resource.geography.join(", ");
  const restriction = resource.municipalities?.length ? `; only ${resource.municipalities.join(", ")}` : "";
  return <li>
    <strong>{resource.organization} — {resource.program}</strong>
    <p className="small">Coverage: {coverage}{restriction}. {resource.eligibility}</p>
    <p className="small">Service availability: {resource.availability} Confirm current openings or funding directly.</p>
    <p className={sourceStatus === "source_checked" ? "small muted" : "small alert"}>Source status: {sourceStatus === "source_unavailable" ? "Source unavailable; verify directly before relying on this contact" : sourceStatus === "needs_recheck" ? "Source check expired; verify directly before relying on this contact" : "Source checked on the date shown"}. Last checked: {resource.verifiedAt}.</p>
    <span>{resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join(" · ")}</span>
    <SourceLink url={resource.url}>Official website</SourceLink> · <SourceLink url={resource.sourceUrl}>Official source</SourceLink>
  </li>;
}

function AnswerCard({ item, showUnavailableNotice }: { item: { id: number; question: string; answer: ResidentAnswer }; showUnavailableNotice: boolean }) {
  const { answer } = item;
  return <article className="answer-card">
    <div className="question-bubble"><span className="eyebrow">You asked</span><p>{item.question}</p></div>
    <div className="answer-heading"><span className="eyebrow">TampaBayBot</span><span className={`status-pill ${answer.status === "answered" ? "status-good" : ""}`}>{answer.status.replaceAll("_", " ")}</span></div>
    <p className="answer-text"><CitedText answer={answer} turnId={item.id} /></p>
    {answer.crisisPlan && <section className="chat-crisis-plan" aria-label="Housing crisis next steps"><span className="eyebrow">Housing help · {answer.crisisPlan.urgency}</span><h3>{answer.crisisPlan.title}</h3><p><strong>Do this first:</strong> {answer.crisisPlan.immediatePriority}</p><h4>Next steps</h4><ol>{answer.crisisPlan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol><h4>People and offices to contact</h4><ul>{answer.crisisPlan.resources.map((resource) => <ChatCrisisResource key={resource.id} resource={resource} />)}</ul>{answer.crisisPlan.documents.length > 0 && <><h4>Information to prepare, if available</h4><ul>{answer.crisisPlan.documents.map((document, index) => <li key={index}>{document}</li>)}</ul></>}<p><strong>Check deadlines:</strong> {answer.crisisPlan.deadline}</p><p><strong>Human help:</strong> {answer.crisisPlan.humanAssistance}</p><h4>Official sources</h4><ul>{answer.crisisPlan.sources.map((source, index) => <li key={`${source.url}-${index}`}><SourceLink url={source.url}>{source.title}</SourceLink></li>)}</ul><p className="small muted">This plan is public navigation, not legal advice. Program capacity and deadlines require direct confirmation. <a href="#housing-help">Use the private, no-AI guide</a></p></section>}
    {answer.meaning && <div className="meaning-card"><h4>What this means</h4><p>{answer.meaning}</p></div>}
    {answer.generation?.status === "used" && <p className="small muted">{answer.generation.provider === "workers-ai" ? "AI assembled this answer from the cited source quotes." : "AI helped select these source passages."}</p>}
    {answer.generation?.status === "fallback" && <p className="small muted">AI was unavailable; this answer uses the source-based fallback.</p>}
    {showUnavailableNotice && inferenceUnavailable(answer.generation) && <p className="ai-fallback-note">{AI_UNAVAILABLE_MESSAGE} <a href="#housing-help">Find Housing Help Without AI</a></p>}
    {answer.jurisdictionLabel && <p className="small muted">Area: {answer.jurisdictionLabel}</p>}
    {answer.coverage?.statement && answer.evidence.length > 0 && <p className="small muted">{answer.coverage.statement}</p>}
    {answer.warnings?.length > 0 && <ul className="warning-list">{answer.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {answer.requirementsToVerify && answer.requirementsToVerify.length > 0 && <div className="verification-list"><h4>Verify with the agency</h4><ul>{answer.requirementsToVerify.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul></div>}
    <EvidenceList evidence={answer.evidence || []} turnId={item.id} />
    {answer.nextSteps?.length > 0 && <div className="next-steps"><h4>Official next steps</h4><ul>{answer.nextSteps.map((step, index) => <li key={`${step.url}-${index}`}><SourceLink url={step.url}>{step.label}</SourceLink><span className="small muted">{step.agency}</span></li>)}</ul></div>}
  </article>;
}

function Layer({ title, layer }: { title: string; layer?: LayerResult }) {
  if (!layer) return null;
  return <section className="result-tile">
    <div className="tile-top"><h4>{title}</h4><span className="small muted">{layer.status.replaceAll("_", " ")}</span></div>
    {layer.records?.length ? layer.records.map((record) => <div className="layer-record" key={record.id}>
      <strong>{record.label}</strong>{record.description && <p>{record.description}</p>}
      {record.pin && <p className="small muted">Parcel ID: {record.pin}</p>}
      <SourceLink url={record.sourceUrl}>View agency record</SourceLink>
    </div>) : <p className="small muted">{layer.message || "No designation was returned. Verify with the agency."}</p>}
    {!layer.records?.length && <SourceLink url={layer.sourceUrl}>Open data layer</SourceLink>}
  </section>;
}

function PropertyExplorer() {
  const [address, setAddress] = useState("");
  const [lookup, setLookup] = useState<AddressLookup | null>(null);
  const [selected, setSelected] = useState<AddressCandidate | null>(null);
  const [property, setProperty] = useState<PropertyContext | null>(null);
  const [development, setDevelopment] = useState<DevelopmentResult | null>(null);
  const [radius, setRadius] = useState(1000);
  const [lookingUp, setLookingUp] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(false);
  const [loadingDevelopment, setLoadingDevelopment] = useState(false);
  const [error, setError] = useState("");
  const [developmentError, setDevelopmentError] = useState("");
  const lookupRequest = useRef<AbortController | null>(null);
  const propertyRequest = useRef<AbortController | null>(null);
  const developmentRequest = useRef<AbortController | null>(null);
  useEffect(() => () => {
    lookupRequest.current?.abort();
    propertyRequest.current?.abort();
    developmentRequest.current?.abort();
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (address.trim().length < 5 || address.length > 200) { setError("Enter a street number and address (up to 200 characters)."); return; }
    lookupRequest.current?.abort();
    propertyRequest.current?.abort();
    developmentRequest.current?.abort();
    const controller = new AbortController();
    lookupRequest.current = controller;
    setSelected(null); setProperty(null); setDevelopment(null); setLookup(null);
    setLoadingProperty(false); setLoadingDevelopment(false);
    setError(""); setDevelopmentError(""); setLookingUp(true);
    try {
      const result = await postJson<AddressLookup>("/api/location", { address: address.trim() }, controller.signal);
      if (!controller.signal.aborted) setLookup(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Address lookup failed.");
    } finally {
      if (!controller.signal.aborted) setLookingUp(false);
    }
  }

  async function loadDevelopment(point: AddressCandidate, meters: number) {
    developmentRequest.current?.abort();
    const controller = new AbortController();
    developmentRequest.current = controller;
    setDevelopment(null); setDevelopmentError(""); setLoadingDevelopment(true);
    try {
      const result = await postJson<DevelopmentResult>("/api/development", { address: point.address, latitude: point.latitude, longitude: point.longitude, radiusMeters: meters }, controller.signal);
      if (!controller.signal.aborted) setDevelopment(result);
    } catch (cause) {
      if (!controller.signal.aborted) setDevelopmentError(cause instanceof Error ? cause.message : "Development lookup failed.");
    } finally {
      if (!controller.signal.aborted) setLoadingDevelopment(false);
    }
  }

  async function choose(point: AddressCandidate) {
    propertyRequest.current?.abort();
    const controller = new AbortController();
    propertyRequest.current = controller;
    setSelected(point); setProperty(null); setError(""); setLoadingProperty(true);
    void loadDevelopment(point, radius);
    try {
      const result = await postJson<PropertyContext>("/api/property", { address: point.address, latitude: point.latitude, longitude: point.longitude }, controller.signal);
      if (!controller.signal.aborted) setProperty(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Property lookup failed.");
    } finally {
      if (!controller.signal.aborted) setLoadingProperty(false);
    }
  }

  return <section id="property" className="property-section" aria-labelledby="property-title">
    <div className="section-intro"><span className="eyebrow">Public map data</span><h2 id="property-title">Explore a place</h2><p>Look up a matched address to inspect parcel context, mapped zoning, and nearby development activity. Select the address yourself before any property query.</p></div>
    <div className="property-panel">
      <form className="address-form" onSubmit={(event) => void search(event)}>
        <label htmlFor="address">Street address</label>
        <div className="input-row"><input id="address" type="text" autoComplete="street-address" maxLength={200} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="315 E Kennedy Blvd, Tampa" /><button type="submit" disabled={lookingUp}>{lookingUp ? "Finding…" : "Find address"}</button></div>
        <p className="small muted">Address lookups contact public GIS services. A match is a candidate, not a property determination.</p>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
      {lookup && !selected && <div className="match-list"><h3>Choose a matched address</h3><p className="small muted">{lookup.message}</p>{lookup.warnings?.map((warning, index) => <p className="small muted" key={index}>{warning}</p>)}{lookup.candidates?.map((point) => <button type="button" className="match-option" onClick={() => void choose(point)} key={point.id}><span>{point.address}<small>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</small></span><span aria-hidden="true">→</span></button>)}</div>}
      {selected && <div className="place-results"><div className="place-heading"><div><span className="eyebrow">Selected location</span><h3>{selected.address}</h3></div><button type="button" className="quiet-button" onClick={() => { propertyRequest.current?.abort(); developmentRequest.current?.abort(); setLoadingProperty(false); setLoadingDevelopment(false); setSelected(null); setProperty(null); setDevelopment(null); }}>Change address</button></div>
        {loadingProperty && <p role="status" className="loading-note">Checking property layers…</p>}
        {property && <div className="property-content"><p>{property.message}</p><p className="small muted">Jurisdiction: {property.jurisdiction}. {property.parcelAnalysis && `Analysis covers ${property.parcelAnalysis.scope.replaceAll("_", " ")}.`}</p>{property.warnings?.length > 0 && <ul className="warning-list">{property.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}<div className="layer-grid"><Layer title="Parcel" layer={property.parcel} /><Layer title="Zoning" layer={property.zoning} /><Layer title="Future land use" layer={property.futureLandUse} /></div></div>}
        <div className="development-block"><div className="development-title"><div><span className="eyebrow">Around this address</span><h3>Development activity</h3></div><label>Radius <select value={radius} onChange={(event) => { const meters = Number(event.target.value); setRadius(meters); void loadDevelopment(selected, meters); }}>{[250, 500, 1000, 2000].map((meters) => <option value={meters} key={meters}>{meters.toLocaleString()} m</option>)}</select></label></div>
          {loadingDevelopment && <p role="status" className="loading-note">Checking development records…</p>}
          {developmentError && <p role="alert" className="alert">{developmentError}</p>}
          {development && <div><p>{development.message}</p><p className="small muted">{development.sourceSnapshotDate ? `Snapshot ${dateLabel(development.sourceSnapshotDate)}` : "Live public data"}. {development.coverage}</p><SourceLink url={development.sourceUrl}>About this dataset</SourceLink>{development.warnings?.length > 0 && <details className="limits"><summary>Coverage and limitations</summary><ul>{development.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}{development.records?.length > 0 && <div className="development-records"><h4>{development.totalMatchesExact === false ? "At least " : ""}{development.totalMatches} nearby record{development.totalMatches === 1 ? "" : "s"}</h4>{development.records.map((record) => <article key={record.id}><div><strong>{record.address || record.projectName || record.recordId}</strong><span className="small muted">{record.distanceMeters === null ? "Mapped area intersects radius" : `${Math.round(record.distanceMeters)} m away`}</span></div><p className="small">{record.recordType} · {record.status}{record.date ? ` · ${record.dateType}: ${dateLabel(record.date)}` : ""}</p><SourceLink url={record.originalSourceUrl || record.sourceUrl}>View source record</SourceLink></article>)}</div>}</div>}
        </div>
      </div>}
    </div>
  </section>;
}

function DirectoryPreview() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="site-wrap">
      <header className="site-header"><a className="brand" href="#top" aria-label="TampaBayBot home">TampaBayBot</a><nav aria-label="Main navigation"><a href="#housing-help">Housing help</a><a href="#housing-resources">Public resources</a><a href="https://github.com/Jaclenga/TampaBayBot" target="_blank" rel="noopener noreferrer">About the project</a></nav></header>
      <div className="status-banner" role="status"><strong>Housing assistance directory preview.</strong> Question search and property tools are unavailable while the service is being set up. The contact directory remains available.</div>
      <main id="main"><section className="hero" id="top"><div className="hero-copy"><h1>Tampa Bay housing information</h1><p>Find official contacts for eviction, shelter referrals, legal aid, and urgent housing needs.</p><div className="hero-actions"><a className="hero-button" href="#housing-help">I Need Housing Help</a><a className="hero-secondary" href="#housing-resources">Browse public resources</a></div></div></section>
        <HousingHelp />
        <section className="disclaimer"><h2>Check details with the provider</h2><p>TampaBayBot is an independent, unofficial project. It does not provide legal advice or establish eligibility. Confirm hours, eligibility, and availability with the responsible agency.</p><a href="https://github.com/Jaclenga/TampaBayBot" target="_blank" rel="noopener noreferrer">About the project</a></section>
      </main><footer className="site-footer"><span>TampaBayBot · An open source civic information project</span><span>Independent and unofficial</span></footer>
    </div>
  </>;
}

export default function App() {
  return DIRECTORY_ONLY ? <DirectoryPreview /> : <FullApp />;
}

function FullApp() {
  const [area, setArea] = useState("tampa");
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<Record<string, unknown> | null>(null);
  const [turns, setTurns] = useState<{ id: number; question: string; answer: ResidentAnswer }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [health, setHealth] = useState<"checking" | "ready" | "empty" | "degraded" | "unavailable">("checking");
  const currentRequest = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const lastResetRefresh = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        const report = await response.json();
        if (controller.signal.aborted) return;
        setHealth(classifyHealth(report));
      })
      .catch(() => { if (!controller.signal.aborted) setHealth("unavailable"); });
    getAiUsage(controller.signal)
      .then((usage) => { if (!controller.signal.aborted) setAiUsage(usage); })
      .catch(() => { if (!controller.signal.aborted) setAiUsage(null); });
    return () => { controller.abort(); currentRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    const resetAt = aiUsage?.resetAt;
    if (!resetAt || !(aiUsage?.remaining === 0 || aiUsage?.reason === "ai_visitor_limit" || aiUsage?.reason === "ai_global_limit")) return;
    const resetKey = resetAt;
    const resetTime = Date.parse(resetKey);
    if (!Number.isFinite(resetTime) || lastResetRefresh.current === resetKey) return;
    let refreshRequest: AbortController | null = null;
    function refreshAfterReset() {
      if (Date.now() < resetTime || lastResetRefresh.current === resetKey) return;
      lastResetRefresh.current = resetKey;
      refreshRequest = new AbortController();
      getAiUsage(refreshRequest.signal)
        .then((usage) => {
          if (refreshRequest?.signal.aborted) return;
          setAiUsage(usage);
          if (usage?.remaining !== 0 && usage?.reason !== "ai_visitor_limit" && usage?.reason !== "ai_global_limit") setError("");
        })
        .catch(() => { if (!refreshRequest?.signal.aborted) setAiUsage(null); });
    }
    const timer = window.setTimeout(refreshAfterReset, Math.max(0, resetTime - Date.now() + 1_000));
    const refreshOnReturn = () => { if (!document.hidden) refreshAfterReset(); };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", refreshOnReturn); refreshRequest?.abort(); };
  }, [aiUsage?.resetAt, aiUsage?.reason, aiUsage?.remaining]);

  async function ask(value = question, targetArea = area) {
    const text = value.trim();
    if (!text || text.length > 1000) { setError("Enter a question with no more than 1,000 characters."); return; }
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    const priorConversation = targetArea === area ? conversation : null;
    if (targetArea !== area) {
      setArea(targetArea);
      setConversation(null);
      setTurns([]);
    }
    setQuestion(text); setError(""); setBusy(true);
    try {
      const answer = await postJson<ResidentAnswer>("/api/ask", { question: text, jurisdictionId: targetArea, ...(priorConversation ? { conversation: priorConversation } : {}) }, controller.signal);
      if (!controller.signal.aborted) {
        setTurns((previous) => [...previous, { id: nextId.current++, question: text, answer }].slice(-6));
        setConversation(answer.conversation ?? null);
        setAiUsage(answer.aiUsage ?? null);
        setQuestion("");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setAiUsage(cause instanceof ApiError ? cause.aiUsage : null);
        if (cause instanceof ApiError && cause.code === "ai_visitor_limit") setError("You've reached today's AI chat limit. Housing assistance resources are still available.");
        else if (cause instanceof ApiError && cause.code === "ai_global_limit") setError("Today's AI chat budget has been reached. Housing assistance resources are still available.");
        else if (cause instanceof ApiError && cause.code === "ai_concurrency_limit") setError("AI chat is busy. Please try again in a moment. Housing assistance resources are still available.");
        else if (cause instanceof ApiError && cause.status === 400) setError("Check your question and try again. Do not include sensitive personal details.");
        else setError(AI_UNAVAILABLE_MESSAGE);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function clearConversation() {
    currentRequest.current?.abort();
    setBusy(false); setQuestion(""); setConversation(null); setTurns([]); setError("");
  }

  const quotaReached = aiUsage?.remaining === 0 || aiUsage?.reason === "ai_visitor_limit" || aiUsage?.reason === "ai_global_limit";
  const aiStatusUnavailable = aiUsage?.available === false
    && aiUsage.reason !== "ai_configuration"
    && aiUsage.reason !== "ai_visitor_limit" && aiUsage.reason !== "ai_global_limit";
  const knownReset = aiUsage?.reason === null || aiUsage?.reason === "ai_visitor_limit" ? resetLabel(aiUsage?.resetAt ?? null) : null;

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="site-wrap">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="TampaBayBot home">TampaBayBot</a>
        <nav aria-label="Main navigation">
          <a href="#ask">Ask a question</a>
          <a href="#housing-help">Housing help</a>
          <a href="#property">Property details</a>
          <a href="https://github.com/Jaclenga/TampaBayBot" target="_blank" rel="noopener noreferrer">About the project</a>
        </nav>
      </header>
      {health === "empty" && <div className="status-banner" role="status"><strong>Source library unavailable.</strong> This installation has no reviewed source passages, so cited answers are unavailable. Housing contacts remain available. Address and public map lookups may still work.</div>}
      {health === "unavailable" && <div className="status-banner" role="status"><strong>Service unavailable.</strong> {AI_UNAVAILABLE_MESSAGE} Property lookups are also unavailable. <a href="#housing-help">Find Housing Help Without AI</a></div>}
      {health === "degraded" && <div className="status-banner" role="status"><strong>Some searches may be unavailable.</strong> Check answers against their original agency sources.</div>}
      {aiUsage?.reason === "ai_global_limit" && <div className="status-banner" role="status"><strong>Today&apos;s application AI budget is reached.</strong> Housing assistance resources are still available. <a href="#housing-help">Find Housing Help Without AI</a></div>}
      <main id="main">
        <section className="hero" id="top" aria-labelledby="home-title">
          <div className="hero-copy">
            <h1 id="home-title">Tampa Bay housing information</h1>
            <p>Find housing help, property details, permits, and public records.</p>
            <p className="quick-help"><a className="hero-button" href="#housing-help">I Need Housing Help</a></p>
          </div>
        </section>
        <section className="ask-section" id="ask" aria-label="Ask a question">
          <div className="ask-layout">
            <div className="chat-panel">
              <div className="chat-panel-header">
                <strong className="sr-only">Ask TampaBayBot</strong>
                {turns.length > 0 && <button type="button" className="quiet-button" onClick={clearConversation}>New question</button>}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void ask(); }}>
                <label htmlFor="area">Your area</label>
                <select id="area" value={area} onChange={(event) => { clearConversation(); setArea(event.target.value); }}>{areas.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                <p className="small muted area-hint">Choose a city or county for local details. Use Tampa Bay region if you are unsure.</p>
                <label htmlFor="question">Question or address</label>
                <div className="question-input">
                  <textarea id="question" maxLength={1000} rows={2} value={question} onChange={(event) => { setQuestion(event.target.value); setError(""); }} placeholder="Where can I find rental assistance in Tampa?" aria-describedby="question-hint" />
                  <button type="submit" disabled={busy || quotaReached}>{busy ? "Searching…" : "Search"}</button>
                </div>
                <p className="privacy-hint" id="question-hint">Leave out names, account numbers, and private details. Up to 1,000 characters.</p>
              </form>
              {aiUsage?.reason !== "ai_configuration" && <p className="ai-usage" role="status">{aiUsage?.remaining !== null && aiUsage?.remaining !== undefined ? `AI questions remaining today: ${aiUsage.remaining} of ${aiUsage.limit}` : "AI question allowance status unavailable."}{aiUsage?.remaining !== null && aiUsage?.remaining !== undefined && knownReset && <span> {knownReset}</span>}</p>}
              {aiStatusUnavailable && <p className="ai-fallback-note">{AI_UNAVAILABLE_MESSAGE} <a href="#housing-help">Find Housing Help Without AI</a></p>}
              {aiUsage?.reason === "ai_visitor_limit" && <p className="ai-limit-note">You&apos;ve reached today&apos;s AI chat limit. Housing assistance resources are still available. <a href="#housing-help">Find Housing Help Without AI</a></p>}
              {busy && <p className="loading-note" role="status">Looking through available sources…</p>}
              {error && aiUsage?.reason !== "ai_visitor_limit" && aiUsage?.reason !== "ai_global_limit" && !(health === "unavailable" && error === AI_UNAVAILABLE_MESSAGE) && <p className="alert" role="alert">{error} <a href="#housing-help">Find Housing Help Without AI</a></p>}
            </div>
          </div>
          <div className="answers" aria-live="polite">{turns.map((item) => <AnswerCard key={item.id} item={item} showUnavailableNotice={!aiStatusUnavailable && health !== "unavailable"} />)}</div>
        </section>
        <HousingHelp />
        <PropertyExplorer />
        <section className="disclaimer"><h2>Check official sources</h2><p>TampaBayBot is independent and unofficial. It does not provide legal advice, establish eligibility, verify permits, or make property decisions. Public records can be incomplete or outdated; confirm details with the responsible agency.</p><a href="https://github.com/Jaclenga/TampaBayBot" target="_blank" rel="noopener noreferrer">About the project</a></section>
      </main>
      <footer className="site-footer"><span>TampaBayBot · An open source civic information project</span><span>Independent and unofficial</span></footer>
    </div>
  </>;
}
