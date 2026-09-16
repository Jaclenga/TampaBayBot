import { createHash } from 'node:crypto';
import { csvRows } from '../csv.mjs';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** RFC 4180 CSV; values are retained as strings to avoid changing IDs or dates. */
export function parseCsv(text) {
  // Preserve the ingestion adapter's historical tolerance of embedded quotes.
  const rows = csvRows(text, { strictQuotes: false });
  const headers = (rows.shift() ?? []).map(header => header.replace(/^\uFEFF/, ''));
  if (!headers.length || headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('CSV must have unique, nonempty column headers');
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} fields; expected ${headers.length}`);
    return { record_id: String(index + 2), values: Object.fromEntries(headers.map((h, i) => [h, cells[i]])) };
  });
}

function structuredUnits(data, source) {
  if (data.error) throw new Error(`Source API error: ${data.error.message ?? JSON.stringify(data.error)}`);
  if (data.exceededTransferLimit) throw new Error('ArcGIS response is truncated; use a paginated fetch_url or narrower documented query');
  const records = data.type === 'FeatureCollection' ? data.features : Array.isArray(data.features) ? data.features : Array.isArray(data) ? data : [data];
  return records.map((record, index) => {
    const properties = record.properties ?? record.attributes ?? record;
    return { text: JSON.stringify(properties), record_id: String(properties.OBJECTID ?? properties.objectid ?? properties.id ?? record.id ?? index), layer: source.layer, section: source.layer ? `Layer ${source.layer}` : 'Structured record', geometry: record.geometry };
  });
}

export async function normalize(bytes, source) {
  const text = bytes.toString('utf8');
  if (source.source_type === 'html') {
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
      if (/^h[1-6]$/.test(tag)) {
        section = clean(el.text()); anchor = el.attr('id') || undefined;
        // Some official pages put a complete requirement in a heading.
        if (section.length > 30 && /[.!]$/.test(section)) units.push({ text: section, section, anchor });
        return;
      }
      // Tables stay row-shaped and list items keep nested lists as a single block.
      if (el.parents('li,tr').length) return;
      const block = tag === 'tr' ? el.children('th,td').map((_, cell) => clean($(cell).text())).get().join(' | ') : clean(el.text());
      if (block.length > 12 && !/^Updated:/.test(block)) units.push({ text: block, section, anchor });
    });
    const links = root.find('a[href]').map((_, element) => {
      const href = $(element).attr('href');
      try { return { label: clean($(element).text()), url: new URL(href, linkBase).href }; } catch { return null; }
    }).get().filter(link => link.label && /^https?:/.test(link.url));
    if (!units.length) throw new Error('HTML normalization produced no evidence blocks');
    return { units, links, source_updated_date: updated };
  }
  if (source.source_type === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const result = await parser.getText();
      const units = result.pages.flatMap(page => page.text.split(/\n\s*\n/).map(part => ({ text: clean(part), page: page.num, section: `PDF page ${page.num}` })).filter(unit => unit.text.length > 12));
      if (!units.length) throw new Error('PDF contains no extractable text; OCR and visual verification required');
      return { units, links: [] };
    } finally { await parser.destroy(); }
  }
  if (source.source_type === 'csv') return { units: parseCsv(text).map(row => ({ text: JSON.stringify(row.values), record_id: row.record_id, section: `CSV row ${row.record_id}` })), links: [] };
  if (['json', 'arcgis', 'geojson'].includes(source.source_type)) return { units: structuredUnits(JSON.parse(text), source), links: [] };
  throw new Error(`Unsupported source_type: ${source.source_type}`);
}

/** Only whitespace is normalized. Chunk strings remain exact substrings of normalized units. */
export function chunkUnits(normalized, source, retrievedAt, rawHash) {
  const chunks = [];
  normalized.units.forEach((unit, unitIndex) => {
    // Keep page / row / section boundaries. Long blocks split at a word boundary.
    let offset = 0;
    while (offset < unit.text.length) {
      let end = Math.min(offset + 1400, unit.text.length);
      if (end < unit.text.length) { const space = unit.text.lastIndexOf(' ', end); if (space > offset + 400) end = space; }
      const text = unit.text.slice(offset, end).trim();
      if (text.length > 12) chunks.push({
        id: `${source.source_id}-${sha256(`${unitIndex}:${offset}:${text}`).slice(0, 14)}`,
        source_id: source.source_id, title: source.title, text,
        section: unit.section, ...(unit.page ? { page: unit.page } : {}),
        ...(unit.record_id !== undefined ? { record_id: unit.record_id } : {}), ...(unit.layer !== undefined ? { layer: unit.layer } : {}),
        retrieved_at: retrievedAt, content_hash: sha256(text), raw_content_hash: rawHash,
        url: source.canonical_url + (unit.page ? `#page=${unit.page}` : unit.anchor ? `#${unit.anchor}` : ''),
        locator: { unit_index: unitIndex, text_start: offset, text_end: end },
      });
      offset = end; while (unit.text[offset] === ' ') offset++;
    }
  });
  return chunks;
}
