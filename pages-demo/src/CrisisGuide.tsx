import { useState } from "react";
import { buildCrisisPlan } from "../../src/lib/housing/crisis.mjs";
import { resourceSourceStatus } from "./housing-help";
import type { HousingLocation, HousingResource } from "./housing-help";

type Language = "en" | "es";
type Situation = "eviction" | "rent" | "imminent_homelessness" | "homelessness" | "unsafe_housing" | "utilities" | "domestic_violence" | "disaster" | "affordable_housing";
type Timeframe = "tonight" | "days" | "later" | "unknown";
type Safety = "yes" | "no" | "unsure";
type NoticeStage = "none" | "informal_warning" | "written_notice" | "pay_or_vacate" | "court_summons" | "pending_case" | "judgment_or_possession" | "unknown";
type Plan = {
  language: Language; situation: Situation; urgency: "emergency" | "urgent" | "standard";
  title: string; immediatePriority: string; steps: string[]; resources: HousingResource[];
  documents: string[]; deadline: string; humanAssistance: string; notes: string[];
  sources: { title: string; url: string; verifiedAt: string }[];
};

const situations: { id: Situation; en: string; es: string }[] = [
  { id: "eviction", en: "I'm facing eviction or a court case", es: "Enfrento un desalojo o un caso judicial" },
  { id: "rent", en: "I can't afford my rent", es: "No puedo pagar el alquiler" },
  { id: "imminent_homelessness", en: "I may lose my housing soon", es: "Puedo perder mi vivienda pronto" },
  { id: "homelessness", en: "I need somewhere to stay", es: "Necesito un lugar donde quedarme" },
  { id: "unsafe_housing", en: "My housing is unsafe", es: "Mi vivienda no es segura" },
  { id: "utilities", en: "My utilities may be shut off", es: "Pueden cortarme los servicios públicos" },
  { id: "domestic_violence", en: "I need to leave an unsafe relationship", es: "Necesito salir de una relación peligrosa" },
  { id: "disaster", en: "I was displaced by a disaster", es: "Un desastre me desplazó de mi vivienda" },
  { id: "affordable_housing", en: "I need affordable housing", es: "Necesito vivienda asequible" },
];
const timeframes: { id: Timeframe; en: string; es: string }[] = [
  { id: "unknown", en: "I don't know / skip", es: "No sé / omitir" },
  { id: "tonight", en: "Tonight", es: "Esta noche" },
  { id: "days", en: "Within a few days", es: "En pocos días" },
  { id: "later", en: "Later", es: "Más adelante" },
];
const safety: { id: Safety; en: string; es: string }[] = [
  { id: "unsure", en: "I don't know / skip", es: "No sé / omitir" },
  { id: "yes", en: "Yes", es: "Sí" },
  { id: "no", en: "No", es: "No" },
];
const notices: { id: NoticeStage; en: string; es: string }[] = [
  { id: "unknown", en: "I'm not sure / skip", es: "No estoy seguro/a / omitir" },
  { id: "none", en: "No notice or court document", es: "Ningún aviso ni documento judicial" },
  { id: "informal_warning", en: "A verbal or informal warning", es: "Una advertencia verbal o informal" },
  { id: "written_notice", en: "A written landlord notice", es: "Un aviso escrito del propietario" },
  { id: "pay_or_vacate", en: "A notice to pay or vacate", es: "Un aviso para pagar o desalojar" },
  { id: "court_summons", en: "A court summons", es: "Una citación judicial" },
  { id: "pending_case", en: "A pending eviction case", es: "Un caso de desalojo pendiente" },
  { id: "judgment_or_possession", en: "A judgment or possession order", es: "Una sentencia u orden de posesión" },
];
const locations: { id: HousingLocation; en: string; es: string }[] = [
  { id: "all", en: "I don't know / all Tampa Bay areas", es: "No sé / toda el área de Tampa Bay" },
  { id: "hillsborough", en: "Hillsborough County", es: "Condado de Hillsborough" },
  { id: "tampa", en: "City of Tampa", es: "Ciudad de Tampa" },
  { id: "pinellas", en: "Pinellas County", es: "Condado de Pinellas" },
  { id: "st-petersburg", en: "St. Petersburg", es: "St. Petersburg" },
  { id: "clearwater", en: "Clearwater", es: "Clearwater" },
  { id: "pasco", en: "Pasco County", es: "Condado de Pasco" },
];

const labels = {
  en: {
    eyebrow: "Optional, private guide", title: "I Need Housing Help", intro: "Choose the problem that fits best. Every other question is optional. You can browse resources without answering anything.",
    problem: "What housing problem are you facing?", choose: "Choose a housing problem", details: "Optional details for a more useful plan", skipNote: "Skip any answer you do not want to give. Your plan updates on this page.",
    time: "How soon do you need help?", place: "What city or county are you in?", safe: "Are you somewhere safe right now?", notice: "Have you received a notice or court document?", documentNote: "Choose the type only. Do not upload or paste a document or personal details.",
    skip: "Skip questions and browse all resources", priority: "Do this first", steps: "Next steps", resources: "People and offices to contact", documents: "Information to prepare, if available", deadline: "Check deadlines", human: "Human help", notes: "Keep in mind", sources: "Official sources", official: "Open official website", copy: "Copy plan", print: "Print plan", save: "Save text file", copied: "Plan copied. A clipboard copy may remain on this device.", copyFailed: "Copy unavailable. You can print or save a text file.", saveFailed: "Save unavailable. You can copy or print the plan.", privacyTitle: "Your privacy", privacy: "Your answers in this guide stay on this page. The guide does not send them to a server or save them in this browser. Copying, downloading, or printing can leave a copy on a shared device.", limit: "This guide is not legal advice or an emergency response service. Confirm current program details and court deadlines with the official source.", emergency: "Emergency", urgent: "Urgent", standard: "Standard",
  },
  es: {
    eyebrow: "Guía opcional y privada", title: "Necesito ayuda de vivienda", intro: "Elija el problema que mejor describa su situación. Las demás preguntas son opcionales. Puede ver los recursos sin responder.",
    problem: "¿Qué problema de vivienda tiene?", choose: "Elija un problema de vivienda", details: "Detalles opcionales para personalizar los pasos", skipNote: "Puede omitir cualquier respuesta. Su plan se actualiza en esta página.",
    time: "¿Cuándo necesita ayuda?", place: "¿En qué ciudad o condado está?", safe: "¿Está en un lugar seguro ahora?", notice: "¿Recibió un aviso o documento judicial?", documentNote: "Seleccione solo el tipo. No cargue ni copie documentos o datos personales aquí.",
    skip: "Omitir preguntas y ver todos los recursos", priority: "Haga esto primero", steps: "Próximos pasos", resources: "Personas y oficinas a contactar", documents: "Información para preparar, si la tiene", deadline: "Verifique los plazos", human: "Ayuda de una persona", notes: "Tenga en cuenta", sources: "Fuentes oficiales", official: "Abrir sitio oficial", copy: "Copiar plan", print: "Imprimir plan", save: "Guardar archivo de texto", copied: "Plan copiado. Puede quedar una copia en el portapapeles.", copyFailed: "No se pudo copiar. Puede imprimir o guardar un archivo de texto.", saveFailed: "No se pudo guardar. Puede copiar o imprimir el plan.", privacyTitle: "Su privacidad", privacy: "Sus respuestas en esta guía quedan en esta página. La guía no las envía a un servidor ni las guarda en el navegador. Copiar, descargar o imprimir puede dejar una copia en un dispositivo compartido.", limit: "Esta guía no es asesoría legal ni un servicio de emergencias. Confirme los detalles y los plazos judiciales con la fuente oficial.", emergency: "Emergencia", urgent: "Urgente", standard: "Normal",
  },
} as const;
const resourceLabels = {
  en: { coverage: "Coverage", cities: "Only these cities", eligibility: "Who can use this", availability: "Service availability", restrictions: "Restrictions and source caveats", checked: "Public details last source-checked", sourceStatus: "Source status", needsRecheck: "Source check expired; verify directly before relying on this contact.", sourceUnavailable: "Source unavailable; verify directly before relying on this contact.", sourceChecked: "Source checked on the date shown; confirm current availability directly.", website: "Official website", source: "Official source", names: "Official program names and linked pages may be in English. Check the provider's own wording." },
  es: { coverage: "Cobertura", cities: "Solo estas ciudades", eligibility: "Quién puede usarlo", availability: "Disponibilidad del servicio", restrictions: "Restricciones y advertencias de la fuente", checked: "Detalles públicos comprobados en la fuente por última vez", sourceStatus: "Estado de la fuente", needsRecheck: "La comprobación de la fuente venció; confirme directamente antes de usar este contacto.", sourceUnavailable: "La fuente no está disponible; confirme directamente antes de usar este contacto.", sourceChecked: "Fuente comprobada en la fecha indicada; confirme la disponibilidad actual directamente.", website: "Sitio oficial", source: "Fuente oficial", names: "Los nombres de programas y las páginas oficiales pueden estar en inglés. Consulte la información del proveedor." },
} as const;

function sourceStatusText(resource: HousingResource, language: Language, now: number): string {
  const status = resourceSourceStatus(resource, now);
  const labels = resourceLabels[language];
  return status === "source_unavailable" ? labels.sourceUnavailable : status === "needs_recheck" ? labels.needsRecheck : labels.sourceChecked;
}

function coverageText(resource: HousingResource, language: Language): string {
  const areas = resource.geography.map((place) => {
    if (place === "national") return language === "en" ? "United States" : "Estados Unidos";
    if (place === "florida") return "Florida";
    return locations.find((location) => location.id === place)?.[language] ?? place.replaceAll("-", " ");
  });
  const cities = resource.municipalities?.map((place) => locations.find((location) => location.id === place)?.[language] ?? place.replaceAll("-", " "));
  return `${areas.join(", ")}${cities?.length ? `; ${resourceLabels[language].cities}: ${cities.join(", ")}` : ""}`;
}

function safeHttps(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function planText(plan: Plan, language: Language, now: number): string {
  const t = labels[language];
  const r = resourceLabels[language];
  return [plan.title, `${t.priority}: ${plan.immediatePriority}`, `${t.steps}:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
    `${t.deadline}: ${plan.deadline}`, `${t.human}: ${plan.humanAssistance}`,
    ...(plan.documents.length ? [`${t.documents}:\n${plan.documents.map((item) => `- ${item}`).join("\n")}`] : []),
    `${t.resources}:\n${plan.resources.map((resource) => [
      `${resource.organization} — ${resource.program}`,
      resource.description,
      `${r.coverage}: ${coverageText(resource, language)}`,
      `${r.eligibility}: ${resource.eligibility}`,
      `${r.availability}: ${resource.availability}`,
      `${r.sourceStatus}: ${sourceStatusText(resource, language, now)}`,
      ...(resource.restrictions?.length ? [`${r.restrictions}: ${resource.restrictions.join("; ")}`] : []),
      resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join("; "),
      `${r.checked}: ${resource.verifiedAt}`,
      `${r.website}: ${resource.url}`,
      `${r.source}: ${resource.sourceUrl}`,
    ].join("\n")).join("\n\n")}`,
    `${t.sources}:\n${plan.sources.map((source) => `${source.title}: ${source.url} (${r.checked}: ${source.verifiedAt})`).join("\n")}`, ...plan.notes, t.limit, ...(language === "es" ? [r.names] : [])].join("\n\n");
}

function PlanResource({ resource, language, now }: { resource: HousingResource; language: Language; now: number }) {
  const r = resourceLabels[language];
  const website = safeHttps(resource.url);
  const source = safeHttps(resource.sourceUrl);
  return <li>
    <strong>{resource.organization} — {resource.program}</strong>
    <p>{resource.description}</p>
    <p><b>{r.coverage}:</b> {coverageText(resource, language)}</p>
    <p><b>{r.eligibility}:</b> {resource.eligibility}</p>
    <p><b>{r.availability}:</b> {resource.availability}</p>
    <p className={resourceSourceStatus(resource, now) === "source_checked" ? "small muted" : "small alert"}><b>{r.sourceStatus}:</b> {sourceStatusText(resource, language, now)} {r.checked}: {resource.verifiedAt}.</p>
    {resource.restrictions?.length ? <p><b>{r.restrictions}:</b> {resource.restrictions.join("; ")}</p> : null}
    <span>{resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join(" · ")}</span>
    {website && <a href={website} target="_blank" rel="noopener noreferrer">{r.website}</a>}
    {source && <> · <a href={source} target="_blank" rel="noopener noreferrer">{r.source}</a></>}
  </li>;
}

export default function CrisisGuide({ language, resources, location, onLocationChange, now }: { language: Language; resources: HousingResource[]; location: HousingLocation; onLocationChange: (location: HousingLocation) => void; now: number }) {
  const [situation, setSituation] = useState<Situation | "">("");
  const [timeframe, setTimeframe] = useState<Timeframe>("unknown");
  const [safe, setSafe] = useState<Safety>("unsure");
  const [noticeStage, setNoticeStage] = useState<NoticeStage>("unknown");
  const [actionStatus, setActionStatus] = useState("");
  const t = labels[language];
  const plan = situation ? buildCrisisPlan({ situation, location, timeframe, safe, noticeStage }, resources as Parameters<typeof buildCrisisPlan>[1], { now: new Date(now), locale: language }) as Plan | null : null;
  function chooseSituation(value: Situation | "") {
    setSituation(value);
    setTimeframe("unknown");
    setSafe("unsure");
    setNoticeStage("unknown");
    setActionStatus("");
  }
  async function copyPlan() {
    if (!plan) return;
    try { await navigator.clipboard.writeText(planText(plan, language, now)); setActionStatus(t.copied); }
    catch { setActionStatus(t.copyFailed); }
  }
  function savePlan() {
    if (!plan) return;
    try {
      const url = URL.createObjectURL(new Blob([planText(plan, language, now)], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tampabaybot-housing-plan-${language}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setActionStatus(t.saveFailed); }
  }
  function printPlan() {
    document.body.classList.add("print-crisis-plan");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-crisis-plan"), { once: true });
    window.print();
  }
  return <section className="crisis-guide" id="housing-guide" aria-labelledby="crisis-guide-title">
    <div className="crisis-guide-heading"><div><span className="eyebrow">{t.eyebrow}</span><h3 id="crisis-guide-title">{t.title}</h3><p>{t.intro}</p></div><a href="#housing-resources">{t.skip} ↓</a></div>
    <div className="crisis-question"><label htmlFor="crisis-situation">{t.problem}</label><select id="crisis-situation" value={situation} onChange={(event) => chooseSituation(event.target.value as Situation | "")}><option value="">{t.choose}</option>{situations.map((item) => <option key={item.id} value={item.id}>{item[language]}</option>)}</select></div>
    {situation && <fieldset className="crisis-details"><legend>{t.details}</legend><p className="small muted">{t.skipNote}</p><div className="crisis-detail-grid"><div><label htmlFor="crisis-timeframe">{t.time}</label><select id="crisis-timeframe" value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>{timeframes.map((item) => <option key={item.id} value={item.id}>{item[language]}</option>)}</select></div><div><label htmlFor="crisis-location">{t.place}</label><select id="crisis-location" value={location} onChange={(event) => onLocationChange(event.target.value as HousingLocation)}>{locations.map((item) => <option key={item.id} value={item.id}>{item[language]}</option>)}</select></div><div><label htmlFor="crisis-safe">{t.safe}</label><select id="crisis-safe" value={safe} onChange={(event) => setSafe(event.target.value as Safety)}>{safety.map((item) => <option key={item.id} value={item.id}>{item[language]}</option>)}</select></div>{(situation === "eviction" || situation === "rent") && <div><label htmlFor="crisis-notice">{t.notice}</label><select id="crisis-notice" value={noticeStage} onChange={(event) => setNoticeStage(event.target.value as NoticeStage)}>{notices.map((item) => <option key={item.id} value={item.id}>{item[language]}</option>)}</select><p className="small muted">{t.documentNote}</p></div>}</div></fieldset>}
    {plan && <article className="crisis-plan" aria-live="polite">
      <div className="crisis-plan-top"><div><span className={`crisis-urgency crisis-${plan.urgency}`}>{t[plan.urgency]}</span><h4>{plan.title}</h4></div><div className="crisis-plan-actions"><button type="button" onClick={() => void copyPlan()}>{t.copy}</button><button type="button" onClick={printPlan}>{t.print}</button><button type="button" onClick={savePlan}>{t.save}</button></div></div>
      <p className="crisis-priority"><strong>{t.priority}</strong>{plan.immediatePriority}</p>
      <div className="crisis-plan-columns"><div><h5>{t.steps}</h5><ol>{plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></div><div><h5>{t.resources}</h5><ul className="crisis-plan-resources">{plan.resources.map((resource) => <PlanResource key={resource.id} resource={resource} language={language} now={now} />)}</ul></div></div>
      {plan.documents.length > 0 && <div className="crisis-plan-support"><h5>{t.documents}</h5><ul>{plan.documents.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      <div className="crisis-plan-support"><h5>{t.deadline}</h5><p>{plan.deadline}</p><h5>{t.human}</h5><p>{plan.humanAssistance}</p></div>
      {plan.notes.length > 0 && <div className="crisis-plan-support"><h5>{t.notes}</h5><ul>{plan.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      <div className="crisis-plan-support"><h5>{t.sources}</h5><ul>{plan.sources.map((source, index) => {
        const href = safeHttps(source.url);
        return <li key={`${source.url}-${index}`}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title} <span className="small muted">({resourceLabels[language].checked}: {source.verifiedAt})</span></li>;
      })}</ul></div>
      {language === "es" && <p className="small muted">{resourceLabels.es.names}</p>}
      <p className="small muted">{t.limit}</p><p role="status" className="small">{actionStatus}</p>
    </article>}
    <aside className="crisis-privacy"><strong>{t.privacyTitle}</strong><p>{t.privacy}</p></aside>
  </section>;
}
