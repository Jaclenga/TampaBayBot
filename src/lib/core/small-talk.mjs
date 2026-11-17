// Exact, whole-message matches only. A greeting followed by a factual question
// must still use ordinary intent routing, evidence retrieval and citation checks.
export function smallTalkReply(question, locale = 'en') {
  const text = String(question ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/^[¡¿]/, '');
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening|hola|buenos dias|buenas tardes|buenas noches|buenas)[!.,?\s]*$/i.test(text))
    return locale === 'es' ? '¡Hola! ¿Qué le gustaría saber sobre Tampa Bay?' : 'Hi! What would you like to find out about Tampa Bay?';
  if (/^(?:thanks|thank you|thanks a lot|thank you very much|gracias|muchas gracias)[!.,\s]*$/i.test(text))
    return locale === 'es' ? 'De nada. Puede hacer otra pregunta cuando quiera.' : 'You’re welcome. Feel free to ask another question.';
  if (/^(?:bye|goodbye|adios|hasta luego)[!.,\s]*$/i.test(text))
    return locale === 'es' ? '¡Hasta luego!' : 'Take care!';
  return null;
}
