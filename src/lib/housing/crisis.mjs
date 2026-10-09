import { intentText } from '../core/routing/normalize.mjs';

// This module is shared by the Worker and the static Pages interface. It does
// not call a model, fetch a URL, persist intake answers, or infer eligibility.
export const CRISIS_SITUATIONS = Object.freeze([
  'eviction', 'rent', 'imminent_homelessness', 'homelessness',
  'unsafe_housing', 'utilities', 'domestic_violence', 'disaster',
  'affordable_housing',
]);

export const CRISIS_NOTICE_STAGES = Object.freeze([
  'none', 'informal_warning', 'written_notice', 'pay_or_vacate',
  'court_summons', 'pending_case', 'judgment_or_possession', 'unknown',
]);

const SITUATIONS = new Set(CRISIS_SITUATIONS);
const STAGES = new Set(CRISIS_NOTICE_STAGES);
const LOCATIONS = new Set(['all', 'hillsborough', 'pinellas', 'pasco', 'tampa', 'st-petersburg', 'clearwater']);
const CITY_COUNTY = Object.freeze({ tampa: 'hillsborough', 'st-petersburg': 'pinellas', clearwater: 'pinellas' });
const JURISDICTION_LOCATION = Object.freeze({
  tampa: 'tampa', 'hillsborough-county': 'hillsborough',
  'st-petersburg': 'st-petersburg', clearwater: 'clearwater',
  'pinellas-county': 'pinellas', 'pasco-county': 'pasco',
});

const COPY = {
  en: {
    common: {
      legal: 'This is public navigation, not legal advice. An agency or legal-aid attorney must confirm what applies to you.',
      availability: 'Contacts and intake availability can change. Check the live official source; no bed, funding, or placement is promised.',
      noLocal: 'No recently source-checked local contact matches this selection. Browse the full directory or contact 211 for a current referral.',
      noLocation: 'Choose a city or county to narrow these contacts. County contacts below serve different areas; check each card before calling or applying.',
      limitedArea: 'A listed contact serves only the municipality or unincorporated area shown on its card. Confirm that your address is inside that service area.',
      codeArea: 'For code complaints, confirm whether your address is inside city limits or an unincorporated area. The full directory lists the area-specific offices.',
      staleContact: 'Some contacts below are past their scheduled source-check date and need rechecking. Use their official links or call to confirm contact details, service area, and current intake before relying on them.',
      documentsOptional: 'Ask the intake provider what it requires. Contact them even if you do not have every document.',
      noDeadline: 'No deadline can be calculated from these answers. Check any notice or official message and ask the responsible office to confirm its date.',
      courtDeadline: 'Read the exact instructions and date on each court paper. Confirm the response deadline promptly with the court clerk or legal aid; this site cannot calculate it.',
      orderDeadline: 'Read any dates and instructions in the court order. Ask the clerk or legal aid about next steps immediately; this site cannot calculate a deadline or interpret the order for you.',
      noticeDeadline: 'Read the exact date and instructions on the notice. Ask legal aid what it means for your circumstances; a landlord notice and a court summons are different documents.',
      immediateDanger: 'If someone is in immediate physical danger, call 911. This site cannot dispatch help.',
      unsafeSleep: 'If you have nowhere safe to stay tonight, contact 211 or local shelter intake now.',
      rmapConflict: 'At the last source check, the City of Tampa RMAP page and its linked portal described different help for existing leases. Do not assume past-due rent or eviction prevention is covered; ask city staff to confirm current rules.',
    },
    eviction: {
      title: 'Eviction notice or court case',
      priority: 'Identify the document you received, keep a copy, and contact tenant legal aid promptly.',
      summons: 'Read the summons and attached court papers now. Find the exact response instructions and deadline on your papers, then contact legal aid promptly.',
      judgment: 'Contact legal aid immediately and confirm the case status and any court order with the clerk. This site cannot determine when you must leave.',
      warning: 'Keep messages or notes about the warning and ask legal aid what to do if a written notice or court paper arrives.',
      notice: 'Keep the written landlord notice and ask legal aid to explain it. A landlord notice is different from a court summons or order.',
      steps: [
        'Tell legal aid the document type and date printed on it. Do not share the document or personal details with this site.',
        'If a court case has begun, use your county clerk’s official case information and follow the actual court papers.',
        'Ask a local housing referral service whether any rent or stabilization help is available; screening and funding are not guaranteed.',
      ],
      documents: ['Any landlord notice or court paper you received', 'Lease and rent or payment records, if available'],
      human: 'A tenant legal-aid attorney can explain your options. The court clerk can explain filing procedures but cannot give legal advice.',
    },
    rent: {
      title: 'Trouble paying rent',
      priority: 'Contact a local housing referral or assistance intake channel and ask what help is currently available for your existing home.',
      steps: [
        'Ask whether the provider serves your address and whether funds or applications are available now.',
        'If you received a notice or court papers, contact tenant legal aid and follow the date and instructions on those papers.',
        'Ask what documents the provider needs before making a trip or application.',
      ],
      documents: ['Rent or past-due notice, if any', 'Lease and recent payment information, if available'],
      human: 'A housing intake worker can screen for programs; tenant legal aid can help with a notice or court case.',
    },
    imminent_homelessness: {
      title: 'At risk of losing a place to stay',
      priority: 'Contact a local 211 or coordinated-entry intake service now and explain when you may lose your housing.',
      steps: [
        'Ask about shelter referral, housing navigation, and any prevention help available for your household.',
        'If you have a notice or court paper, keep it and contact legal aid promptly.',
        'Ask where and how to complete intake if you lack transportation, ID, a stable phone, or internet.',
      ],
      documents: ['Any housing-loss notice or court paper, if available', 'ID or program papers you already have, if available'],
      human: '211 and coordinated-entry workers can explain current referral paths; only an intake provider can confirm placement.',
    },
    homelessness: {
      title: 'Need somewhere safe to stay',
      priority: 'Contact a local 211, coordinated-entry, or shelter intake channel and ask about a safe option for tonight.',
      steps: [
        'Tell intake staff whether you need a place tonight and ask about referral and transportation options.',
        'Ask about food, hygiene, case management, and longer-term housing navigation.',
        'Contact the intake service even if you have no ID, stable phone, or mailing address; ask what alternatives it accepts.',
      ],
      documents: ['ID or program papers you already have, if available'],
      human: 'A shelter or coordinated-entry worker must confirm current intake rules and any space. A referral is not a bed reservation.',
    },
    unsafe_housing: {
      title: 'Unsafe housing conditions',
      priority: 'If the hazard creates immediate physical danger, move to a safer place and call emergency services. Otherwise contact the appropriate local housing or code office.',
      steps: [
        'Describe the condition to the responsible local office and ask how to report it safely.',
        'If safe, keep dates, repair requests, and photos for your own records; do not upload them here.',
        'Ask tenant legal aid before taking action that could affect rent or your tenancy.',
      ],
      documents: ['Dates of problems and repair requests, if available', 'Photos or messages you already have, if safe to keep'],
      human: 'Local code staff can explain complaint channels; legal aid can discuss tenant options. Ask whether your name and address may become public before filing.',
    },
    utilities: {
      title: 'Utility shutoff or past-due bill',
      priority: 'Read the shutoff notice and contact the utility and the local energy-assistance intake provider promptly.',
      steps: [
        'Ask the utility about the exact shutoff date and available payment or hardship options.',
        'Ask the assistance provider about current eligibility, documents, and funds; no payment is guaranteed.',
        'If a medical or immediate safety concern is involved, explain that to the utility or appropriate emergency service.',
      ],
      documents: ['Utility bill and shutoff notice, if any', 'Account information for the official provider, if requested'],
      human: 'The utility and energy-assistance provider can confirm the current status and application path.',
    },
    domestic_violence: {
      title: 'Safety and housing after domestic violence',
      priority: 'If it is safe to do so, contact a domestic-violence advocate using a device and time you can use privately.',
      steps: [
        'Ask an advocate about safety planning, confidential shelter options, and housing or legal referrals.',
        'If someone is in immediate physical danger, call 911; an advocate can help with other urgent safety needs.',
        'Use a device that another person cannot monitor if possible. Closing this page does not erase browsing history.',
      ],
      documents: [],
      human: 'A domestic-violence advocate can discuss options and current intake. This site cannot arrange rescue or confirm shelter space.',
    },
    disaster: {
      title: 'Housing after a hurricane or flood',
      priority: 'Find a safe place and contact local disaster or 211 intake for current shelter and recovery referrals.',
      steps: [
        'Ask local responders or 211 about current shelter and transportation information.',
        'Check the official FEMA channel to see whether your incident and location qualify for an open application.',
        'Keep damage and housing records for official intake if safe; this site does not collect them.',
      ],
      documents: ['Incident or damage details for an official application, if available', 'Housing or insurance documents, if available'],
      human: 'Local emergency management and official intake staff can confirm current shelter, declarations, and assistance.',
    },
    affordable_housing: {
      title: 'Find more affordable housing',
      priority: 'Use official housing-search and housing-authority channels to check current listings and application rules.',
      steps: [
        'Check each official listing or authority for the area served and current application status.',
        'Ask about waitlists, income rules, and accessibility needs directly; this site cannot confirm eligibility or openings.',
        'If you may lose your current housing soon, switch to the urgent housing-loss path and contact 211.',
      ],
      documents: ['Only the documents requested by the official application or intake provider'],
      human: 'Housing-authority or program staff must confirm openings, waitlist status, and eligibility.',
    },
  },
  es: {
    common: {
      legal: 'Esta es orientación pública, no asesoría legal. Una agencia o un abogado de asistencia legal debe confirmar qué corresponde a su caso.',
      availability: 'Los contactos y las admisiones pueden cambiar. Consulte la fuente oficial actual; no se promete una cama, fondos ni una vivienda.',
      noLocal: 'No hay un contacto local revisado recientemente que coincida con su selección. Consulte el directorio completo o llame al 211 para pedir una remisión actual.',
      noLocation: 'Elija una ciudad o un condado para reducir estos contactos. Los contactos de distintos condados atienden zonas diferentes; revise cada ficha antes de llamar o solicitar ayuda.',
      limitedArea: 'Un contacto indicado atiende solo al municipio o área no incorporada que aparece en su ficha. Confirme que su dirección esté dentro de esa zona.',
      codeArea: 'Para quejas de códigos, confirme si su dirección está dentro de una ciudad o en un área no incorporada. El directorio completo muestra las oficinas de cada zona.',
      staleContact: 'Algunos contactos ya pasaron la fecha prevista para volver a revisar su fuente y necesitan verificación. Use sus enlaces oficiales o llame para confirmar los datos, la zona atendida y la admisión actual antes de depender de ellos.',
      documentsOptional: 'Pregunte al proveedor de admisión qué exige. Comuníquese aunque no tenga todos los documentos.',
      noDeadline: 'No se puede calcular un plazo con estas respuestas. Revise cualquier aviso o mensaje oficial y confirme la fecha con la oficina responsable.',
      courtDeadline: 'Lea las instrucciones y la fecha exactas en cada documento judicial. Confirme pronto el plazo para responder con la secretaría del tribunal o asistencia legal; este sitio no puede calcularlo.',
      orderDeadline: 'Lea las fechas e instrucciones de la orden judicial. Pregunte de inmediato a la secretaría o a asistencia legal por los próximos pasos; este sitio no puede calcular un plazo ni interpretar la orden para usted.',
      noticeDeadline: 'Lea la fecha y las instrucciones exactas del aviso. Pregunte a asistencia legal qué significan en su caso; un aviso del propietario y una citación judicial son documentos diferentes.',
      immediateDanger: 'Si alguien corre peligro físico inmediato, llame al 911. Este sitio no puede enviar ayuda.',
      unsafeSleep: 'Si no tiene un lugar seguro donde quedarse esta noche, contacte ahora al 211 o a admisión de refugios locales.',
      rmapConflict: 'En la última revisión, la página de RMAP de la Ciudad de Tampa y su portal enlazado describían ayuda diferente para contratos de alquiler existentes. No suponga que cubre alquiler atrasado o prevención del desalojo; confirme las reglas actuales con la ciudad.',
    },
    eviction: {
      title: 'Aviso de desalojo o caso judicial',
      priority: 'Identifique el documento que recibió, guarde una copia y contacte pronto a asistencia legal para inquilinos.',
      summons: 'Lea ahora la citación y los documentos judiciales adjuntos. Busque las instrucciones y el plazo exactos en sus papeles y contacte pronto a asistencia legal.',
      judgment: 'Contacte de inmediato a asistencia legal y confirme el estado del caso y cualquier orden judicial con la secretaría. Este sitio no puede determinar cuándo debe salir.',
      warning: 'Guarde los mensajes o notas sobre la advertencia y pregunte a asistencia legal qué hacer si recibe un aviso escrito o documentos judiciales.',
      notice: 'Guarde el aviso escrito del propietario y pida a asistencia legal que se lo explique. Un aviso del propietario es diferente de una citación u orden judicial.',
      steps: [
        'Indique a asistencia legal el tipo de documento y la fecha impresa. No comparta el documento ni datos personales con este sitio.',
        'Si comenzó un caso judicial, consulte la información oficial de la secretaría de su condado y siga los documentos del tribunal.',
        'Pregunte a un servicio local de vivienda si hay ayuda para el alquiler o para conservar su vivienda; la evaluación y los fondos no están garantizados.',
      ],
      documents: ['Cualquier aviso del propietario o documento judicial que recibió', 'Contrato de alquiler y registros de pagos, si los tiene'],
      human: 'Un abogado de asistencia legal para inquilinos puede explicar sus opciones. La secretaría del tribunal puede explicar trámites, pero no dar asesoría legal.',
    },
    rent: {
      title: 'Dificultad para pagar el alquiler',
      priority: 'Contacte a un servicio local de vivienda y pregunte qué ayuda hay actualmente para conservar su hogar.',
      steps: [
        'Pregunte si el proveedor atiende su dirección y si hay fondos o solicitudes disponibles ahora.',
        'Si recibió un aviso o documentos judiciales, contacte a asistencia legal para inquilinos y siga las fechas e instrucciones de esos papeles.',
        'Pregunte qué documentos necesita el proveedor antes de viajar o presentar una solicitud.',
      ],
      documents: ['Aviso de alquiler atrasado, si lo recibió', 'Contrato y pagos recientes, si los tiene'],
      human: 'Un trabajador de admisión puede evaluar programas; asistencia legal puede ayudar con un aviso o caso judicial.',
    },
    imminent_homelessness: {
      title: 'Riesgo de perder dónde quedarse',
      priority: 'Contacte ahora al 211 o al servicio local de acceso coordinado e indique cuándo podría perder su vivienda.',
      steps: [
        'Pregunte por remisiones a refugios, orientación de vivienda y ayuda preventiva disponible para su hogar.',
        'Si tiene un aviso o documento judicial, guárdelo y contacte pronto a asistencia legal.',
        'Pregunte cómo completar la admisión si no tiene transporte, identificación, teléfono estable o internet.',
      ],
      documents: ['Aviso o documento judicial sobre la pérdida de vivienda, si lo tiene', 'Identificación o papeles de programas que ya tenga, si los tiene'],
      human: 'El 211 y el acceso coordinado pueden explicar las remisiones actuales; solo un proveedor de admisión puede confirmar una ubicación.',
    },
    homelessness: {
      title: 'Necesita un lugar seguro donde quedarse',
      priority: 'Contacte al 211, acceso coordinado o admisión de refugios de su zona y pregunte por una opción segura para esta noche.',
      steps: [
        'Diga al personal de admisión si necesita un lugar esta noche y pregunte por remisiones y transporte.',
        'Pregunte por comida, higiene, gestión de casos y orientación para vivienda a más largo plazo.',
        'Contacte al servicio aunque no tenga identificación, teléfono estable o dirección postal; pregunte qué alternativas acepta.',
      ],
      documents: ['Identificación o papeles de programas que ya tenga, si los tiene'],
      human: 'El personal de refugio o acceso coordinado debe confirmar sus reglas y el espacio disponible. Una remisión no reserva una cama.',
    },
    unsafe_housing: {
      title: 'Condiciones inseguras de vivienda',
      priority: 'Si existe peligro físico inmediato, vaya a un lugar más seguro y llame a emergencias. En otros casos, contacte a la oficina local correspondiente de vivienda o códigos.',
      steps: [
        'Describa la condición a la oficina local responsable y pregunte cómo reportarla de forma segura.',
        'Si es seguro, guarde fechas, solicitudes de reparación y fotos para sus propios registros; no las suba aquí.',
        'Consulte a asistencia legal para inquilinos antes de actuar de una manera que pueda afectar su alquiler o tenencia.',
      ],
      documents: ['Fechas de problemas y solicitudes de reparación, si las tiene', 'Fotos o mensajes que ya tenga, si es seguro conservarlos'],
      human: 'La oficina local puede explicar cómo presentar una queja; asistencia legal puede hablar de opciones para inquilinos. Antes de presentarla, pregunte si su nombre y dirección pueden hacerse públicos.',
    },
    utilities: {
      title: 'Corte de servicios públicos o factura atrasada',
      priority: 'Lea el aviso de corte y contacte pronto a la empresa de servicios y al proveedor local de ayuda para energía.',
      steps: [
        'Pregunte a la empresa la fecha exacta del corte y las opciones de pago o dificultad económica.',
        'Pregunte al proveedor de ayuda por requisitos, documentos y fondos actuales; no se garantiza el pago.',
        'Si hay una necesidad médica o peligro inmediato, explíquelo a la empresa o al servicio de emergencia adecuado.',
      ],
      documents: ['Factura y aviso de corte, si los tiene', 'Datos de la cuenta para el proveedor oficial, si los pide'],
      human: 'La empresa y el proveedor de ayuda pueden confirmar el estado actual y cómo solicitar ayuda.',
    },
    domestic_violence: {
      title: 'Seguridad y vivienda tras violencia doméstica',
      priority: 'Si puede hacerlo de manera segura, contacte a una persona especializada en violencia doméstica desde un dispositivo y momento privados.',
      steps: [
        'Pregunte por planificación de seguridad, opciones de refugio confidencial y remisiones de vivienda o asistencia legal.',
        'Si alguien corre peligro físico inmediato, llame al 911; una persona especializada puede ayudar con otras necesidades urgentes.',
        'Si es posible, use un dispositivo que otra persona no pueda vigilar. Cerrar esta página no borra el historial de navegación.',
      ],
      documents: [],
      human: 'Una persona especializada puede explicar opciones y admisión actual. Este sitio no puede enviar rescate ni confirmar espacio en refugios.',
    },
    disaster: {
      title: 'Vivienda después de un huracán o inundación',
      priority: 'Busque un lugar seguro y contacte al servicio local para desastres o al 211 para remisiones actuales de refugio y recuperación.',
      steps: [
        'Pregunte a los servicios locales o al 211 por refugios y transporte actuales.',
        'Consulte el canal oficial de FEMA para saber si hay una solicitud abierta para su incidente y ubicación.',
        'Guarde registros de daños y vivienda para la admisión oficial, si es seguro; este sitio no los recoge.',
      ],
      documents: ['Datos del incidente o los daños para una solicitud oficial, si los tiene', 'Documentos de vivienda o seguro, si los tiene'],
      human: 'La gestión local de emergencias y el personal oficial pueden confirmar refugios, declaraciones y ayuda actuales.',
    },
    affordable_housing: {
      title: 'Encontrar vivienda más asequible',
      priority: 'Use canales oficiales de búsqueda y autoridades de vivienda para comprobar listados y reglas de solicitud actuales.',
      steps: [
        'Consulte la zona atendida y el estado actual de solicitudes de cada listado o autoridad oficial.',
        'Pregunte directamente por listas de espera, ingresos y accesibilidad; este sitio no puede confirmar elegibilidad ni vacantes.',
        'Si puede perder su vivienda pronto, use la opción urgente de pérdida de vivienda y contacte al 211.',
      ],
      documents: ['Solo los documentos que solicite el programa o proveedor oficial'],
      human: 'El personal del programa o autoridad de vivienda debe confirmar vacantes, listas de espera y elegibilidad.',
    },
  },
};

const RESOURCE_TAGS = Object.freeze({
  'legal-bay-area': ['eviction', 'rent', 'unsafe_housing'],
  'legal-florida-tenant-rights': ['eviction', 'rent', 'unsafe_housing'],
  'court-hillsborough-eviction': ['eviction'],
  'court-pinellas-eviction': ['eviction'],
  'court-pasco-eviction': ['eviction'],
  'housing-tampa-rmap': ['imminent_homelessness', 'affordable_housing'],
  'housing-pinellas-adult-financial': ['eviction', 'rent', 'utilities'],
  'housing-pasco-coalition': ['eviction', 'rent', 'imminent_homelessness', 'homelessness'],
  'homeless-hillsborough-thhi': ['imminent_homelessness', 'homelessness'],
  'homeless-metro-ministry-intake': ['imminent_homelessness', 'homelessness'],
  'homeless-tampa-hope': ['homelessness'],
  'homeless-tampa-outreach': ['imminent_homelessness', 'homelessness'],
  'homeless-hillsborough-211': ['eviction', 'rent', 'imminent_homelessness', 'homelessness', 'utilities', 'disaster'],
  'homeless-pinellas-211': ['eviction', 'rent', 'imminent_homelessness', 'homelessness', 'utilities', 'disaster'],
  'emergency-spring': ['domestic_violence'],
  'emergency-casa': ['domestic_violence'],
  'emergency-sunrise': ['domestic_violence'],
  'emergency-hillsborough-energy': ['utilities'],
  'emergency-pinellas-energy': ['utilities'],
  'emergency-pasco-energy': ['utilities'],
  'emergency-fema-disaster': ['disaster'],
});

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || !SITUATIONS.has(input.situation)) return null;
  return {
    situation: input.situation,
    location: LOCATIONS.has(input.location) ? input.location : 'all',
    timeframe: ['tonight', 'days', 'later', 'unknown'].includes(input.timeframe) ? input.timeframe : 'unknown',
    safe: ['yes', 'no', 'unsure'].includes(input.safe) ? input.safe : 'unsure',
    noticeStage: ['eviction', 'rent'].includes(input.situation) && STAGES.has(input.noticeStage) ? input.noticeStage : 'unknown',
    physicalDanger: input.physicalDanger === true,
    seriousHazard: input.seriousHazard === true,
    noSafePlaceTonight: input.noSafePlaceTonight === true,
    courtDeadlineSoon: input.courtDeadlineSoon === true,
    shutoffImminent: input.shutoffImminent === true,
    mentionsRmap: input.mentionsRmap === true,
  };
}

/** Deterministic urgency; emergency does not itself mean police are appropriate. */
export function triageHousingCrisis(input) {
  const value = normalizeInput(input);
  if (!value) return null;
  const { situation, timeframe, safe, noticeStage } = value;
  const emergency = value.physicalDanger || value.seriousHazard || value.noSafePlaceTonight || safe === 'no' ||
    (timeframe === 'tonight' && ['imminent_homelessness', 'homelessness', 'domestic_violence', 'disaster'].includes(situation));
  const urgent = value.courtDeadlineSoon || value.shutoffImminent || timeframe === 'days' ||
    ['court_summons', 'pending_case', 'judgment_or_possession'].includes(noticeStage) ||
    ['imminent_homelessness', 'homelessness', 'domestic_violence', 'disaster'].includes(situation) ||
    (situation === 'eviction' && ['unknown', 'written_notice', 'pay_or_vacate'].includes(noticeStage));
  const dangerKind = value.physicalDanger || value.seriousHazard ? 'physical_danger'
    : situation === 'domestic_violence' ? 'domestic_violence'
    : value.noSafePlaceTonight || safe === 'no' || (timeframe === 'tonight' &&
      ['imminent_homelessness', 'homelessness', 'disaster'].includes(situation)) ? 'unsafe_sleep' : 'none';
  const referralPath = dangerKind === 'physical_danger' ? 'emergency_services'
    : dangerKind === 'domestic_violence' ? 'dv_advocate'
    : ['imminent_homelessness', 'homelessness', 'disaster'].includes(situation) || dangerKind === 'unsafe_sleep' ? 'shelter_intake'
    : situation === 'eviction' ? 'legal_aid' : situation === 'affordable_housing' ? 'housing_navigation' : 'assistance_intake';
  return { situation, urgency: emergency ? 'emergency' : urgent ? 'urgent' : 'standard',
    reason: emergency ? 'immediate_safety_or_sleep' : urgent ? 'time_sensitive_housing' : 'planning',
    dangerKind, referralPath };
}

function locationMatches(resource, location) {
  const geography = Array.isArray(resource.geography) ? resource.geography : [];
  if (geography.includes('national') || geography.includes('florida')) return true;
  if (location === 'all') return ['hillsborough', 'pinellas', 'pasco'].some(county => geography.includes(county)) && !resource.municipalities?.length;
  const county = CITY_COUNTY[location] ?? location;
  if (!geography.includes(county)) return false;
  if (!resource.municipalities?.length) return true;
  if (resource.municipalities.includes(location)) return true;
  // A county choice does not establish whether the address is in a city or
  // unincorporated area. Keep area-only offices in the browsable directory.
  return false;
}

function sourceIsListable(resource) {
  if (resource.verificationStatus !== 'source_checked') return false;
  if (['temporarily_closed', 'discontinued'].includes(resource.availabilityStatus)) return false;
  if (!/^https:\/\//.test(resource.url ?? '') || !/^https:\/\//.test(resource.sourceUrl ?? '')) return false;
  return true;
}

function sourceCheckAge(resource, now) {
  const checked = Date.parse(`${resource.verifiedAt}T00:00:00Z`);
  return (now.getTime() - checked) / 86_400_000;
}

function recentlyChecked(resource, now) {
  if (!sourceIsListable(resource)) return false;
  const maximum = Number.isInteger(resource.refreshDays) && resource.refreshDays > 0 ? resource.refreshDays : 90;
  const age = sourceCheckAge(resource, now);
  return Number.isFinite(age) && age >= -1 && Math.floor(age) <= maximum;
}

function needsRecheck(resource, now) {
  if (!sourceIsListable(resource)) return false;
  const maximum = Number.isInteger(resource.refreshDays) && resource.refreshDays > 0 ? resource.refreshDays : 90;
  const age = sourceCheckAge(resource, now);
  return Number.isFinite(age) && Math.floor(age) > maximum && age <= 365;
}

function resourceTags(resource) {
  return Array.isArray(resource.crisisCategories) ? resource.crisisCategories : RESOURCE_TAGS[resource.id] ?? [];
}

function resourceScore(resource, situation, input) {
  const id = resource.id ?? '';
  if (id === 'emergency-911') return input.physicalDanger || input.seriousHazard ? 120 : -1;
  if (id === 'emergency-988') return -1;
  if (id === 'housing-tampa-rmap' && (situation === 'eviction' || situation === 'rent' ||
      (situation === 'imminent_homelessness' && (input.timeframe === 'tonight' || input.safe === 'no' || input.noSafePlaceTonight)))) return -1;
  const relevant = resourceTags(resource).includes(situation) ||
    (situation === 'imminent_homelessness' && resourceTags(resource).includes('homelessness'));
  if (!relevant) return -1;
  let score = 30;
  if (situation === 'eviction') {
    if (id === 'legal-bay-area') score += 70;
    else if (id.startsWith('court-')) score += 65;
    else if (/metro-financial|adult-financial/.test(id)) score += 40;
    else if (id === 'legal-florida-tenant-rights') score += 15;
    else if (/211|housing.*help|financial/.test(id)) score += 25;
  } else if (situation === 'rent') {
    if (/metro-financial|adult-financial/.test(id)) score += 70;
    else if (/211|coalition|housing.*help/.test(id)) score += 50;
    if (id === 'legal-bay-area' && input.noticeStage !== 'none') score += 25;
  } else if (situation === 'domestic_violence') {
    if (/spring|casa|sunrise|violence|hotline/.test(id)) score += 70;
  } else if (situation === 'utilities') {
    if (/energy|liheap|utility/.test(id)) score += 65;
    if (/metro-financial|adult-financial/.test(id)) score += 35;
    if (/211/.test(id)) score += 25;
  } else if (situation === 'disaster') {
    if (/disaster|fema/.test(id)) score += 65;
    if (/211/.test(id)) score += 25;
  } else if (situation === 'unsafe_housing') {
    if (/code|enforcement|inspection/.test(id)) score += 65;
    if (id === 'legal-bay-area') score += 30;
  } else if (situation === 'affordable_housing') {
    if (/locator|search|authority/.test(id)) score += 65;
  } else if (/211|coalition|access|intake/.test(id)) score += 45;
  else if (/shelter|hope|outreach/.test(id)) score += 30;
  if (Array.isArray(resource.municipalities) && resource.municipalities.includes(input.location)) score += 5;
  return score;
}

/** Include only geographically eligible, recently source-checked directory entries. */
export function selectCrisisResources(input, resources, { now = new Date(), limit = 5 } = {}) {
  const value = normalizeInput(input);
  if (!value || !Array.isArray(resources)) return [];
  const time = new Date(now);
  if (Number.isNaN(time.getTime())) return [];
  const selected = resources.filter(resource => resource && locationMatches(resource, value.location) && recentlyChecked(resource, time) &&
      !(value.location === 'all' && value.situation === 'eviction' && String(resource.id).startsWith('court-')))
    .map(resource => ({ resource, score: resourceScore(resource, value.situation, value) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || String(a.resource.id).localeCompare(String(b.resource.id)))
    .map(item => item.resource);
  // A person with no safe place tonight needs shelter intake even when the
  // original problem was rent, a utility shutoff, or an unsafe apartment.
  if (value.situation !== 'homelessness' && value.situation !== 'domestic_violence' &&
      triageHousingCrisis(value).referralPath === 'shelter_intake') {
    const shelter = resources.filter(resource => resource && locationMatches(resource, value.location) && recentlyChecked(resource, time))
      .map(resource => ({ resource, score: resourceScore(resource, 'homelessness', value) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || String(a.resource.id).localeCompare(String(b.resource.id)))
      .slice(0, 2).map(item => item.resource);
    return [...new Map([...shelter, ...selected].map(resource => [resource.id, resource])).values()]
      .slice(0, Math.max(0, Math.min(10, Number(limit) || 0)));
  }
  return selected.slice(0, Math.max(0, Math.min(10, Number(limit) || 0)));
}

function isDirectReferral(resource, situation) {
  const id = resource.id ?? '';
  if (situation === 'domestic_violence') return /spring|casa|sunrise|violence|hotline/.test(id);
  if (situation === 'utilities') return /energy|liheap|financial|211/.test(id);
  if (situation === 'rent') return /financial|211|coalition|navigation/.test(id);
  if (['homelessness', 'imminent_homelessness'].includes(situation)) return /211|intake|coalition|outreach|shelter|thhi|hope/.test(id);
  if (situation === 'disaster') return /211|fema|disaster/.test(id);
  if (situation === 'eviction') return /legal-bay-area|court-|211|financial/.test(id);
  if (situation === 'unsafe_housing') return /legal-bay-area|code|routing/.test(id);
  return /locator|search|authority|navigation/.test(id);
}

function recheckFallbacks(input, resources, now) {
  const candidates = resources.filter(resource => resource && locationMatches(resource, input.location) &&
      needsRecheck(resource, now) && isDirectReferral(resource, input.situation))
    .map(resource => ({ resource, score: resourceScore(resource, input.situation, input) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || String(a.resource.id).localeCompare(String(b.resource.id)))
    .map(item => item.resource);
  // Without a county choice, offer one named contact from each county before
  // adding another from the same place. This is a directory pointer, not an
  // eligibility or current-intake claim.
  if (input.location === 'all') {
    const firstPerCounty = [];
    for (const county of ['hillsborough', 'pinellas', 'pasco']) {
      const contact = candidates.find(resource => resource.geography.includes(county) &&
        !firstPerCounty.includes(resource));
      if (contact) firstPerCounty.push(contact);
    }
    return firstPerCounty.slice(0, 3).map(resource => ({ ...resource, verificationStatus: 'needs_recheck' }));
  }
  return candidates.slice(0, 3).map(resource => ({ ...resource, verificationStatus: 'needs_recheck' }));
}

function evictionPriority(value, copy) {
  if (value.noticeStage === 'judgment_or_possession') return copy.judgment;
  if (['court_summons', 'pending_case'].includes(value.noticeStage)) return copy.summons;
  if (['written_notice', 'pay_or_vacate'].includes(value.noticeStage)) return copy.notice;
  if (value.noticeStage === 'informal_warning') return copy.warning;
  return copy.priority;
}

/** Produce concise navigation from reviewed directory data, never from model text. */
export function buildCrisisPlan(input, resources, { now = new Date(), locale = 'en' } = {}) {
  const value = normalizeInput(input);
  if (!value) return null;
  const directory = Array.isArray(resources) ? resources : [];
  const language = locale === 'es' ? 'es' : 'en';
  const copy = COPY[language];
  const situationCopy = copy[value.situation];
  const triage = triageHousingCrisis(value);
  const fresh = selectCrisisResources(value, directory, { now });
  const freshDirect = fresh.filter(resource => isDirectReferral(resource, value.situation));
  const rechecks = recheckFallbacks(value, directory, new Date(now));
  const fallback = value.location === 'all'
    ? rechecks.filter(resource => !['hillsborough', 'pinellas', 'pasco'].some(county =>
      resource.geography.includes(county) && freshDirect.some(current => current.geography.includes(county))))
    : freshDirect.length ? [] : rechecks;
  const matched = [...fresh.filter(resource => resource.id === 'emergency-911'), ...fallback,
    ...fresh.filter(resource => resource.id !== 'emergency-911')].slice(0, 5);
  const hasLocal = matched.some(resource => !resource.geography.includes('national') && !resource.geography.includes('florida'));
  const notes = [copy.common.availability, copy.common.legal];
  if (value.location === 'all') notes.push(copy.common.noLocation);
  else if (!hasLocal) notes.push(copy.common.noLocal);
  if (fallback.length) notes.push(copy.common.staleContact);
  if (matched.some(resource => resource.municipalities?.length && !resource.municipalities.includes(value.location)))
    notes.push(copy.common.limitedArea);
  if (value.situation === 'unsafe_housing' && ['hillsborough', 'pinellas', 'pasco'].includes(value.location))
    notes.push(copy.common.codeArea);
  if (situationCopy.documents.length) notes.push(copy.common.documentsOptional);
  const rmap = value.mentionsRmap && ['eviction', 'rent'].includes(value.situation)
    ? directory.find(resource => resource.id === 'housing-tampa-rmap' && /^https:\/\//.test(resource.sourceUrl ?? '')) : null;
  if (rmap) notes.push(copy.common.rmapConflict);
  const courtStage = ['court_summons', 'pending_case'].includes(value.noticeStage);
  const noticeStage = ['written_notice', 'pay_or_vacate'].includes(value.noticeStage);
  const deadline = value.noticeStage === 'judgment_or_possession' ? copy.common.orderDeadline
    : courtStage ? copy.common.courtDeadline : noticeStage ? copy.common.noticeDeadline : copy.common.noDeadline;
  let immediatePriority = value.situation === 'eviction' ? evictionPriority(value, situationCopy) : situationCopy.priority;
  if (value.physicalDanger || value.seriousHazard) immediatePriority = `${copy.common.immediateDanger} ${immediatePriority}`;
  else if (triage.referralPath === 'shelter_intake' && !['homelessness', 'imminent_homelessness', 'disaster'].includes(value.situation))
    immediatePriority = `${copy.common.unsafeSleep} ${immediatePriority}`;
  return {
    // Canonical selections only. No free text, address, or document content is
    // retained; clients can rebuild the authored copy when language changes.
    input: { ...value },
    situation: value.situation,
    urgency: triage.urgency,
    dangerKind: triage.dangerKind,
    referralPath: triage.referralPath,
    language,
    title: situationCopy.title,
    immediatePriority,
    steps: [...situationCopy.steps],
    resources: matched,
    documents: [...situationCopy.documents],
    deadline,
    humanAssistance: situationCopy.human,
    notes,
    sources: [...new Map([...matched, ...(rmap ? [rmap] : [])].map(resource => [resource.sourceUrl, {
      title: `${resource.organization} — ${resource.program}`,
      url: resource.sourceUrl,
      verifiedAt: resource.verifiedAt,
    }])).values()],
  };
}

/** Small lexical bridge for chat; optional UI intake remains more precise. */
export function inferCrisisInput(question, { jurisdictionId = 'tampa-bay' } = {}) {
  const original = intentText(question);
  if (/\b(?:(?:i am|im|we are|as a) (?:a |the )?landlord|evict (?:my|our|a) tenant|my tenant)\b/.test(original)) return null;
  // A data question does not describe the visitor's current housing need.
  // Keep a direct first-person crisis eligible even if it also asks for data.
  if (/\b(?:eviction|evictions|homelessness|domestic violence) (?:rates?|statistics|data|trends?|counts?|figures?|maps?)\b|\b(?:how many|number of) (?:evictions|homeless people)\b/.test(original) &&
      !/\b(?:i|we) (?:received|got|have|am|are|need|cannot|cant|was served)\b|\bmy (?:landlord|partner|home|apartment)\b/.test(original)) return null;
  const deniesNotice = /\b(?:no|without) (?:an? |any )?(?:written |court )?(?:eviction notice|summons|court papers?)\b|\b(?:do not|dont|did not|didnt|never) (?:have|receive|received|get|got) (?:an? |any )?(?:eviction notice|summons|court papers?)\b/.test(original);
  const text = original
    // Historical events may be useful RAG context, but must not create a
    // present-tense safety plan or emergency instruction.
    .replace(/\b(?:i|we) (?:was|were|had) (?:evicted|an? (?:gas leak|fire|eviction notice|court summons))\b[^.!?]*?\b(?:\d+ years? ago|years? ago|last year|in (?:19|20)\d{2})\b/g, '')
    .replace(/\b(?:no|without) (?:an? |any )?(?:written |court )?(?:eviction notice|summons|court papers?)\b/g, '')
    .replace(/\b(?:do not|dont|did not|didnt|never) (?:have|receive|received|get|got) (?:an? |any )?(?:eviction notice|summons|court papers?)\b/g, '');
  let situation = null;
  if (/\b(?:domestic violence|abusive partner|abuse at home|(?:partner|spouse) (?:is )?(?:hurt\w*|threaten\w*|attack\w*)|violencia domestica|pareja (?:me )?(?:golpea|amenaza))\b/.test(text)) situation = 'domestic_violence';
  else if (/\b(?:hurricane|flood(?:ing|ed)?|disaster|storm|inundacion)\b/.test(text) && /\b(?:displac\w*|evacuat\w*|damage\w*|damaged|no (?:safe )?place|cannot stay|cant stay|can't stay|need (?:a )?shelter)\b/.test(text)) situation = 'disaster';
  else if (/\b(?:currently homeless|homeless now|homeless (?:esta noche|tonight)|sleep(?:ing)? (?:outside|in (?:my |a )?car)|no (?:safe )?place to (?:sleep|stay) tonight|nowhere to sleep tonight|shelter (?:esta noche|tonight)|(?:need|busco|quiero) (?:a |an |un |una )?shelter (?:esta noche|tonight))\b/.test(text)) situation = 'homelessness';
  else if (/\b(?:evict(?:ed|ion|ing)?|summons|citacion|possession order|writ of possession|landlord notice|notice to (?:pay|vacate|quit)|court case (?:about|for) (?:rent|housing)|locked out by (?:my )?landlord)\b/.test(text)) situation = 'eviction';
  else if (/\b(?:lose (?:my |our )?(?:home|housing|place)|nowhere to stay|kicked out|(?:about to|going to|will|soon) (?:be )?homeless)\b/.test(text) && /\b(?:soon|tomorrow|this week|in days|tonight|about to|next week|going to)\b/.test(text)) situation = 'imminent_homelessness';
  else if (/\b(?:homeless|sin techo)\b/.test(text) && !/\b(?:not homeless|never homeless|homelessness (?:data|statistics|rate))\b/.test(text)) situation = 'homelessness';
  else if (/\b(?:utility|utilities|electric|electricity|power|water|gas|luz)\b/.test(text) && /\b(?:shut.?off|disconnect|past.due|overdue|cannot pay|can't pay|cant pay|help|assistance|bill|off|corte|cortar)\b/.test(text)) situation = 'utilities';
  else if (/\b(?:unsafe (?:housing|home|apartment)|housing insegura|uninhabitable|dangerous (?:home|apartment)|severe mold|no (?:heat|water)|gas leak|fire (?:hazard|in (?:my |our )?(?:home|apartment)))\b/.test(text)) situation = 'unsafe_housing';
  else if (/\b(?:cannot pay rent|can't pay rent|cant pay rent|behind on rent|back rent|rent arrears|past.due rent|missed rent|rental assistance|help (?:paying|with) rent)\b/.test(text)) situation = 'rent';
  else if (/\b(?:affordable (?:housing|apartment|rent|rental)|housing affordable|cheaper (?:housing|apartment|place)|housing voucher|section 8|find (?:an? )?apartment)\b/.test(text)) situation = 'affordable_housing';
  if (!situation) return null;
  const location = JURISDICTION_LOCATION[jurisdictionId] ?? 'all';
  const noticeStage = /\b(?:writ of possession|possession order|judgment|final order|orden de posesion|sentencia)\b/.test(text) ? 'judgment_or_possession'
    : /\b(?:summons|citacion|served (?:with )?(?:court )?papers?)\b/.test(text) ? 'court_summons'
    : /\b(?:pending (?:eviction )?case|court case|case filed)\b/.test(text) ? 'pending_case'
    : /\b(?:pay (?:rent )?or vacate|notice to pay|notice to vacate)\b/.test(text) ? 'pay_or_vacate'
    : /\b(?:written notice|aviso escrito|letter from (?:my )?landlord|eviction notice)\b/.test(text) ? 'written_notice'
    : /\b(?:verbal warning|landlord (?:said|told)|informal warning)\b/.test(text) ? 'informal_warning' : deniesNotice ? 'none' : 'unknown';
  const physicalDanger = /\b(?:immediate (?:physical )?danger|someone (?:is )?(?:hurt|threatening|attacking)|(?:partner|spouse|landlord) (?:is )?(?:hurting|threatening|attacking)|threatening (?:to )?(?:hurt|kill)|gas leak|fire (?:in|at) (?:my |our )?(?:home|apartment))\b/.test(text) ||
    (situation === 'domestic_violence' && /\b(?:pareja (?:me )?(?:golpea|pega|ataca|amenaza)|me (?:esta )?(?:golpeando|atacando))\b/.test(text) && /\b(?:now|ahora|en este momento|esta noche)\b/.test(text));
  const noSafePlaceTonight = /\b(?:no (?:safe )?place to (?:sleep|stay) tonight|nowhere to sleep tonight|sleep(?:ing)? outside tonight|homeless (?:esta noche|tonight)|(?:need|busco|quiero) (?:a |an |un |una )?shelter (?:esta noche|tonight))\b/.test(text);
  const timeframe = /\b(?:tonight|this evening|right now|esta noche|hoy por la noche)\b/.test(text) ||
      (['domestic_violence', 'homelessness', 'imminent_homelessness', 'disaster'].includes(situation) && /\b(?:now|ahora)\b/.test(text)) ? 'tonight'
    : /\b(?:tomorrow|this week|in (?:a few |\d+ )?days|next week)\b/.test(text) ? 'days' : 'unknown';
  const safe = /\b(?:i am not safe|im not safe|unsafe tonight|no estoy segur[oa])\b/.test(text) ? 'no' : 'unsure';
  return { situation, location, timeframe, safe, noticeStage, physicalDanger,
    noSafePlaceTonight, courtDeadlineSoon: /\b(?:court|response) deadline (?:soon|tomorrow|today|this week)\b/.test(text),
    shutoffImminent: situation === 'utilities' && /\b(?:shut.?off|disconnect)\b/.test(text) && timeframe !== 'unknown',
    mentionsRmap: /\brmap\b|rental and move.in assistance/.test(text) };
}
