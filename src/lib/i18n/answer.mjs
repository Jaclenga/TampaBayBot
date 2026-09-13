// Translate application-authored navigation only. Quotes, source titles, agencies,
// URLs and recorded facts remain exact original evidence, never model translations.
const MESSAGES = new Map([
  ['I could not determine this reliably from the available public information.', 'No pude determinarlo de forma fiable con la información pública disponible.'],
  ['Enter a question about housing, zoning, permits, development, or an agency you need to find.', 'Escriba una pregunta sobre vivienda, zonificación, permisos, desarrollo o la agencia que necesita encontrar.'],
  ['I can help with Tampa Bay housing resources, zoning, permits, development records, and finding the responsible agency.', 'Puedo ayudarle a encontrar recursos de vivienda, zonificación, permisos, registros de desarrollo y la agencia responsable en Tampa Bay.'],
  ['This collection covers selected Tampa Bay resources in Hillsborough, Pinellas, and Pasco counties. I cannot verify local programs or property rules for the place you named.', 'Esta colección incluye recursos seleccionados de Tampa Bay en los condados de Hillsborough, Pinellas y Pasco. No puedo verificar programas locales ni reglas de propiedad para el lugar que indicó.'],
  ['Use the government serving that property to confirm local information.', 'Confirme la información local con el gobierno que atiende esa propiedad.'],
  ['I do not have a verified city-specific collection for the municipality you named. Confirm its local programs and rules with that city; county rules may not apply inside city limits.', 'No tengo una colección municipal verificada para el municipio que indicó. Confirme los programas y las reglas con esa ciudad; las reglas del condado podrían no aplicarse dentro de los límites municipales.'],
  ['The question and selected location name different jurisdictions. Confirm the city or county you want to use before I provide local programs or rules.', 'La pregunta y la ubicación seleccionada indican jurisdicciones distintas. Confirme qué ciudad o condado desea usar antes de consultar programas o reglas locales.'],
  ['I need the city or county to find the right local programs, rules, and agency. Select a jurisdiction or name it in your question.', 'Necesito la ciudad o el condado para encontrar los programas, las reglas y la agencia adecuados. Elija una jurisdicción o indíquela en su siguiente pregunta.'],
  ['Any resources shown here are broadly applicable navigation. They do not establish local program eligibility, property jurisdiction, or permission to build.', 'Los recursos que se muestran son orientación general. No confirman la elegibilidad para un programa local, la jurisdicción de una propiedad ni un permiso para construir.'],
  ['I cannot make an official eligibility, legal, zoning, or permitting determination. Use the responsible agency to request a decision; any cited resources are starting points.', 'No puedo emitir una decisión oficial sobre elegibilidad, asuntos legales, zonificación o permisos. Solicite una decisión a la agencia responsable; los recursos citados son puntos de partida.'],
  ['The agency needs the relevant household or project details and current rules. A source page or nearby record does not establish approval.', 'La agencia necesita los datos pertinentes del hogar o del proyecto y las reglas vigentes. Una página informativa o un registro cercano no confirman una aprobación.'],
  ['Confirm the exact name and jurisdiction with the responsible agency before relying on it.', 'Confirme el nombre exacto y la jurisdicción con la agencia responsable antes de confiar en esa información.'],
  ['I do not have usable source text for this question. Open the official resource to verify the information directly.', 'No tengo texto utilizable de las fuentes para esta pregunta. Abra el recurso oficial para verificar la información directamente.'],
  ['The available RMAP income table is labeled 2025. I cannot confirm that those figures are the current eligibility limits. Check the latest limits with the program agency.', 'La tabla disponible de ingresos de RMAP corresponde a 2025. No puedo confirmar que esas cifras sean los límites vigentes de elegibilidad. Consulte los límites actuales con la agencia del programa.'],
  ['This collection does not contain a verified definition or rule that answers that detail. Use the official zoning source and ask planning staff to confirm the meaning and requirements.', 'Esta colección no contiene una definición o regla verificada que responda a ese detalle. Consulte la fuente oficial de zonificación y pida al personal de planificación que confirme el significado y los requisitos.'],
  ['A map label alone is not enough to establish a numerical limit or permission to build.', 'Una etiqueta en un mapa no basta para establecer un límite numérico ni un permiso para construir.'],
  ['The available official sources disagree about whether applications are open. I cannot resolve that conflict from these snapshots.', 'Las fuentes oficiales disponibles no coinciden sobre si se aceptan solicitudes. No puedo resolver esa diferencia con estas copias guardadas.'],
  ['Ask the program agency to confirm current availability before applying. Both source statements are shown below.', 'Pida a la agencia del programa que confirme la disponibilidad actual antes de solicitarlo. Ambas declaraciones de las fuentes se muestran a continuación.'],
  ['I found sources to start with. Confirm the address and jurisdiction in the property lookup before relying on property-specific information.', 'Encontré fuentes para empezar. Confirme la dirección y la jurisdicción en la búsqueda de propiedades antes de usar información específica de una propiedad.'],
  ['Enter a full street address in the property lookup so the location and jurisdiction can be checked. I cannot identify a property from this question alone.', 'Escriba una dirección completa en la búsqueda de propiedades para comprobar la ubicación y la jurisdicción. No puedo identificar una propiedad solo con esta pregunta.'],
  ['Nearby records describe recorded activity. Distance alone does not show that a record applies to a property or establishes what is allowed there.', 'Los registros cercanos describen actividad documentada. La distancia por sí sola no demuestra que un registro corresponda a una propiedad ni establece lo que se permite allí.'],
  ['The official source and the property lookup are starting points. Ask the responsible planning or permitting staff to verify requirements for a specific property.', 'La fuente oficial y la búsqueda de propiedades son puntos de partida. Pida al personal responsable de planificación o permisos que verifique los requisitos de una propiedad específica.'],
  ['I cannot establish activity or predict future development from these general pages. Use the property lookup to find dated nearby records, then verify the original record with the agency.', 'No puedo confirmar actividad ni predecir el desarrollo futuro a partir de estas páginas generales. Use la búsqueda de propiedades para encontrar registros cercanos con fecha y verifique el registro original con la agencia.'],
  ['I cannot confirm a permit decision from general permit guidance. Find the specific record in the official permit resource and verify its status with the permitting agency.', 'No puedo confirmar una decisión sobre un permiso a partir de orientación general. Busque el registro específico en el recurso oficial y verifique su estado con la agencia de permisos.'],
  ['An application, a permit decision, and completed construction are different events. A general source page cannot establish a specific record status.', 'Una solicitud, una decisión sobre un permiso y una construcción terminada son hechos distintos. Una página de información general no confirma el estado de un registro específico.'],
  ['The best matching source snapshot may be outdated. I cannot confirm that its program availability or instructions still apply.', 'La copia guardada de la fuente más pertinente podría estar desactualizada. No puedo confirmar que la disponibilidad del programa o sus instrucciones sigan vigentes.'],
  ['Tell me what you are trying to do, such as finding housing help, checking a property, or applying for a permit. I need that detail to identify the right agency.', 'Dígame qué desea hacer, por ejemplo buscar ayuda para la vivienda, consultar una propiedad o solicitar un permiso. Necesito ese detalle para identificar la agencia adecuada.'],
  ['This resource may be relevant to your situation. Use its official application or contact path and check the questions below; this is not an eligibility decision.', 'Este recurso puede ser pertinente para su situación. Use la vía oficial de solicitud o contacto y confirme los puntos siguientes; esto no es una decisión de elegibilidad.'],
  ['Use the official source to check the designation and ask planning staff to explain how it applies to your property. This response does not interpret the code for a specific project.', 'Consulte la designación en la fuente oficial y pida al personal de planificación que explique cómo se aplica a su propiedad. Esta respuesta no interpreta el código para un proyecto específico.'],
  ['Use the permit resource to find the right application path. Ask permitting staff to confirm the requirements for your project.', 'Use el recurso de permisos para encontrar la vía de solicitud adecuada. Pida al personal de permisos que confirme los requisitos de su proyecto.'],
  ['Use the official link below to reach the source or the agency responsible for it.', 'Use el enlace oficial que aparece a continuación para consultar la fuente o contactar con la agencia responsable.'],
  ['Some source text was excluded because it contained instructions aimed at an assistant or executable markup.', 'Se excluyó parte del texto de las fuentes porque contenía instrucciones dirigidas a un asistente o código ejecutable.'],
  ['One or more snapshots are older than their planned refresh interval. Check the live official page before acting.', 'Una o más copias guardadas superan su intervalo previsto de actualización. Consulte la página oficial actual antes de actuar.'],
  ['A source could not be refreshed; this response uses a previously preserved snapshot.', 'No se pudo actualizar una fuente; esta respuesta utiliza una copia guardada anteriormente.'],
  ['Independent or secondary evidence is labeled. It is not an official government determination.', 'Las fuentes independientes o secundarias están identificadas. No representan una decisión oficial del gobierno.'],
  ['A recently retrieved page can still contain an older income table. Retrieval date is not the effective date of a rule.', 'Una página consultada recientemente todavía puede contener una tabla de ingresos antigua. La fecha de consulta no es la fecha de entrada en vigor de una regla.'],
  ['This answer uses the dated source snapshot shown in the evidence; it is not a live confirmation of current availability or record status.', 'Esta respuesta usa la copia guardada con la fecha que aparece en las fuentes; no confirma en tiempo real la disponibilidad actual ni el estado de un registro.'],
  ['Is the program accepting applications today?', '¿El programa está aceptando solicitudes hoy?'],
  ['Does it cover the address and the kind of help you need?', '¿Cubre la dirección y el tipo de ayuda que necesita?'],
  ['What income, household, and other eligibility rules apply?', '¿Qué reglas de ingresos, composición del hogar y otros requisitos de elegibilidad se aplican?'],
  ['Which documents and application steps does the agency require?', '¿Qué documentos y pasos de solicitud exige la agencia?'],
]);

function translate(text) {
  if (typeof text !== 'string') return text;
  if (MESSAGES.has(text)) return MESSAGES.get(text);
  const cited = text.match(/^(.*?)( \[E\d+\](?: \[E\d+\])*)$/s);
  if (cited && MESSAGES.has(cited[1])) return MESSAGES.get(cited[1]) + cited[2];
  if (/^I could not verify the (?:program|ordinance) you named/.test(text))
    return 'No pude verificar el programa o la ordenanza que indicó en la colección de esta jurisdicción. Las fuentes que se muestran sirven para consultar; no confirman que exista.';
  const stale = text.match(/^The preserved (.*) excerpt is shown below\. Check the live page with the agency before acting\.$/s);
  if (stale) return `El fragmento guardado de ${stale[1]} se muestra a continuación. Consulte la página actual con la agencia antes de actuar.`;
  return text;
}

export function localizeAnswer(answer, locale = 'en') {
  if (locale !== 'es') return answer;
  let text = translate(answer.answer);
  if (answer.status === 'answered') {
    // Use the existing citation order; retain every original exact quote and
    // qualification, including a supplemental factual row from the same source.
    const selected = [...answer.answer.matchAll(/\[(E\d+)\]/g)].map(match => answer.evidence.find(item => item.id === match[1])).filter(Boolean);
    if (selected.length) text = selected.map((item, index) => index === 0
      ? `Empiece por ${item.title}. La fuente dice: “${item.quote}” [${item.id}]`
      : `${item.title}: “${item.quote}” [${item.id}]`).join('\n\n');
  }
  return { ...answer, answer: text, meaning: translate(answer.meaning), warnings: answer.warnings.map(translate),
    ...(answer.requirementsToVerify ? { requirementsToVerify: answer.requirementsToVerify.map(translate) } : {}) };
}
