"use client";

import { useId } from "react";
import type { CrisisPlan as CrisisPlanData, CrisisResource } from "@/lib/housing/crisis.mjs";
import { useLocale } from "@/lib/i18n/locale";

function safeHttps(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { copy } = useLocale();
  const url = safeHttps(href);
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> ({copy.common.opens})</span></a> : <span>{children}</span>;
}

export function resourceNeedsRecheck(resource: CrisisResource, now: number): boolean {
  const checked = new Date(`${resource.verifiedAt}T00:00:00Z`).getTime();
  const ageDays = Math.floor((now - checked) / 86_400_000);
  const scheduled = resource.nextReviewAt != null;
  const due = scheduled ? new Date(`${resource.nextReviewAt}T23:59:59.999Z`).getTime() : NaN;
  const overdue = ageDays > (resource.refreshDays ?? 90) || (scheduled && (!Number.isFinite(due) || now > due));
  return resource.verificationStatus !== "source_checked" || !Number.isFinite(checked) || ageDays < -1 || overdue;
}

export function resourceCoverage(resource: CrisisResource, es: boolean): string {
  const labels: Record<string, string> = es ? {
    hillsborough: "Condado de Hillsborough", pinellas: "Condado de Pinellas", pasco: "Condado de Pasco",
    florida: "Florida", national: "Estados Unidos", tampa: "Tampa",
    "unincorporated-hillsborough": "área no incorporada del condado de Hillsborough",
  } : {
    hillsborough: "Hillsborough County", pinellas: "Pinellas County", pasco: "Pasco County",
    florida: "Florida", national: "United States", tampa: "Tampa",
    "unincorporated-hillsborough": "unincorporated Hillsborough County",
  };
  return (resource.municipalities?.length ? resource.municipalities : resource.geography)
    .map(area => labels[area] ?? area).join(", ");
}

export function resourceLinkCaution(resource: CrisisResource, es: boolean): string | null {
  if (["broken", "http_error"].includes(resource.linkStatus ?? "")) return es
    ? "Un enlace oficial devolvió un error en la última comprobación. Confirme la página o contacte al proveedor; esto no determina si el servicio está disponible."
    : "An official link returned an error at the last check. Confirm the page or contact the provider; this does not establish whether the service is available.";
  if (["temporary_failure", "rate_limited", "access_restricted"].includes(resource.linkStatus ?? "")) return es
    ? "No se pudo comprobar un enlace oficial automáticamente. Confirme la página o contacte al proveedor."
    : "An official link could not be checked automatically. Confirm the page or contact the provider.";
  if (resource.linkStatus === "redirect") return es
    ? "Un enlace oficial redirigió en la última comprobación. Confirme el destino antes de usarlo."
    : "An official link redirected at the last check. Confirm its destination before relying on it.";
  return null;
}

export function ResourceReviewWarnings({ resource, es }: { resource: CrisisResource; es: boolean }) {
  const linkCaution = resourceLinkCaution(resource, es);
  if (!resource.knownIssues?.length && !linkCaution) return null;
  return <div className="resource-review-warnings">
    {resource.knownIssues?.map((issue) => <p className="resource-caution" key={issue}><strong>{es ? "Advertencia conocida de la fuente (en inglés)" : "Known source issue"}:</strong> <span lang="en">{issue}</span></p>)}
    {linkCaution && <p className="resource-caution"><strong>{es ? "Comprobación automática del enlace" : "Automated link check"}:</strong> {linkCaution} {resource.lastLinkCheckedAt && `${es ? "Última comprobación" : "Last checked"}: ${resource.lastLinkCheckedAt}.`}</p>}
  </div>;
}

export function ResourceCard({ resource, es, now }: { resource: CrisisResource; es: boolean; now: number }) {
  const stale = resourceNeedsRecheck(resource, now);
  const area = resourceCoverage(resource, es);
  return <li>
    <strong lang="en">{resource.organization} — {resource.program}</strong>
    <p lang="en">{resource.description}</p>
    <p><strong>{es ? "Área" : "Area"}:</strong> {area}. <strong>{es ? "Contacto" : "Contact"}:</strong> <span lang="en">{resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join(" · ")}</span></p>
    <p><strong>{es ? "Requisitos" : "Eligibility"}:</strong> <span lang="en">{resource.eligibility}</span></p>
    <p><strong>{es ? "Disponibilidad" : "Availability"}:</strong> <span lang="en">{resource.availability}</span> {resource.availabilityStatus === "temporarily_closed" ? (es ? "Cierre temporal indicado." : "Listed as temporarily closed.") : resource.availabilityStatus === "discontinued" ? (es ? "Programa descontinuado." : "Listed as discontinued.") : (es ? "Confirme la disponibilidad actual." : "Confirm current availability.")}</p>
    {resource.restrictions && resource.restrictions.length > 0 && <p><strong>{es ? "Restricciones" : "Restrictions"}:</strong> <span lang="en">{Array.isArray(resource.restrictions) ? resource.restrictions.join("; ") : resource.restrictions}</span></p>}
    {resource.serviceHours && <p><strong>{es ? "Horario publicado" : "Published hours"}:</strong> <span lang="en">{resource.serviceHours}</span></p>}
    <p className={stale ? "resource-caution" : "small muted"}>{es ? "Información del recurso revisada por última vez" : "Resource information last reviewed"}: {resource.verifiedAt}. {resource.verificationStatus === "source_unavailable" ? (es ? "La fuente no estaba disponible en la última revisión; verifique por teléfono." : "Source unavailable at last review; verify by phone.") : stale ? (es ? "Necesita nueva revisión; contacte al proveedor." : "Review due; contact the provider.") : (es ? "Confirme los detalles actuales con la organización." : "Confirm current details with the organization.")}</p>
    <ResourceReviewWarnings resource={resource} es={es} />
    <p><SafeLink href={resource.url}>{es ? "Sitio oficial" : "Official site"}</SafeLink> · <SafeLink href={resource.sourceUrl}>{es ? "Fuente" : "Source"}</SafeLink>{resource.intakeUrl && !["temporarily_closed", "discontinued"].includes(resource.availabilityStatus ?? "") && <> · <SafeLink href={resource.intakeUrl}>{es ? "Admisión oficial" : "Official intake"}</SafeLink></>}</p>
  </li>;
}

export default function CrisisPlan({ plan, now }: { plan: CrisisPlanData; now: number }) {
  const { copy } = useLocale();
  const titleId = useId();
  const es = plan.language === "es";
  return <section className="crisis-plan" aria-labelledby={titleId} lang={plan.language}>
    <p className="crisis-priority-label">{es ? "Prioridad" : "Priority"}: {plan.urgency === "emergency" ? (es ? "Ayuda inmediata" : "Immediate help") : plan.urgency === "urgent" ? (es ? "Urgente" : "Urgent") : (es ? "Planificación" : "Planning")}</p>
    <h3 id={titleId}>{plan.title}</h3>
    <p><strong>{es ? "Primero:" : "First:"}</strong> {plan.immediatePriority}</p>
    <h4>{es ? "Próximos pasos" : "Next steps"}</h4>
    <ol>{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    <p><strong>{es ? "Plazos:" : "Deadlines:"}</strong> {plan.deadline}</p>
    <p><strong>{es ? "Ayuda de una persona:" : "Human assistance:"}</strong> {plan.humanAssistance}</p>
    {plan.documents.length > 0 && <><h4>{es ? "Información que puede preparar" : "Information you can prepare"}</h4><ul>{plan.documents.map((item) => <li key={item}>{item}</li>)}</ul></>}
    {plan.resources.length > 0 ? <><h4>{es ? "Contactos para consultar" : "Contacts to check"}</h4>{es && <p className="small muted">{copy.housing.sourceEnglishNotice}</p>}<ul className="crisis-resource-list">{plan.resources.map((resource) => <ResourceCard key={resource.id} resource={resource} es={es} now={now} />)}</ul></> : <p>{es ? "No hay un contacto local recién verificado para esta selección. Elija su condado o consulte el directorio." : "No recently checked local contact matches this selection. Choose your county or browse the directory."}</p>}
    <ul className="crisis-plan-notes">{plan.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    {plan.sources.length > 0 && <><h4>{es ? "Fuentes oficiales" : "Official sources"}</h4><ul>{plan.sources.map((source) => <li key={source.url}><SafeLink href={source.url}><span lang="en">{source.title}</span></SafeLink> <small>({es ? "información revisada" : "information reviewed"} {source.verifiedAt})</small></li>)}</ul></>}
  </section>;
}
