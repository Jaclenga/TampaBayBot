import { useEffect, useState } from "react";
import rawDirectory from "./housing-resources.json";
import { dateLabel } from "./api";
import { filterHousingResources, resourceCopyText, resourceSourceStatus } from "./housing-help";
import type { HousingCategory, HousingLocation, HousingResource } from "./housing-help";
import CrisisGuide from "./CrisisGuide";

// The static catalog is schema-checked in pages-demo/tests/resources-data.test.mjs.
const resources = rawDirectory.resources as unknown as HousingResource[];
type Language = "en" | "es";
const categories: { id: HousingCategory; en: string; es: string }[] = [
  { id: "all", en: "All housing help", es: "Toda la ayuda de vivienda" },
  { id: "eviction", en: "Eviction or rent", es: "Desalojo o alquiler" },
  { id: "homelessness", en: "Shelter or homelessness", es: "Refugio o falta de vivienda" },
  { id: "legal", en: "Legal help", es: "Ayuda legal" },
  { id: "emergency", en: "Emergency help", es: "Ayuda de emergencia" },
];
const locations: { id: HousingLocation; en: string; es: string }[] = [
  { id: "all", en: "All Tampa Bay areas", es: "Toda el área de Tampa Bay" },
  { id: "hillsborough", en: "Hillsborough County", es: "Condado de Hillsborough" },
  { id: "tampa", en: "City of Tampa", es: "Ciudad de Tampa" },
  { id: "pinellas", en: "Pinellas County", es: "Condado de Pinellas" },
  { id: "st-petersburg", en: "St. Petersburg", es: "St. Petersburg" },
  { id: "clearwater", en: "Clearwater", es: "Clearwater" },
  { id: "pasco", en: "Pasco County", es: "Condado de Pasco" },
];

const labels = {
  en: { title: "Housing help", intro: "Browse official contacts for eviction, shelter referrals, legal aid, and emergencies. You can view emergency contacts immediately.", emergency: "Need help right now?", emergencyIntro: "If someone is in immediate physical danger, call 911. Shelter openings and program funding can change; contact each provider to confirm.", info: "Official information", problem: "What do you need help with?", location: "Where are you?", urgent: "I need help urgently", resources: "Resources", shown: "resources shown", reviewed: "Public details last source-checked", print: "Print this page", noMatch: "No resource matches these filters. Choose all Tampa Bay areas or another type of help. The emergency contacts above remain available.", countyScope: "County filters show countywide contacts. City-only and unincorporated-only contacts remain under All Tampa Bay areas; choose a city for city services.", who: "Who can use this", availability: "Service availability", checked: "Public details last source-checked", confirm: "Confirm hours, eligibility, and service availability with the provider.", website: "Open official website", source: "View source", intake: "Official intake or application", details: "Copy details", copied: "Resource information copied.", copyFailed: "Copy unavailable. Open the official website or print this page.", restrictions: "Restrictions", hours: "Published hours", sourceStatus: "Source status", needsRecheck: "Needs recheck; verify directly", sourceUnavailable: "Source unavailable; verify by phone", sourceChecked: "Source checked", capacity: "Current openings or funding have not been verified.", closed: "This program is marked temporarily closed.", discontinued: "This program is marked discontinued.", quickExit: "Quick exit to weather", exitNote: "If someone may see your screen, Quick exit opens a weather site. It cannot erase browser history." },
  es: { title: "Ayuda de vivienda", intro: "Consulte contactos públicos de fuentes oficiales. Este directorio funciona cuando el servicio de preguntas está limitado o no disponible. Puede ver los contactos de emergencia de inmediato.", emergency: "¿Necesita ayuda ahora?", emergencyIntro: "Si alguien está en peligro físico inmediato, llame al 911. Los cupos de refugio y los fondos pueden cambiar; confirme con cada proveedor.", info: "Información oficial", problem: "¿Con qué necesita ayuda?", location: "¿Dónde está?", urgent: "Necesito ayuda urgente", resources: "Recursos", shown: "recursos mostrados", reviewed: "Detalles públicos comprobados en la fuente por última vez", print: "Imprimir esta página", noMatch: "Ningún recurso coincide con estos filtros. Elija toda el área de Tampa Bay u otro tipo de ayuda. Los contactos de emergencia siguen disponibles arriba.", countyScope: "Los filtros por condado muestran contactos para todo el condado. Los contactos solo de una ciudad o zona no incorporada aparecen en Toda el área de Tampa Bay; elija una ciudad para sus servicios.", who: "Quién puede usarlo", availability: "Disponibilidad del servicio", checked: "Detalles públicos comprobados en la fuente por última vez", confirm: "Confirme horarios, requisitos y disponibilidad con el proveedor.", website: "Abrir sitio oficial", source: "Ver fuente", intake: "Solicitud o admisión oficial", details: "Copiar detalles", copied: "Información del recurso copiada.", copyFailed: "No se pudo copiar. Abra el sitio oficial o imprima esta página.", restrictions: "Restricciones", hours: "Horario publicado", sourceStatus: "Estado de la fuente", needsRecheck: "Necesita nueva verificación; confirme directamente", sourceUnavailable: "Fuente no disponible; verifique por teléfono", sourceChecked: "Fuente comprobada", capacity: "No se han verificado cupos ni fondos actuales.", closed: "Este programa está marcado como temporalmente cerrado.", discontinued: "Este programa está marcado como descontinuado.", quickExit: "Salir rápido al sitio del clima", exitNote: "Si alguien puede ver su pantalla, Salir rápido abre un sitio del clima. No borra el historial del navegador." },
} as const;

function safeHttps(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function areaLabel(resource: HousingResource, language: Language): string {
  return resource.geography.map((area) => {
    if (area === "national") return language === "en" ? "United States" : "Estados Unidos";
    if (area === "florida") return "Florida";
    return locations.find((location) => location.id === area)?.[language] ?? area;
  }).join(", ");
}

function contactHref(contact: HousingResource["contacts"][number]): string | null {
  const hasExtension = /\b(?:ext\.?|extension|x)\s*\d+\b/i.test(contact.value);
  const number = hasExtension ? "" : contact.value.replace(/[^\d+]/g, "");
  return contact.kind === "phone" && number ? `tel:${number}`
    : contact.kind === "text" && number ? `sms:${number}`
    : contact.kind === "web" ? safeHttps(contact.value) : null;
}

function Contact({ contact }: { contact: HousingResource["contacts"][number] }) {
  const href = contactHref(contact);
  return <li><strong>{contact.label}:</strong> {href ? <a href={href}>{contact.value}</a> : contact.value}</li>;
}

function ResourceCard({ resource, language, now }: { resource: HousingResource; language: Language; now: number }) {
  const [copyStatus, setCopyStatus] = useState("");
  const t = labels[language];
  const website = safeHttps(resource.url);
  const source = safeHttps(resource.sourceUrl);
  const intake = resource.availabilityStatus === "temporarily_closed" || resource.availabilityStatus === "discontinued" ? null : safeHttps(resource.intakeUrl || "");
  const sourceCheck = resourceSourceStatus(resource, now);
  const sourceStatus = sourceCheck === "source_unavailable" ? t.sourceUnavailable : sourceCheck === "needs_recheck" ? t.needsRecheck : t.sourceChecked;
  const capacityRelevant = resource.categories.includes("homelessness") || resource.crisisCategories?.some((category) => ["rent", "imminent_homelessness", "homelessness", "utilities", "affordable_housing", "disaster"].includes(category));
  async function copy() {
    try {
      await navigator.clipboard.writeText(resourceCopyText(resource, now, language));
      setCopyStatus(t.copied);
    } catch {
      setCopyStatus(t.copyFailed);
    }
  }
  return <article className="housing-card">
    <div className="housing-card-title"><div><span className="eyebrow">{resource.organization}</span><h4>{resource.program}</h4></div><span className="housing-area">{resource.municipalities?.length ? `${resource.municipalities.map((place) => place.replaceAll("-", " ")).join(", ")} only` : resource.geography.map((place) => place.replaceAll("-", " ")).join(" · ")}</span></div>
    <p>{resource.description}</p>
    <ul className="housing-contacts">{resource.contacts.map((contact, index) => <Contact key={`${contact.label}-${index}`} contact={contact} />)}</ul>
    <p className="small"><strong>{t.who}:</strong> {resource.eligibility}</p>
    <p className="small"><strong>{t.availability}:</strong> {resource.availabilityStatus === "temporarily_closed" ? `${t.closed} ` : resource.availabilityStatus === "discontinued" ? `${t.discontinued} ` : ""}{resource.availability} {capacityRelevant && resource.availabilityStatus !== "confirmed_open" && resource.availabilityStatus !== "temporarily_closed" && resource.availabilityStatus !== "discontinued" ? t.capacity : ""}</p>
    {resource.serviceHours && <p className="small"><strong>{t.hours}:</strong> {resource.serviceHours}</p>}
    {resource.restrictions && resource.restrictions.length > 0 && <p className="small"><strong>{t.restrictions}:</strong> {resource.restrictions.join("; ")}</p>}
    <p className="small muted"><strong>{t.sourceStatus}:</strong> {sourceStatus}. {t.checked} {resource.verifiedAt}. {t.confirm}</p>
    <div className="housing-card-actions">{website && <a href={website} target="_blank" rel="noopener noreferrer">{t.website} <span aria-hidden="true">↗</span></a>}{intake && <a href={intake} target="_blank" rel="noopener noreferrer">{t.intake} <span aria-hidden="true">↗</span></a>}{source && <a href={source} target="_blank" rel="noopener noreferrer">{t.source} <span aria-hidden="true">↗</span></a>}<button type="button" onClick={() => void copy()}>{t.details}</button></div>
    <span className="sr-only" role="status">{copyStatus}</span>
  </article>;
}

export default function HousingHelp() {
  const [language, setLanguage] = useState<Language>("en");
  const [category, setCategory] = useState<HousingCategory>("all");
  const [location, setLocation] = useState<HousingLocation>("all");
  const [urgent, setUrgent] = useState(false);
  const [sourceCheckTime, setSourceCheckTime] = useState(() => Date.now());
  useEffect(() => {
    let timer: number;
    function scheduleNextUtcDay() {
      const nextDay = new Date();
      nextDay.setUTCHours(24, 0, 0, 0);
      timer = window.setTimeout(() => { setSourceCheckTime(Date.now()); scheduleNextUtcDay(); }, nextDay.getTime() - Date.now() + 1_000);
    }
    const refreshOnReturn = () => { if (!document.hidden) setSourceCheckTime(Date.now()); };
    scheduleNextUtcDay();
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", refreshOnReturn); };
  }, []);
  const t = labels[language];
  const results = filterHousingResources(resources, category, location);
  const immediate = resources.filter((resource) => ["emergency-911", "emergency-988", "emergency-spring", "emergency-casa", "emergency-sunrise", "homeless-hillsborough-211", "homeless-pinellas-211", "housing-pasco-coalition"].includes(resource.id));
  const sorted = urgent ? [...results].sort((a, b) => Number(b.categories.includes("emergency")) - Number(a.categories.includes("emergency"))) : results;
  return <section id="housing-help" className="housing-section" aria-labelledby="housing-title" lang={language}>
    <div className="housing-header-row"><div className="section-intro"><span className="eyebrow">{language === "en" ? "Public contacts. No account needed" : "Contactos publicos. No necesita cuenta"}</span><h2 id="housing-title">{t.title}</h2><p>{t.intro}</p></div><div className="housing-language"><label htmlFor="housing-language">{language === "en" ? "Language" : "Idioma"}</label><select id="housing-language" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="es">Español</option></select></div></div>
    <div className="crisis-safe-exit"><p>{t.exitNote}</p><button type="button" onClick={() => window.location.replace("https://www.weather.gov/")}>{t.quickExit}</button></div>
    <aside className="immediate-help" aria-labelledby="immediate-title"><h3 id="immediate-title">{t.emergency}</h3><p>{t.emergencyIntro}</p><div className="immediate-links">{immediate.map((resource) => {
      const status = resourceSourceStatus(resource, sourceCheckTime);
      const website = safeHttps(resource.url);
      return <div key={resource.id}><strong>{resource.program}</strong><small>{areaLabel(resource, language)}</small><span>{resource.contacts.map((contact, index) => <span key={`${contact.kind}-${index}`}>{index > 0 ? " · " : ""}{contactHref(contact) ? <a href={contactHref(contact) || undefined}>{contact.value}</a> : contact.value}</span>)}</span><small>{t.sourceStatus}: {status === "source_unavailable" ? t.sourceUnavailable : status === "needs_recheck" ? t.needsRecheck : t.sourceChecked}. {t.checked}: {resource.verifiedAt}. {t.confirm}</small>{website && <a href={website} target="_blank" rel="noopener noreferrer">{t.info} <span aria-hidden="true">↗</span></a>}</div>;
    })}</div></aside>
    <CrisisGuide language={language} resources={resources} location={location} onLocationChange={setLocation} now={sourceCheckTime} />
    <div className="housing-directory-heading" id="housing-resources"><h3>{t.resources}</h3><p>{language === "en" ? "Browse every listing without completing the guide." : "Consulte todos los recursos sin completar la guía."}</p>{language === "es" && <p className="housing-translation-note">Los nombres, descripciones y páginas oficiales de abajo están en inglés, salvo que el proveedor ofrezca español. El plan en español ofrece orientación general; prevalecen las fuentes oficiales.</p>}</div>
    <div className="housing-controls" role="group" aria-label={language === "en" ? "Filter housing assistance" : "Filtrar ayuda de vivienda"}><div><label htmlFor="housing-problem">{t.problem}</label><select id="housing-problem" value={category} onChange={(event) => setCategory(event.target.value as HousingCategory)}>{categories.map((option) => <option key={option.id} value={option.id}>{option[language]}</option>)}</select></div><div><label htmlFor="housing-location">{t.location}</label><select id="housing-location" value={location} onChange={(event) => setLocation(event.target.value as HousingLocation)}>{locations.map((option) => <option key={option.id} value={option.id}>{option[language]}</option>)}</select></div><label className="urgent-control"><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /> {t.urgent}</label></div>
    <p className="small muted">{t.countyScope}</p>
    <div className="housing-results-heading"><div><h3>{t.resources}</h3><p className="small muted" role="status">{sorted.length} {t.shown}. {t.reviewed} {dateLabel(rawDirectory.verifiedAt)}.</p></div><button type="button" onClick={() => window.print()}>{t.print}</button></div>
    {sorted.length ? <div className="housing-grid">{sorted.map((resource) => <ResourceCard key={resource.id} resource={resource} language={language} now={sourceCheckTime} />)}</div> : <p className="housing-empty">{t.noMatch}</p>}
  </section>;
}
