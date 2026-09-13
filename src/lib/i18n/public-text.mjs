// Translate only application-authored messages. Official record text and source
// names pass through unchanged; no model or network translation is involved.
const SPANISH = new Map([
  ['Enter a street number and street name, with a city or ZIP code if you know it.', 'Escriba el número y el nombre de la calle, con la ciudad o el código postal si los conoce.'],
  ['Some address services could not be checked. The available matches may be incomplete.', 'No se pudieron consultar algunos servicios de direcciones. Las coincidencias disponibles pueden estar incompletas.'],
  ['More than one address matched. Select the location you mean before viewing property information.', 'Se encontró más de una dirección. Seleccione la ubicación correcta antes de consultar la propiedad.'],
  ['Check the matched address, then select it to look up this location.', 'Compruebe la dirección encontrada y selecciónela para consultar esta ubicación.'],
  ['An official address service could not be reached or returned an unreadable result. Try again or use the responsible city or county map.', 'No se pudo acceder a un servicio oficial de direcciones o su respuesta no se pudo leer. Inténtelo de nuevo o consulte el mapa del municipio o condado responsable.'],
  ['No reliable address-point match was found. Try the street number and name, then add a city or ZIP code if needed. Official address services cover Hillsborough, Pinellas and Pasco.', 'No se encontró una coincidencia fiable de dirección. Pruebe con el número y el nombre de la calle y añada la ciudad o el código postal si hace falta. Los servicios oficiales cubren Hillsborough, Pinellas y Pasco.'],
  ['The boundary service returned an unexpected municipality. Jurisdiction needs verification.', 'El servicio de límites devolvió un municipio inesperado. Es necesario verificar la jurisdicción.'],
  ['Select a matched address before looking up property information.', 'Seleccione una dirección coincidente antes de consultar la propiedad.'],
  ['Jurisdiction could not be confirmed. No parcel or land-use designation is assigned; review the boundary source results.', 'No se pudo confirmar la jurisdicción. No se asigna ninguna parcela ni designación de uso del suelo; revise los resultados de las fuentes de límites.'],
  ['Mapped zoning and future land use do not establish permission to build or an official determination.', 'La zonificación y el uso futuro del suelo que aparecen en los mapas no constituyen un permiso para construir ni una decisión oficial.'],
  ['Zoning and future land use are checked against the full returned parcel polygon. Boundary touches can return neighboring designations; agency review is needed to confirm split zoning.', 'Se comprueban la zonificación y el uso futuro del suelo en todo el polígono recibido de la parcela. El contacto con límites puede devolver designaciones vecinas; la agencia debe confirmar si hay más de una zonificación.'],
  ['Whole-parcel geometry could not be verified. Zoning and future land use describe the selected address point only; split zoning elsewhere on the parcel has not been checked.', 'No se pudo verificar la geometría de toda la parcela. La zonificación y el uso futuro del suelo describen solo el punto de la dirección; no se ha comprobado si otras partes de la parcela tienen otra zonificación.'],
  ['County land-use layers are limited to unincorporated Pasco. A municipal intersection or an unavailable boundary check prevents assigning county designations. Contact the municipality shown in the boundary records.', 'Las capas de uso del suelo del condado se limitan a las áreas no incorporadas de Pasco. Una intersección municipal o una comprobación de límites no disponible impide asignar designaciones del condado. Contacte con el municipio indicado en los registros de límites.'],
  ['Pasco parcels remain available countywide. County zoning and future land use are withheld where a municipal boundary intersects the selected parcel or address, or cannot be checked.', 'Las parcelas de Pasco están disponibles en todo el condado. No se asignan zonificación ni uso futuro del suelo del condado donde un límite municipal intersecta la parcela o dirección, o no puede comprobarse.'],
  ['Multiple parcels intersect this address point. No single parcel is selected; verify the parcel identifier with the Property Appraiser.', 'Varias parcelas intersectan este punto de dirección. No se selecciona una parcela única; verifique su identificador con la oficina de Property Appraiser.'],
  ['The parcel site address differs from the selected address. This can happen on shared sites; confirm the parcel identifier before relying on it.', 'La dirección de la parcela difiere de la seleccionada. Esto puede ocurrir en terrenos compartidos; confirme el identificador de la parcela antes de usar la información.'],
  ['Some property information needs verification. Review the individual source results.', 'Parte de la información de la propiedad necesita verificación. Revise los resultados de cada fuente.'],
  ['This point is outside the supported Tampa Bay search area.', 'Este punto está fuera de la zona de búsqueda disponible de Tampa Bay.'],
  ['No development-record adapter is configured for this jurisdiction. Use the responsible agency portal; a missing dataset does not mean no activity exists.', 'No hay un servicio de registros de desarrollo configurado para esta jurisdicción. Consulte el portal de la agencia responsable; la falta de datos no significa que no exista actividad.'],
  ['A missing dataset does not mean no development or permit activity exists.', 'La falta de un conjunto de datos no significa que no exista actividad de desarrollo o de permisos.'],
  ['This independent development snapshot covers the City of Tampa only. St. Petersburg, Clearwater and other Tampa Bay locations are not included.', 'Esta copia independiente de registros de desarrollo cubre solo la ciudad de Tampa. No incluye St. Petersburg, Clearwater ni otras ubicaciones de Tampa Bay.'],
  ['City of Tampa jurisdiction could not be confirmed. The development snapshot was not searched.', 'No se pudo confirmar la jurisdicción de la ciudad de Tampa. No se buscó en la copia de registros de desarrollo.'],
  ['No matching record points were found in this snapshot. Other records or activity may exist.', 'No se encontraron puntos de registros coincidentes en esta copia guardada. Puede haber otros registros o actividad.'],
  ['The independent development-record snapshot could not be loaded or its format changed. Open the source project to review its published records.', 'No se pudo cargar la copia independiente de registros de desarrollo o cambió su formato. Abra el proyecto original para consultar sus registros publicados.'],
  ['Official city development layers could not be retrieved. Open the source to verify records.', 'No se pudieron consultar las capas oficiales de desarrollo municipal. Abra la fuente para verificar los registros.'],
  ['Official development layers could not be retrieved. Open the source to verify records.', 'No se pudieron consultar las capas oficiales de desarrollo. Abra la fuente para verificar los registros.'],
  ['Some official layers were unavailable or limited the result. Returned records are incomplete; try a smaller radius or inspect the official sources.', 'Algunas capas oficiales no estaban disponibles o limitaron el resultado. Los registros recibidos están incompletos; pruebe un radio menor o consulte las fuentes oficiales.'],
  ['No project or planning-case areas were returned by the configured official layers. Other development and permits may exist.', 'Las capas oficiales configuradas no devolvieron áreas de proyectos o casos de planificación. Puede haber otros desarrollos o permisos.'],
  ['This pinned independent snapshot covers Tampa. Separate official GIS adapters cover selected St. Petersburg district projects and Clearwater planning cases; source scopes are shown separately.', 'Esta copia independiente fijada cubre Tampa. Otros servicios GIS oficiales cubren determinados proyectos de distritos de St. Petersburg y casos de planificación de Clearwater; se indica por separado el alcance de cada fuente.'],
  ['Public records describe reported activity and status; they do not prove physical construction started or finished.', 'Los registros públicos describen la actividad y el estado reportados; no prueban que una obra haya empezado o terminado.'],
  ['This is an independent source-bounded snapshot, not a complete or current inventory of all Tampa development.', 'Esta es una copia independiente limitada a sus fuentes, no un inventario completo ni actual de todo el desarrollo de Tampa.'],
  ['Distance is straight-line great-circle distance to the normalized record point, not walking distance, parcel-boundary distance, or a legal relationship.', 'La distancia se mide en línea recta sobre la superficie terrestre hasta el punto normalizado del registro. No indica una ruta a pie, distancia al límite de la parcela ni una relación legal.'],
  ['Normalized activities may combine several source records or locations. Only the published representative point is searched.', 'Las actividades normalizadas pueden combinar varios registros o ubicaciones. Solo se busca el punto representativo publicado.'],
  ['A missing nearby result does not establish that no activity occurred.', 'La falta de resultados cercanos no demuestra que no haya habido actividad.'],
  ['These are current queries of published city and county GIS layers, whose underlying records may be older. Retrieval time is not an assurance of source currency.', 'Estas consultas actuales utilizan capas GIS publicadas de ciudades y condados, cuyos registros pueden ser antiguos. La fecha de consulta no garantiza que la fuente esté al día.'],
  ['The official GIS service selects project polygons intersecting the search radius. No representative-point or parcel-boundary distance is invented.', 'El servicio GIS oficial selecciona polígonos de proyectos que intersectan el radio de búsqueda. No se inventa una distancia a un punto representativo ni al límite de la parcela.'],
  ['Published projects and planning cases do not prove construction started, finished, or received final approval.', 'Los proyectos y casos de planificación publicados no prueban que las obras hayan empezado, terminado o recibido aprobación final.'],
  ['A missing result does not prove that no development or permit activity exists.', 'La falta de resultados no demuestra que no exista actividad de desarrollo o de permisos.'],
  ['GIS record edit dates are editing timestamps, not application, approval, or construction dates. County planning records do not establish municipal building-permit authority.', 'Las fechas de edición del registro GIS indican cambios en los datos, no solicitudes, aprobaciones ni obras. Los registros de planificación del condado no establecen la autoridad municipal sobre permisos de construcción.'],
  ['St. Petersburg publishes selected district projects without source update dates. Displayed statuses may be older; verify current status with Development Services.', 'St. Petersburg publica determinados proyectos de distritos sin fechas de actualización de la fuente. Los estados mostrados pueden ser antiguos; confirme el estado actual con Development Services.'],
  ['Published planning-case polygons, including zoning and ordinance cases; not a building-permit inventory. An ordinance date does not establish construction activity.', 'Polígonos publicados de casos de planificación, incluidos casos de zonificación y ordenanzas; no es un inventario de permisos de construcción. La fecha de una ordenanza no demuestra actividad de construcción.'],
  ['Published County GIS Zoning In Review case polygons only, including older entries. Not a complete development or building-permit inventory; in-review layer membership does not verify current approval status.', 'Solo polígonos de casos publicados en la capa Zoning In Review del GIS del condado, incluidos registros antiguos. No es un inventario completo de desarrollos o permisos; aparecer en la capa de revisión no confirma el estado actual de aprobación.'],
  ['Published County GIS CPA In Review comprehensive-plan amendment polygons only, including older entries. Proposed land-use descriptions are case information, not adopted parcel designations or proof of construction.', 'Solo polígonos publicados de enmiendas al plan integral en la capa CPA In Review del GIS del condado, incluidos registros antiguos. Las descripciones de uso del suelo propuesto son información del caso, no designaciones adoptadas para la parcela ni pruebas de construcción.'],
  ['City of Tampa only. Core normalized activities from eight named City GIS layers observed on August 23, 2026. The expanded Accela dataset and later raw-only observations are not included.', 'Solo la ciudad de Tampa. Actividades principales normalizadas de ocho capas GIS municipales identificadas, observadas el 23 de agosto de 2026. No se incluyen el conjunto ampliado de Accela ni las observaciones posteriores sin normalizar.'],
  ['City jurisdiction boundary', 'Límite de la jurisdicción municipal'],
  ['Unverified', 'Sin verificar'], ['Outside supported area', 'Fuera de la zona disponible'],
  ['Outside configured municipal coverage', 'Fuera de la cobertura municipal configurada'],
  ['available', 'disponible'], ['unavailable', 'no disponible'], ['incomplete', 'incompleto'], ['found', 'encontrado'],
  ['source status date', 'fecha de estado en la fuente'], ['source last-updated date', 'fecha de última actualización de la fuente'],
  ['source record-created date', 'fecha de creación del registro en la fuente'], ['GIS record edit date', 'fecha de edición del registro GIS'],
  ['ordinance date', 'fecha de la ordenanza'],
  ['date not supplied', 'fecha no indicada'], ['Status not supplied', 'Estado no indicado'], ['Type not supplied', 'Tipo no indicado'],
  ['Address lookup unavailable.', 'La búsqueda de direcciones no está disponible.'], ['Property lookup unavailable.', 'La consulta de propiedades no está disponible.'],
  ['Development lookup unavailable.', 'La consulta de desarrollo no está disponible.'],
  ['The request took too long to upload. Please try again.', 'La solicitud tardó demasiado en enviarse. Inténtelo de nuevo.'],
  ['The request was interrupted. Please try again.', 'La solicitud se interrumpió. Inténtelo de nuevo.'],
  ['The request is too long.', 'La solicitud es demasiado larga.'], ['The request is empty.', 'La solicitud está vacía.'],
  ['Review the official RMAP application process', 'Consulte el proceso oficial de solicitud de RMAP'],
  ['Check the official home-repair program status', 'Compruebe el estado oficial del programa de reparación de viviendas'],
  ['Find help through Hillsborough County', 'Busque ayuda a través del Condado de Hillsborough'],
  ['Explore Florida Housing buyer and renter resources', 'Consulte los recursos de Florida Housing para compradores e inquilinos'],
  ['Look up the official Tampa zoning map', 'Consulte el mapa oficial de zonificación de Tampa'],
  ['Find the right residential permit category', 'Busque la categoría adecuada de permiso residencial'],
  ['Read the official new-construction application guide', 'Lea la guía oficial de solicitudes para construcciones nuevas'],
  ['Contact Tampa Development Coordination', 'Contacte con Tampa Development Coordination'],
  ['View adopted future land-use maps', 'Consulte los mapas adoptados de uso futuro del suelo'],
  ['Contact Tampa housing services and explore programs', 'Contacte con los servicios de vivienda de Tampa y consulte sus programas'],
  ['Inspect official parcel service metadata', 'Consulte los metadatos del servicio oficial de parcelas'],
  ['Verify land-use maps with Plan Hillsborough', 'Verifique los mapas de uso del suelo con Plan Hillsborough'],
  ['Inspect Tampa Development Records methodology and original records', 'Consulte la metodología y los registros originales de Tampa Development Records'],
  ['Inspect Pinellas County GIS: address, parcels and municipal boundaries', 'Consulte el GIS del Condado de Pinellas: direcciones, parcelas y límites municipales'],
  ['Inspect St. Petersburg GIS zoning and future land use', 'Consulte la zonificación y el uso futuro del suelo en el GIS de St. Petersburg'],
  ['Inspect Clearwater GIS zoning and future land use', 'Consulte la zonificación y el uso futuro del suelo en el GIS de Clearwater'],
  ['Open the official Pasco County GIS and mapper guidance', 'Abra las instrucciones oficiales del GIS y los mapas del Condado de Pasco'],
  ['Fictional example link (not a real service)', 'Enlace de ejemplo ficticio (no es un servicio real)'],
]);

export function publicText(value, locale = 'en') {
  if (locale !== 'es' || typeof value !== 'string') return value;
  if (SPANISH.has(value)) return SPANISH.get(value);
  if (/^Review (?:St\. Pete|Housing Rehabilitation|St\. Petersburg|Clearwater|Pinellas County|Applying for a Pinellas|Pasco County)/.test(value)) return value.replace(/^Review /, 'Consulte ');
  let match;
  if ((match = value.match(/^Published (Downtown|Grand Central|Skyway Marina) project areas only; not a citywide permit inventory\. Source update date is not supplied\.$/))) return `Solo áreas de proyectos publicados de ${match[1]}; no es un inventario de permisos de toda la ciudad. No se indica la fecha de actualización de la fuente.`;
  // Combined coverage messages join several curated source descriptions. Keep
  // their order and restrictions instead of presenting only the first source.
  if ([...SPANISH.keys()].some(original => original.length > 100 && value.includes(original))) {
    let translated = value;
    for (const [original, replacement] of SPANISH) if (original.length > 100) translated = translated.replaceAll(original, replacement);
    if (translated !== value) return translated;
  }
  if ((match = value.match(/^No intersecting feature was returned for this (parcel polygon|address point)\.$/))) return `No se recibió ningún elemento que intersecte ${match[1] === 'parcel polygon' ? 'el polígono de esta parcela' : 'el punto de esta dirección'}.`;
  if ((match = value.match(/^(.*) could not be retrieved\. This does not mean the property has no designation\.$/))) return `No se pudo consultar ${match[1]}. Esto no significa que la propiedad no tenga una designación.`;
  if ((match = value.match(/^Direct property lookup is configured for (.*)\. This point is outside their mapped boundaries; contact the responsible municipality or county\.$/))) return `La consulta directa de propiedades está configurada para ${match[1]}. Este punto está fuera de sus límites en el mapa; contacte con el municipio o condado responsable.`;
  if ((match = value.match(/^More than one mapped designation may intersect this (parcel|point)\. All returned matches are shown; official review is needed\.$/))) return `Más de una designación del mapa puede intersectar ${match[1] === 'parcel' ? 'esta parcela' : 'este punto'}. Se muestran todas las coincidencias recibidas; se requiere revisión oficial.`;
  if ((match = value.match(/^Public map records were found using the (whole parcel polygon|selected address point)\.$/))) return `Se encontraron registros públicos del mapa usando ${match[1] === 'whole parcel polygon' ? 'el polígono completo de la parcela' : 'el punto de la dirección seleccionada'}.`;
  if ((match = value.match(/^Select a location and a distance between (\d+) and (\d+) meters\.$/))) return `Seleccione una ubicación y una distancia de entre ${match[1]} y ${match[2]} metros.`;
  if ((match = value.match(/^No development-record dataset is configured for (.*)\.$/))) return `No hay un conjunto de registros de desarrollo configurado para ${match[1]}.`;
  if ((match = value.match(/^The source snapshot is (\d+) days old\. Verify current status with the original agency\.$/))) return `La copia de la fuente tiene ${match[1]} días de antigüedad. Verifique el estado actual con la agencia original.`;
  if ((match = value.match(/^(\d+) source rows had missing, out-of-area, or invalid coordinates or duplicate identifiers and could not be searched\.$/))) return `No se pudo buscar en ${match[1]} filas por coordenadas ausentes, fuera de la zona o no válidas, o por identificadores duplicados.`;
  if ((match = value.match(/^(\d+) published activity records? fall within (\d+) meters in the (\d{4}-\d{2}-\d{2}) snapshot\.$/))) return `Hay ${match[1]} registros de actividad publicada dentro de ${match[2]} metros en la copia del ${match[3]}.`;
  if ((match = value.match(/^(\d+) published project or planning-case areas intersect the (\d+)-meter search radius\.$/))) return `${match[1]} áreas de proyectos o casos de planificación publicados intersectan el radio de búsqueda de ${match[2]} metros.`;
  return value;
}

export function jurisdictionLabel(label, locale = 'en') {
  return locale === 'es' ? String(label).replace(/\b(Hillsborough|Pinellas|Pasco) County\b/g, 'Condado de $1') : label;
}

/** Split exact quotations for language markup without changing visible text. */
export function quotedSegments(text, evidence) {
  const segments = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = evidence.filter(item => typeof item.quote === 'string' && item.quote.length)
      .map(item => ({ ...item, index: text.indexOf(item.quote, cursor) })).filter(item => item.index >= 0)
      .sort((a, b) => a.index - b.index || b.quote.length - a.quote.length)[0];
    if (!next) { segments.push({ text: text.slice(cursor) }); break; }
    if (next.index > cursor) segments.push({ text: text.slice(cursor, next.index) });
    segments.push({ text: next.quote, language: ['en', 'es'].includes(next.language) ? next.language : 'und' });
    cursor = next.index + next.quote.length;
  }
  return segments;
}
