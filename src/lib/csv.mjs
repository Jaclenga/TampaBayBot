/** Tokenize CSV without changing field text or applying a caller's header schema. */
export function csvRows(text, { strictQuotes = true, maxRows = Infinity } = {}) {
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  function finishField() { row.push(field); field = ''; afterQuote = false; }
  function finishRow() {
    finishField();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
    if (rows.length > maxRows) throw new Error('CSV exceeds the row limit.');
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!strictQuotes) quoted = !quoted;
      else if (quoted) { quoted = false; afterQuote = true; }
      else if (field === '' && !afterQuote) quoted = true;
      else throw new Error('Malformed CSV quoting.');
    } else if (char === ',' && !quoted) finishField();
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else {
      if (strictQuotes && afterQuote) throw new Error('Malformed CSV quoting.');
      field += char;
    }
  }
  if (quoted) throw new Error(strictQuotes ? 'Unterminated CSV quote.' : 'Unterminated quoted CSV field');
  if (field || row.length || afterQuote) finishRow();
  return rows;
}
