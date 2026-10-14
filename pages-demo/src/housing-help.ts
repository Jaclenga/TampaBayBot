export type HousingCategory = "all" | "eviction" | "homelessness" | "legal" | "emergency";
export type HousingLocation = "all" | "hillsborough" | "pinellas" | "pasco" | "tampa" | "st-petersburg" | "clearwater";
export type HousingLanguage = "en" | "es";

export interface HousingResource {
  id: string;
  categories: Exclude<HousingCategory, "all">[];
  organization: string;
  program: string;
  description: string;
  geography: string[];
  municipalities?: string[];
  url: string;
  contacts: { label: string; value: string; kind: "phone" | "text" | "web" }[];
  eligibility: string;
  availability: string;
  verifiedAt: string;
  sourceUrl: string;
  verificationStatus?: "source_checked" | "needs_recheck" | "source_unavailable";
  nextReviewAt?: string;
  lastLinkCheckedAt?: string | null;
  linkStatus?: string;
  knownIssues?: string[];
  reviewNotes?: string | null;
  availabilityStatus?: "unknown" | "confirmed_open" | "temporarily_closed" | "discontinued";
  refreshDays?: number;
  intakeUrl?: string;
  serviceHours?: string;
  restrictions?: string[];
  crisisCategories?: ("eviction" | "rent" | "imminent_homelessness" | "homelessness" | "unsafe_housing" | "utilities" | "domestic_violence" | "disaster" | "affordable_housing")[];
}

const municipalityCounty: Record<string, string> = {
  tampa: "hillsborough",
  "st-petersburg": "pinellas",
  clearwater: "pinellas",
};

export function filterHousingResources(resources: HousingResource[], category: HousingCategory, location: HousingLocation): HousingResource[] {
  return resources.filter((resource) => {
    if (category !== "all" && !resource.categories.includes(category)) return false;
    if (location === "all") return true;
    if (resource.geography.includes("national") || resource.geography.includes("florida")) return true;
    const county = municipalityCounty[location] ?? location;
    if (!resource.geography.includes(county)) return false;
    return !resource.municipalities?.length || resource.municipalities.includes(location);
  });
}

export function resourceSourceStatus(resource: Pick<HousingResource, "verifiedAt" | "verificationStatus" | "refreshDays" | "nextReviewAt">, now = Date.now()): "source_checked" | "needs_recheck" | "source_unavailable" {
  const reviewed = Date.parse(`${resource.verifiedAt}T00:00:00Z`);
  const scheduled = resource.nextReviewAt != null;
  const nextReview = scheduled ? Date.parse(`${resource.nextReviewAt}T23:59:59.999Z`) : NaN;
  const intervalOverdue = !Number.isFinite(reviewed) || Math.floor((now - reviewed) / 86_400_000) > (resource.refreshDays ?? 90);
  const scheduledOverdue = scheduled && (!Number.isFinite(nextReview) || now > nextReview);
  const overdue = intervalOverdue || scheduledOverdue;
  const stale = resource.verificationStatus !== "source_checked" || !Number.isFinite(reviewed) || overdue;
  return resource.verificationStatus === "source_unavailable" ? "source_unavailable" : stale ? "needs_recheck" : "source_checked";
}

export function resourceCopyText(resource: HousingResource, now = Date.now(), language: HousingLanguage = "en"): string {
  const label = language === "es" ? {
    coverage: "Cobertura", limited: "limitado a", contact: "Contacto", eligibility: "Requisitos", availability: "Disponibilidad",
    availabilityStatus: "Estado de disponibilidad", restrictions: "Restricciones", hours: "Horario publicado", intake: "Solicitud o admisión oficial",
    sourceStatus: "Estado de revisión", checked: "Información revisada por última vez", website: "Sitio oficial", source: "Fuente oficial",
    statusChecked: "Información pública revisada en la fecha indicada", statusRecheck: "Necesita nueva revisión; confirme directamente", statusUnavailable: "Fuente no disponible en la última revisión; verifique por teléfono",
    unknown: "no verificada", open: "abierto según la última comprobación", closed: "temporalmente cerrado", discontinued: "descontinuado",
  } : {
    coverage: "Coverage", limited: "limited to", contact: "Contact", eligibility: "Eligibility", availability: "Availability",
    availabilityStatus: "Availability status", restrictions: "Restrictions", hours: "Published hours", intake: "Official intake",
    sourceStatus: "Review status", checked: "Resource information last reviewed", website: "Official website", source: "Source",
    statusChecked: "Public details reviewed on the date shown", statusRecheck: "Review due; confirm directly", statusUnavailable: "Source unavailable at last review; verify by phone",
    unknown: "not verified", open: "open at last check", closed: "temporarily closed", discontinued: "discontinued",
  };
  const status = resourceSourceStatus(resource, now);
  const sourceStatus = status === "source_unavailable" ? label.statusUnavailable : status === "needs_recheck" ? label.statusRecheck : label.statusChecked;
  const availabilityStatus = resource.availabilityStatus === "confirmed_open" ? label.open : resource.availabilityStatus === "temporarily_closed" ? label.closed : resource.availabilityStatus === "discontinued" ? label.discontinued : label.unknown;
  return [
    `${resource.organization} — ${resource.program}`,
    resource.description,
    `${label.coverage}: ${resource.geography.join(", ")}${resource.municipalities?.length ? `; ${label.limited} ${resource.municipalities.join(", ")}` : ""}`,
    `${label.contact}: ${resource.contacts.map((contact) => `${contact.label}: ${contact.value}`).join("; ")}`,
    `${label.eligibility}: ${resource.eligibility}`,
    `${label.availability}: ${resource.availability}`,
    ...(resource.availabilityStatus ? [`${label.availabilityStatus}: ${availabilityStatus}`] : []),
    ...(resource.restrictions?.length ? [`${label.restrictions}: ${resource.restrictions.join("; ")}`] : []),
    ...(resource.serviceHours ? [`${label.hours}: ${resource.serviceHours}`] : []),
    ...(resource.intakeUrl && resource.availabilityStatus !== "temporarily_closed" && resource.availabilityStatus !== "discontinued" ? [`${label.intake}: ${resource.intakeUrl}`] : []),
    `${label.sourceStatus}: ${sourceStatus}`,
    `${label.checked}: ${resource.verifiedAt}`,
    `${label.website}: ${resource.url}`,
    `${label.source}: ${resource.sourceUrl}`,
  ].join("\n");
}
