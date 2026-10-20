"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
import { buildCrisisPlan } from "@/lib/housing/crisis.mjs";
import type { CrisisInput, CrisisLocation, CrisisNoticeStage, CrisisResource, CrisisSituation } from "@/lib/housing/crisis.mjs";
import catalog from "../../pages-demo/src/housing-resources.json";
import CrisisPlan, { ResourceCard, ResourceReviewWarnings, resourceCoverage, resourceLinkCaution, resourceNeedsRecheck } from "./crisis-plan";

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
const locations: { value: CrisisLocation; en: string; es: string }[] = [
  { value: "all", en: "Tampa Bay area", es: "Área de Tampa Bay" },
  { value: "tampa", en: "Tampa", es: "Tampa" }, { value: "hillsborough", en: "Hillsborough County", es: "Condado de Hillsborough" },
  { value: "st-petersburg", en: "St. Petersburg", es: "St. Petersburg" }, { value: "clearwater", en: "Clearwater", es: "Clearwater" },
  { value: "pinellas", en: "Pinellas County", es: "Condado de Pinellas" }, { value: "pasco", en: "Pasco County", es: "Condado de Pasco" },
];
const timeframes: { value: NonNullable<CrisisInput["timeframe"]>; en: string; es: string }[] = [
  { value: "unknown", en: "Not sure / skip", es: "No sé / omitir" },
  { value: "tonight", en: "Tonight", es: "Esta noche" },
  { value: "days", en: "In a few days", es: "En unos días" },
  { value: "later", en: "Later", es: "Más adelante" },
];
const safetyChoices: { value: NonNullable<CrisisInput["safe"]>; en: string; es: string }[] = [
  { value: "unsure", en: "Not sure / skip", es: "No sé / omitir" },
  { value: "yes", en: "Yes", es: "Sí" },
  { value: "no", en: "No", es: "No" },
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

function planText(plan: NonNullable<ReturnType<typeof buildCrisisPlan>>, now: number, sourceEnglishNotice: string) {
  const labels = plan.language === "es" ? {
    coverage: "Área", contact: "Contacto", eligibility: "Requisitos", availability: "Disponibilidad",
    availabilityStatus: "Estado de disponibilidad", sourceStatus: "Estado de la fuente",
    restrictions: "Restricciones", hours: "Horario publicado", intake: "Admisión oficial",
    website: "Sitio oficial", source: "Fuente", checked: "Información del recurso revisada por última vez",
    availabilityUnknown: "No verificada; confirme la disponibilidad actual con el proveedor",
    availabilityOpen: "Abierto según la última comprobación; confirme la disponibilidad actual",
    availabilityClosed: "Cierre temporal indicado; confirme con el proveedor",
    availabilityDiscontinued: "Programa descontinuado según la última revisión; confirme con el proveedor",
    sourceChecked: "Información pública revisada en la fecha indicada; confirme los detalles actuales con la organización",
    sourceRecheck: "Necesita nueva revisión; contacte al proveedor",
    sourceUnavailable: "La fuente no estaba disponible en la última revisión; verifique por teléfono",
  } : {
    coverage: "Coverage", contact: "Contact", eligibility: "Eligibility", availability: "Availability",
    availabilityStatus: "Availability status", sourceStatus: "Source status",
    restrictions: "Restrictions", hours: "Published hours", intake: "Official intake",
    website: "Official website", source: "Source", checked: "Resource information last reviewed",
    availabilityUnknown: "Not verified; confirm current availability with the provider",
    availabilityOpen: "Open at last check; confirm current availability",
    availabilityClosed: "Listed as temporarily closed; confirm with the provider",
    availabilityDiscontinued: "Listed as discontinued at the last review; confirm with the provider",
    sourceChecked: "Public details reviewed on the date shown; confirm current details with the organization",
    sourceRecheck: "Review due; contact the provider",
    sourceUnavailable: "Source unavailable at last review; verify by phone",
  };
  const availabilityStatus = {
    unknown: labels.availabilityUnknown,
    confirmed_open: labels.availabilityOpen,
    temporarily_closed: labels.availabilityClosed,
    discontinued: labels.availabilityDiscontinued,
  };
  return [plan.title, plan.immediatePriority, ...plan.steps.map((step, i) => `${i + 1}. ${step}`),
    plan.deadline, plan.humanAssistance, ...plan.documents,
    ...(plan.language === "es" && (plan.resources.length > 0 || plan.sources.length > 0) ? [sourceEnglishNotice] : []),
    ...plan.resources.map((resource) => [
      `${resource.organization} — ${resource.program}`,
      `${labels.coverage}: ${resourceCoverage(resource, plan.language === "es")}`,
      `${labels.contact}: ${resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join(", ")}`,
      `${labels.eligibility}: ${resource.eligibility}`,
      `${labels.availability}: ${resource.availability}`,
      `${labels.availabilityStatus}: ${availabilityStatus[resource.availabilityStatus ?? "unknown"]}`,
      `${labels.sourceStatus}: ${resource.verificationStatus === "source_unavailable" ? labels.sourceUnavailable : resourceNeedsRecheck(resource, now) ? labels.sourceRecheck : labels.sourceChecked}`,
      ...(resource.knownIssues?.length ? [`${plan.language === "es" ? "Advertencias conocidas de la fuente (en inglés)" : "Known source issues"}: ${resource.knownIssues.join("; ")}`] : []),
      ...(resourceLinkCaution(resource, plan.language === "es") ? [`${plan.language === "es" ? "Comprobación automática del enlace" : "Automated link check"}: ${resourceLinkCaution(resource, plan.language === "es")}`] : []),
      ...(resource.restrictions?.length ? [`${labels.restrictions}: ${Array.isArray(resource.restrictions) ? resource.restrictions.join("; ") : resource.restrictions}`] : []),
      ...(resource.serviceHours ? [`${labels.hours}: ${resource.serviceHours}`] : []),
      ...(resource.intakeUrl && !["temporarily_closed", "discontinued"].includes(resource.availabilityStatus ?? "") ? [`${labels.intake}: ${resource.intakeUrl}`] : []),
      `${labels.website}: ${resource.url}`, `${labels.source}: ${resource.sourceUrl}`, `${labels.checked}: ${resource.verifiedAt}`,
    ].join("\n")),
    ...plan.notes, ...plan.sources.map((source) => `${source.title}: ${source.url} (${labels.checked}: ${source.verifiedAt})`)].join("\n");
}

export default function HousingHelpPage() {
  const { locale, copy } = useLocale();
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
  const selectedChoices = situation ? [
    situations.find((option) => option.value === situation)?.[locale],
    locations.find((option) => option.value === location)?.[locale],
    timeframes.find((option) => option.value === timeframe)?.[locale],
    safetyChoices.find((option) => option.value === safe)?.[locale],
    ...(situation === "eviction" ? [noticeStages.find((option) => option.value === noticeStage)?.[locale]] : []),
  ].filter(Boolean).join(" · ") : "";
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
    try { await navigator.clipboard.writeText(planText(plan, referenceTime, copy.housing.sourceEnglishNotice)); setFeedback(es ? "Plan copiado." : "Plan copied."); }
    catch { setFeedback(es ? "No se pudo copiar. Puede imprimir esta página." : "Copy unavailable. You can print this page."); }
  }
  function savePlan() {
    if (!plan) return;
    const blob = new Blob([planText(plan, referenceTime, copy.housing.sourceEnglishNotice)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tampabaybot-housing-plan.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setFeedback(es ? "Plan guardado como archivo de texto." : "Plan saved as a text file.");
  }
  return <main id="main" className="content-width housing-help-page" lang={locale} tabIndex={-1}>
    <h1>{es ? "Necesito ayuda de vivienda" : "I Need Housing Help"}</h1>
    <p>{es ? "Elija su problema para ver un plan breve. Puede omitir las demás preguntas y consultar los contactos ahora mismo. Funciona sin IA ni cuenta." : "Choose your problem for a short plan. You can skip the other questions and browse contacts now. This works without AI or an account."}</p>
    <aside className="crisis-immediate" aria-labelledby="crisis-immediate-title">
      <h2 id="crisis-immediate-title">{es ? "Ayuda inmediata" : "Immediate help"}</h2>
      <p>{es ? "Si alguien está en peligro físico inmediato, llame al 911. Para refugio o asistencia, contacte al servicio de admisión o al 211. Nadie aquí puede confirmar cupos actuales." : "If someone is in immediate physical danger, call 911. For shelter or assistance, contact intake or 211. This site cannot confirm current openings."}</p>
      {es && <p className="small muted">{copy.housing.sourceEnglishNotice}</p>}
      <ul>{immediate.map((resource) => <li key={resource.id}><strong lang="en">{resource.organization} — {resource.program}</strong> ({resourceCoverage(resource, es)}): {resource.contacts.map((contact) => contact.value).join(" · ")} {external(resource.url) && <a href={resource.url} target="_blank" rel="noopener noreferrer">{es ? "Sitio oficial" : "Official site"}<span className="sr-only"> ({copy.common.opens})</span></a>} <small className={resourceNeedsRecheck(resource, referenceTime) ? "resource-caution" : ""}>{es ? "Información del recurso revisada por última vez" : "Resource information last reviewed"}: {resource.verifiedAt}. {resourceNeedsRecheck(resource, referenceTime) ? (es ? "Necesita nueva revisión; confirme con el proveedor." : "Review due; confirm with the provider.") : (es ? "Confirme la disponibilidad actual." : "Confirm current availability.")}</small><ResourceReviewWarnings resource={resource} es={es} /></li>)}</ul>
    </aside>
    <div className="crisis-exit"><span>{es ? "Salir rápido abre un sitio del clima; no borra el historial." : "Quick exit opens a weather site; it cannot erase browser history."}</span> <a href="https://www.weather.gov/" onClick={(event) => { event.preventDefault(); window.location.replace("https://www.weather.gov/"); }}>{es ? "Salir rápido" : "Quick exit"}</a></div>
    <section className="crisis-intake" aria-labelledby="crisis-intake-title">
      <h2 id="crisis-intake-title">{es ? "Crear un plan" : "Make a plan"}</h2>
      <p className="small"><a href="/privacy/">{es ? "Información de privacidad (en inglés)" : "Privacy information"}</a></p>
      <p>{es ? "Sus selecciones y el plan quedan en la memoria de esta página. La guía no los envía a la API ni los guarda en el almacenamiento del navegador." : "Your selections and plan stay in this page's memory. The guide does not send them to the API or save them in browser storage."}</p>
      <div className="crisis-form-grid"><label>{es ? "Problema de vivienda" : "Housing problem"}<select disabled={!ready} value={situation} onChange={(event) => chooseSituation(event.target.value as CrisisSituation | "")}><option value="">{es ? "Elegir o consultar contactos" : "Choose or browse contacts"}</option>{situations.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label>
      <label>{es ? "Ciudad o condado (opcional)" : "City or county (optional)"}<select disabled={!ready} value={location} onChange={(event) => setLocation(event.target.value as CrisisLocation)}>{locations.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label></div>
      {situation && <div className="crisis-form-grid"><label>{es ? "¿Cuándo necesita ayuda?" : "How soon do you need help?"}<select disabled={!ready} value={timeframe} onChange={(event) => setTimeframe(event.target.value as CrisisInput["timeframe"])}>{timeframes.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label>
      <label>{es ? "¿Está en un lugar seguro ahora?" : "Are you somewhere safe now?"}<select disabled={!ready} value={safe} onChange={(event) => setSafe(event.target.value as CrisisInput["safe"])}>{safetyChoices.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label>
      {situation === "eviction" && <label>{es ? "¿Qué documento recibió?" : "What document did you receive?"}<select disabled={!ready} value={noticeStage} onChange={(event) => setNoticeStage(event.target.value as CrisisNoticeStage)}>{noticeStages.map((option) => <option key={option.value} value={option.value}>{option[locale]}</option>)}</select></label>}</div>}
      <p className="sr-only" role="status" aria-atomic="true">{plan ? `${copy.housing.planUpdated(plan.title)} ${selectedChoices}` : ""}</p>
      {plan && <><CrisisPlan plan={plan} now={referenceTime} /><div className="crisis-actions"><button type="button" onClick={() => void copyPlan()}>{es ? "Copiar plan" : "Copy plan"}</button><button type="button" onClick={() => window.print()}>{es ? "Imprimir" : "Print"}</button><button type="button" onClick={savePlan}>{es ? "Guardar texto" : "Save text"}</button></div><p role="status" aria-atomic="true">{feedback}</p><p className="small muted">{es ? "Los archivos guardados pueden ser visibles para otras personas que usan este dispositivo." : "Saved files may be visible to others using this device."}</p></>}
    </section>
    <section className="crisis-directory" aria-labelledby="crisis-directory-title"><h2 id="crisis-directory-title">{es ? "Directorio de recursos" : "Resource directory"}</h2><p>{es ? "Consulte cada fuente oficial para confirmar horarios, requisitos y disponibilidad." : "Check each official source for current hours, eligibility and availability."}</p>{es && <p className="small muted">{copy.housing.sourceEnglishNotice}</p>}
      <ul>{shown.map((resource) => <ResourceCard key={resource.id} resource={resource} es={es} now={referenceTime} />)}</ul>
    </section>
  </main>;
}
