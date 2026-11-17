// Exact, whole-message matches only. A greeting followed by a factual question
// must still use ordinary intent routing, evidence retrieval and citation checks.
import { JURISDICTIONS } from '../coverage.mjs';
import { jurisdictionLabel } from '../i18n/public-text.mjs';

export function smallTalkReply(question, locale = 'en', jurisdictionId = 'tampa-bay', continuing = false) {
  const text = String(question ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/^[¡¿]/, '');
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening|hola|buenos dias|buenas tardes|buenas noches|buenas)[!.,?\s]*$/i.test(text)) {
    const area = JURISDICTIONS.find(area => area.id === jurisdictionId);
    const label = area ? jurisdictionLabel(area.label, locale)
      : locale === 'es' ? 'información local sobre vivienda o propiedades' : 'local housing or property information';
    return locale === 'es'
      ? continuing ? `¡Hola de nuevo! ¿Qué más le gustaría saber sobre ${label}?` : `¡Hola! ¿Qué le gustaría saber sobre ${label}?`
      : continuing ? `Hi again! What else would you like to know about ${label}?` : `Hi! What would you like to know about ${label}?`;
  }
  if (/^(?:thanks|thank you|thanks a lot|thank you very much|gracias|muchas gracias)[!.,\s]*$/i.test(text))
    return locale === 'es' ? 'De nada. Puede hacer otra pregunta cuando quiera.' : 'You’re welcome. Feel free to ask another question.';
  if (/^(?:bye|goodbye|adios|hasta luego)[!.,\s]*$/i.test(text))
    return locale === 'es' ? '¡Hasta luego!' : 'Take care!';
  return null;
}
