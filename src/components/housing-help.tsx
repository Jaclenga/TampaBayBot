"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
import { buildCrisisPlan } from "@/lib/housing/crisis.mjs";
import type { CrisisInput, CrisisLocation, CrisisNoticeStage, CrisisResource, CrisisSituation } from "@/lib/housing/crisis.mjs";
import catalog from "../../pages-demo/src/housing-resources.json";
import CrisisPlan, { ResourceCard, resourceCoverage, resourceNeedsRecheck } from "./crisis-plan";

const resources = catalog.resources as unknown as CrisisResource[];
const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const situations: { value: CrisisSituation; en: string; es: string }[] = [
  { value: "eviction", en: "I'm facing eviction", es: "Enfrento un desalojo" },
  { value: "rent", en: "I can't afford my rent", es: "No puedo pagar el alquiler" },
  { value: "imminent_homelessness", en: "I may lose housing soon", es: "Puedo perder mi vivienda pronto" },
  { value: "homelessness", en: "I need somewhere to stay", es: "Necesito un lugar donde quedarme" },
  { value: "unsafe_housing", en: "My housing is unsafe", es: "Mi vivienda no es segura" },
  { value: "utilities", en: "My utilities may be shut off", es: "Me pueden cortar los servicios" },
  { value: "domestic_violence", en: "Violence is affecting my housing", es: "La violencia afecta mi vivienda" },
  { value: "disaster", en: "A storm or flood displaced me", es: "Una tormenta o inundación me desplazó" },
  { value: "affordable_housing", en: "I need affordable housing", es: "Necesito vivienda asequible" },
];
const locations: { value: CrisisLocation; label: string }[] = [
  { value: "all", label: "Tampa Bay area / Área de Tampa Bay" },
  { value: "tampa", label: "Tampa" }, { value: "hillsborough", label: "Hillsborough County" },
  { value: "st-petersburg", label: "St. Petersburg" }, { value: "clearwater", label: "Clearwater" },
  { value: "pinellas", label: "Pinellas County" }, { value: "pasco", label: "Pasco County" },
];
const noticeStages: { value: CrisisNoticeStage; en: string; es: string }[] = [
  { value: "unknown", en: "Not sure / skip", es: "No sé / omitir" },
  { value: "none", en: "No notice", es: "Sin aviso" },
  { value: "informal_warning", en: "Spoken warning", es: "Advertencia verbal" },
  { value: "written_notice", en: "Written notice", es: "Aviso escrito" },
  { value: "pay_or_vacate", en: "Pay or vacate notice", es: "Aviso de pagar o desalojar" },
  { value: "court_summons", en: "Court summons", es: "Citación judicial" },
  { value: "pending_case", en: "Court case underway", es: "Caso judicial en curso" },
  { value: "judgment_or_possession", en: "Judgment or possession order", es: "Fallo u orden de posesión" },
];

function external(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

function matchesLocation(resource: CrisisResource, location: CrisisLocation) {
  if (location === "all" || resource.geography.includes("florida") || resource.geography.includes("national")) return true;
  const county = location === "tampa" ? "hillsborough" : ["st-petersburg", "clearwater"].includes(location) ? "pinellas" : location;
  if (!resource.geography.includes(county)) return false;
  if (!resource.municipalities?.length) return true;
  return resource.municipalities.includes(location);
}

function planText(plan: NonNullable<ReturnType<typeof buildCrisisPlan>>, now: number) {
  const labels = plan.language === "es" ? {
    coverage: "Área", contact: "Contacto", eligibility: "Requisitos", availability: "Disponibilidad",
    availabilityStatus: "Estado de disponibilidad", sourceStatus: "Estado de la fuente",
    restrictions: "Restricciones", hours: "Horario publicado", intake: "Admisión oficial",
    website: "Sitio oficial", source: "Fuente", checked: "Fuente revisada", recheck: "Necesita nueva verificación",
  } : {
    coverage: "Coverage", contact: "Contact", eligibility: "Eligibility", availability: "Availability",
    availabilityStatus: "Availability status", sourceStatus: "Source status",
    restrictions: "Restrictions", hours: "Published hours", intake: "Official intake",
    website: "Official website", source: "Source", checked: "Source checked", recheck: "Needs recheck",
  };
  return [plan.title, plan.immediatePriority, ...plan.steps.map((step, i) => `${i + 1}. ${step}`),
    plan.deadline, plan.humanAssistance, ...plan.documents, ...plan.resources.map((resource) => [
      `${resource.organization} — ${resource.program}`,
      `${labels.coverage}: ${resourceCoverage(resource, plan.language === "es")}`,
      `${labels.contact}: ${resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join(", ")}`,
      `${labels.eligibility}: ${resource.eligibility}`,
      `${labels.availability}: ${resource.availability}`,
      `${labels.availabilityStatus}: ${resource.availabilityStatus ?? "unknown"}`,
      `${labels.sourceStatus}: ${resourceNeedsRecheck(resource, now) ? labels.recheck : resource.verificationStatus ?? "unknown"}`,
      ...(resource.restrictions?.length ? [`${labels.restrictions}: ${Array.isArray(resource.restrictions) ? resource.restrictions.join("; ") : resource.restrictions}`] : []),
      ...(resource.serviceHours ? [`${labels.hours}: ${resource.serviceHours}`] : []),
      ...(resource.intakeUrl ? [`${labels.intake}: ${resource.intakeUrl}`] : []),
      `${labels.website}: ${resource.url}`, `${labels.source}: ${resource.sourceUrl}`, `${labels.checked}: ${resource.verifiedAt}`,
    ].join("\n")),
    ...plan.notes, ...plan.sources.map((source) => `${source.title}: ${source.url} (${labels.checked}: ${source.verifiedAt})`)].join("\n");
}

export default function HousingHelpPage() {
  const { locale } = useLocale();
  const es = locale === "es";
  usePageTitle(`${es ? "Ayuda de vivienda" : "Housing help"} | TampaBayBot`);
  const ready = useSyncExternalStore(subscribeToReady, clientReady, serverReady);
  const [situation, setSituation] = useState<CrisisSituation | "">("");
  const [location, setLocation] = useState<CrisisLocation>("all");
  const [timeframe, setTimeframe] = useState<CrisisInput["timeframe"]>("unknown");
  const [safe, setSafe] = useState<CrisisInput["safe"]>("unsure");
  const [noticeStage, setNoticeStage] = useState<CrisisNoticeStage>("unknown");
  const [feedback, setFeedback] = useState("");
  const [referenceTime] = useState(() => Date.now());
  const input = useMemo(() => situation ? { situation, location, timeframe, safe, noticeStage } : null,
    [situation, location, timeframe, safe, noticeStage]);
  const plan = useMemo(() => buildCrisisPlan(input, resources, { locale, now: referenceTime }), [input, locale, referenceTime]);
  const shown = resources.filter((resource) => matchesLocation(resource, location));
  const immediate = resources.filter((resource) => ["emergency-911", "homeless-hillsborough-211", "homeless-pinellas-211", "housing-pasco-coalition", "emergency-spring", "emergency-casa", "emergency-sunrise"].includes(resource.id) && (resource.id === "emergency-911" || matchesLocation(resource, location)));

  function chooseSituation(value: CrisisSituation | "") {
    setSituation(value);
    setTimeframe("unknown");
    setSafe("unsure");
    setNoticeStage("unknown");
    setFeedback("");
  }

  async function copyPlan() {
    if (!plan) return;
    try { await navigator.clipboard.writeText(planText(plan, referenceTime)); setFeedback(es ? "Plan copiado." : "Plan copied."); }
    catch { setFeedback(es ? "No se pudo copiar. Puede imprimir esta página." : "Copy unavailable. You can print this page."); }
  }
  function savePlan() {
    if (!plan) return;
    const blob = new Blob([planText(plan, referenceTime)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tampabaybot-housing-plan.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <main id="main" className="content-width housing-help-page" lang={locale}>
    <h1>{es ? "Necesito ayuda de vivienda" : "I Need Housing Help"}</h1>
    <p>{es ? "Elija su problema para ver un plan breve. Puede omitir las demás preguntas y consultar los contactos ahora mismo. Funciona sin IA ni cuenta." : "Choose your problem for a short plan. You can skip the other questions and browse contacts now. This works without AI or an account."}</p>
    <aside className="crisis-immediate" aria-labelledby="crisis-immediate-title">
      <h2 id="crisis-immediate-title">{es ? "Ayuda inmediata" : "Immediate help"}</h2>
      <p>{es ? "Si alguien está en peligro físico inmediato, llame al 911. Para refugio o asistencia, contacte al servicio de admisión o al 211. Nadie aquí puede confirmar cupos actuales." : "If someone is in immediate physical danger, call 911. For shelter or assistance, contact intake or 211. This site cannot confirm current openings."}</p>
      <ul>{immediate.map((resource) => <li key={resource.id}><strong>{resource.organization} — {resource.program}</strong> ({resourceCoverage(resource, es)}): {resource.contacts.map((contact) => contact.value).join(" · ")} {external(resource.url) && <a href={resource.url} target="_blank" rel="noopener noreferrer">{es ? "Sitio oficial" : "Official site"}</a>} <small>{es ? "Fuente revisada" : "Source checked"}: {resource.verifiedAt}. {resourceNeedsRecheck(resource, referenceTime) ? (es ? "Necesita nueva verificación; confirme con el proveedor." : "Needs recheck; confirm with the provider.") : (es ? "Confirme la disponibilidad actual." : "Confirm current availability.")}</small></li>)}</ul>
    </aside>
    <div className="crisis-exit"><span>{es ? "Salir rápido abre un sitio del clima; no borra el historial." : "Quick exit opens a weather site; it cannot erase browser history."}</span> <a href="https://www.weather.gov/" onClick={(event) => { event.preventDefault(); window.location.replace("https://www.weather.gov/"); }}>{es ? "Salir rápido" : "Quick exit"}</a></div>
    <section className="crisis-intake" aria-labelledby="crisis-intake-title">
      <h2 id="crisis-intake-title">{es ? "Crear un plan" : "Make a plan"}</h2>
      <p>{es ? "Solo se usan sus selecciones en esta página. No se envían ni guardan detalles personales." : "Your selections stay on this page. No personal details are sent or stored."}</p>
      <div className="crisis-form-grid"><label>{es ? "Problema de vivienda" : "Housing problem"}<select disabled={!ready} value={situation} onChange={(event) => chooseSituation(event.target.value as CrisisSituation | "")}><option value="">{es ? "Elegir o consultar contactos" : "Choose or browse contacts"}</option>{situations.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label>
      <label>{es ? "Ciudad o condado (opcional)" : "City or county (optional)"}<select disabled={!ready} value={location} onChange={(event) => setLocation(event.target.value as CrisisLocation)}>{locations.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
      {situation && <div className="crisis-form-grid"><label>{es ? "¿Cuándo necesita ayuda?" : "How soon do you need help?"}<select disabled={!ready} value={timeframe} onChange={(event) => setTimeframe(event.target.value as CrisisInput["timeframe"])}><option value="unknown">{es ? "No sé / omitir" : "Not sure / skip"}</option><option value="tonight">{es ? "Esta noche" : "Tonight"}</option><option value="days">{es ? "En unos días" : "In a few days"}</option><option value="later">{es ? "Más adelante" : "Later"}</option></select></label>
      <label>{es ? "¿Está en un lugar seguro ahora?" : "Are you somewhere safe now?"}<select disabled={!ready} value={safe} onChange={(event) => setSafe(event.target.value as CrisisInput["safe"])}><option value="unsure">{es ? "No sé / omitir" : "Not sure / skip"}</option><option value="yes">{es ? "Sí" : "Yes"}</option><option value="no">{es ? "No" : "No"}</option></select></label>
      {situation === "eviction" && <label>{es ? "¿Qué documento recibió?" : "What document did you receive?"}<select disabled={!ready} value={noticeStage} onChange={(event) => setNoticeStage(event.target.value as CrisisNoticeStage)}>{noticeStages.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label>}</div>}
      {plan && <><CrisisPlan plan={plan} now={referenceTime} /><div className="crisis-actions"><button type="button" onClick={() => void copyPlan()}>{es ? "Copiar plan" : "Copy plan"}</button><button type="button" onClick={() => window.print()}>{es ? "Imprimir" : "Print"}</button><button type="button" onClick={savePlan}>{es ? "Guardar texto" : "Save text"}</button></div><p role="status">{feedback}</p><p className="small muted">{es ? "Los archivos guardados pueden ser visibles para otras personas que usan este dispositivo." : "Saved files may be visible to others using this device."}</p></>}
    </section>
    <section className="crisis-directory" aria-labelledby="crisis-directory-title"><h2 id="crisis-directory-title">{es ? "Directorio de recursos" : "Resource directory"}</h2><p>{es ? "Consulte cada fuente oficial para confirmar horarios, requisitos y disponibilidad. Las descripciones de las organizaciones se muestran en inglés cuando no hay traducción oficial." : "Check each official source for current hours, eligibility and availability."}</p>
      <ul>{shown.map((resource) => <ResourceCard key={resource.id} resource={resource} es={es} now={referenceTime} />)}</ul>
    </section>
  </main>;
}
