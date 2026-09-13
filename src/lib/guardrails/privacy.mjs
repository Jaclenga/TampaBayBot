// Narrow input screening, not a claim of complete PII detection or redaction.
// Names, addresses, income, disability, eviction and immigration questions remain usable.
export function containsSensitiveIdentifier(text) {
  if (typeof text !== "string") return false;
  text = text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
  // Match common Spanish labels without altering the value being screened.
  text = text.replace(/n[uú]mero (?:de |del )?seguro social/gi, 'social security number')
    .replace(/n[uú]mero de cuenta(?: bancaria)?/gi, 'bank account number')
    .replace(/n[uú]mero de ruta(?: bancaria)?/gi, 'routing number')
    .replace(/(?:clave de api|clave de acceso)/gi, 'api key')
    .replace(/contrase[nñ]a/gi, 'password');
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return true;
  if (
    /\b(?:ssn|social security(?: number)?|bank account(?: number)?|routing number|account number)\s*(?:is\s*|[:#=]\s*)?\d[\d -]{5,24}\b/i.test(
      text,
    )
  )
    return true;
  if (
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b|\bAKIA[A-Z0-9]{16}\b|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{24,}/i.test(
      text,
    )
  )
    return true;
  if (
    /\b(?:api[_ -]?key|access[_ -]?token|password)\s*[:=]\s*['"]?[A-Za-z0-9_+/.~=-]{12,}/i.test(
      text,
    )
  )
    return true;
  for (const match of text.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (
      !/^(?:4\d{12}(?:\d{3})?(?:\d{3})?|5[1-5]\d{14}|2[2-7]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12,15})$/.test(
        digits,
      )
    )
      continue;
    if (/^(\d)\1+$/.test(digits)) continue;
    let sum = 0;
    for (let i = digits.length - 1, position = 0; i >= 0; i--, position++) {
      let digit = Number(digits[i]);
      if (position % 2) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}
