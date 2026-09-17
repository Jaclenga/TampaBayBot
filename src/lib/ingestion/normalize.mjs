import { createHash } from 'node:crypto';
import { csvRows } from '../csv.mjs';
import { deriveFacts, startsAtSentenceBoundary } from '../domain/facts.mjs';
import { classifyAnswerSections } from '../domain/answer-policy.mjs';
import { NormalizationBudget, NormalizationLimitError, normalizationLimits, jsonBytes, validateInput, validateNormalized } from './normalization-limits.mjs';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** RFC 4180 CSV; values are retained as strings to avoid changing IDs or dates. */
export function parseCsv(text, { limits } = {}) {
  const budget = new NormalizationBudget(limits);
  validateInput(text, budget.limits);
  // Preserve the ingestion adapter's historical tolerance of embedded quotes.
  let rows;
  try { rows = csvRows(text, { strictQuotes: false, maxRows: budget.limits.maxUnits + 1 }); }
  catch (error) {
    if (error.message === 'CSV exceeds the row limit.') throw new NormalizationLimitError('unit count limit');
    throw error;
  }
  const headers = (rows.shift() ?? []).map(header => header.replace(/^\uFEFF/, ''));
  if (!headers.length || headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('CSV must have unique, nonempty column headers');
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} fields; expected ${headers.length}`);
    // Count repeated header keys before serializing records into evidence text.
    return budget.unit({ record_id: String(index + 2), values: Object.fromEntries(headers.map((h, i) => [h, cells[i]])) });
  });
}

function structuredUnits(data, source, budget) {
  if (data.error) throw new Error(`Source API error: ${String(data.error.message ?? 'unspecified upstream error').slice(0, 200)}`);
  if (data.exceededTransferLimit) throw new Error('ArcGIS response is truncated; use a paginated fetch_url or narrower documented query');
  const records = data.type === 'FeatureCollection' ? data.features : Array.isArray(data.features) ? data.features : Array.isArray(data) ? data : [data];
  if (records.length > budget.limits.maxUnits) throw new NormalizationLimitError('unit count limit');
  return records.map((record, index) => {
    const properties = record.properties ?? record.attributes ?? record;
    jsonBytes(properties, budget.limits.maxNormalizedBytes - budget.bytes, budget.limits);
    return budget.unit({ text: JSON.stringify(properties), record_id: String(properties.OBJECTID ?? properties.objectid ?? properties.id ?? record.id ?? index), layer: source.layer, section: source.layer ? `Layer ${source.layer}` : 'Structured record', geometry: record.geometry });
  });
}

async function normalizeHtml(text, source, budget) {
  const { load } = await import('cheerio');
  const $ = load(text);
  let linkBase = source.canonical_url;
  try { linkBase = new URL($('base[href]').first().attr('href') ?? '', linkBase).href; } catch { /* Invalid page base: retain the canonical URL. */ }
  const updated = clean($('meta[property="article:modified_time"]').attr('content')) || clean($.root().text()).match(/(?:Updated:|Last Modified:)\s*([\d/]+(?:,?\s+\d+:\d+(?::\d+)?\s*[AP]M)?)/i)?.[1] || null;
  // ASP.NET sites wrap all content in a form; remove inputs/search forms, not the content wrapper.
  $('script,style,noscript,nav,footer,aside,form[role="search"],input,textarea,select,svg,iframe,.breadcrumb,.sharethis-wrapper').remove();
  if (source.heading_selector) {
    $(source.heading_selector).each((_, heading) => {
      if (!clean($(heading).text())) return;
      const replacement = $('<h2></h2>').append($(heading).contents());
      if ($(heading).attr('id')) replacement.attr('id', $(heading).attr('id'));
      $(heading).replaceWith(replacement);
    });
  }
  // Some reviewed CMS pages use bare text/inline runs instead of paragraphs.
  // Opt in per source; retain existing block boundaries and source wording.
  if (source.paragraph_container_selector) {
    const containers = $(source.paragraph_container_selector);
    if (!containers.length) throw new Error(`Required paragraph container missing: ${source.paragraph_container_selector}`);
    containers.each((_, container) => {
      let run = [];
      const flush = () => { if (run.length) $(run).wrapAll('<p></p>'); run = []; };
      $(container).contents().each((_, node) => {
        const inline = node.type === 'text' || /^(a|span|strong|em|b|i|u|small|sup|sub)$/.test(node.tagName ?? '');
        if (inline) run.push(node);
        else flush();
      });
      flush();
    });
  }
  $('br').replaceWith(' ');
  $('li').prepend(' ').append(' ');
  const root = $(source.selector ?? 'main').first();
  if (!root.length) throw new Error(`Required HTML selector missing: ${source.selector ?? 'main'}`);
  const units = []; let section = source.title; let anchor;
  root.find('h1,h2,h3,h4,h5,h6,p,li,address,tr').each((_, element) => {
    const el = $(element); const tag = element.tagName;
    // Each outer list item, table row or address owns its descendant text.
    // In particular, nested address blocks must never copy the same text again.
    if (el.parents('li,tr,address').length) return;
    if (/^h[1-6]$/.test(tag)) {
      section = clean(el.text()); anchor = el.attr('id') || undefined;
      // Some official pages put a complete requirement in a heading.
      if (section.length > 30 && /[.!]$/.test(section)) units.push(budget.unit({ text: section, section, anchor }));
      return;
    }
    // Tables stay row-shaped and list items keep nested lists as a single block.
    const block = tag === 'tr' ? el.children('th,td').map((_, cell) => clean($(cell).text())).get().join(' | ') : clean(el.text());
    if (block.length > 12 && !/^Updated:/.test(block)) units.push(budget.unit({ text: block, section, anchor }));
  });
  const links = [];
  root.find('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    let url;
    try { url = new URL(href, linkBase).href; } catch { return; }
    const label = clean($(element).text());
    if (label && /^https?:/.test(url)) links.push(budget.link({ label, url }));
  });
  if (!units.length) throw new Error('HTML normalization produced no evidence blocks');
  return { units, links, source_updated_date: updated };
}

async function normalizePdf(bytes, budget) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    const units = [];
    for (const page of result.pages) for (const part of page.text.split(/\n\s*\n/)) {
      const unit = { text: clean(part), page: page.num, section: `PDF page ${page.num}` };
      if (unit.text.length > 12) units.push(budget.unit(unit));
    }
    if (!units.length) throw new Error('PDF contains no extractable text; OCR and visual verification required');
    return { units, links: [] };
  } finally { await parser.destroy(); }
}

function csvUnits(text, budget) {
  return parseCsv(text, { limits: budget.limits }).map(row => {
    jsonBytes(row.values, budget.limits.maxNormalizedBytes - budget.bytes, budget.limits);
    return budget.unit({ text: JSON.stringify(row.values), record_id: row.record_id, section: `CSV row ${row.record_id}` });
  });
}

/** Every format passes the same input and complete-output validation. */
export async function normalize(bytes, source, { limits } = {}) {
  const budget = new NormalizationBudget(limits);
  validateInput(bytes, budget.limits);
  let result;
  switch (source.source_type) {
    case 'html':
      result = await normalizeHtml(bytes.toString('utf8'), source, budget);
      break;
    case 'pdf':
      result = await normalizePdf(bytes, budget);
      break;
    case 'csv':
      result = { units: csvUnits(bytes.toString('utf8'), budget), links: [] };
      break;
    case 'json':
    case 'arcgis':
    case 'geojson':
      result = { units: structuredUnits(JSON.parse(bytes.toString('utf8')), source, budget), links: [] };
      break;
    default: throw new Error(`Unsupported source_type: ${source.source_type}`);
  }
  return validateNormalized(result, { limits: budget.limits });
}

/** Only whitespace is normalized. Chunk strings remain exact substrings of normalized units. */
export function chunkUnits(normalized, source, retrievedAt, rawHash, { limits: overrides } = {}) {
  const limits = normalizationLimits(overrides);
  validateNormalized(normalized, { limits });
  const chunks = [];
  let outputBytes = 2;
  normalized.units.forEach((unit, unitIndex) => {
    // Keep page / row / section boundaries. Long blocks split at a word boundary.
    let offset = 0;
    while (offset < unit.text.length) {
      let end = Math.min(offset + 1400, unit.text.length);
      if (end < unit.text.length) { const space = unit.text.lastIndexOf(' ', end); if (space > offset + 400) end = space; }
      const text = unit.text.slice(offset, end).trim();
      if (text.length > 12) {
        if (chunks.length >= limits.maxChunks) throw new NormalizationLimitError('chunk count limit');
        const chunk = {
        id: `${source.source_id}-${sha256(`${unitIndex}:${offset}:${text}`).slice(0, 14)}`,
        source_id: source.source_id, title: source.title, text,
        section: unit.section, ...(unit.page ? { page: unit.page } : {}),
        ...(unit.record_id !== undefined ? { record_id: unit.record_id } : {}), ...(unit.layer !== undefined ? { layer: unit.layer } : {}),
        retrieved_at: retrievedAt, content_hash: sha256(text), raw_content_hash: rawHash,
        url: source.canonical_url + (unit.page ? `#page=${unit.page}` : unit.anchor ? `#${unit.anchor}` : ''),
        locator: { unit_index: unitIndex, text_start: offset, text_end: end,
          starts_at_sentence_boundary: offset === 0 || startsAtSentenceBoundary(unit.text.slice(0, offset), text) },
        };
        // Reserve repeated section/record/source metadata before any fact work.
        outputBytes += jsonBytes(chunk, limits.maxChunkBytes - outputBytes, limits) + (chunks.length ? 1 : 0);
        if (outputBytes > limits.maxChunkBytes) throw new NormalizationLimitError('chunk byte limit');
        chunks.push(chunk);
      }
      offset = end; while (unit.text[offset] === ' ') offset++;
    }
  });
  // Each fact extractor receives at most one 1,400-character chunk. Account for
  // annotations incrementally, before admitting them to the returned corpus.
  for (const chunk of chunks) {
    const annotations = { facts: deriveFacts(chunk, source), answer_sections: classifyAnswerSections(source, chunk) };
    outputBytes += jsonBytes(annotations, limits.maxChunkBytes - outputBytes + 1, limits) - 1;
    if (outputBytes > limits.maxChunkBytes) throw new NormalizationLimitError('chunk byte limit');
    Object.assign(chunk, annotations);
  }
  return chunks;
}
