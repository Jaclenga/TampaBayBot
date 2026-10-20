import { resourceLinkNotice } from "./housing-help";
import type { HousingLanguage } from "./housing-help";

const labels = {
  en: {
    known: "Known source issue",
    link: "Automated link check",
    error: "An official link returned an error at the last check. Confirm the page or contact the provider directly; this does not establish whether the service is available.",
    inconclusive: "An official link could not be checked automatically. Confirm the page or contact the provider directly.",
    redirect: "An official link redirected at the last check. Confirm its destination before relying on it.",
    checked: "Last link check",
  },
  es: {
    known: "Advertencia conocida de la fuente (en inglés)",
    link: "Comprobación automática del enlace",
    error: "Un enlace oficial devolvió un error en la última comprobación. Confirme la página o contacte directamente al proveedor; esto no determina si el servicio está disponible.",
    inconclusive: "No se pudo comprobar un enlace oficial automáticamente. Confirme la página o contacte directamente al proveedor.",
    redirect: "Un enlace oficial redirigió en la última comprobación. Confirme el destino antes de usarlo.",
    checked: "Última comprobación del enlace",
  },
} as const;

export default function ResourceWarnings({ resource, language }: { resource: { knownIssues?: string[]; linkStatus?: string; lastLinkCheckedAt?: string | null }; language: HousingLanguage }) {
  const t = labels[language];
  const linkNotice = resourceLinkNotice(resource);
  if (!resource.knownIssues?.length && !linkNotice) return null;
  return <div className="resource-review-warnings">
    {resource.knownIssues?.map((issue) => <p className="small alert" key={issue}><strong>{t.known}:</strong> <span lang="en">{issue}</span></p>)}
    {linkNotice && <p className="small alert"><strong>{t.link}:</strong> {t[linkNotice]} {resource.lastLinkCheckedAt && `${t.checked}: ${resource.lastLinkCheckedAt}.`}</p>}
  </div>;
}
