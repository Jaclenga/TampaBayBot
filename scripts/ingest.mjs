import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalize, chunkUnits, sha256 } from '../lib/ingestion/normalize.mjs';

const root = resolve(import.meta.dirname, '..');
const registryPath = resolve(root, 'data/sources.json');
const chunksPath = resolve(root, 'data/chunks.json');
const args = process.argv.slice(2);
const selectedId = args.find(arg => arg.startsWith('--source='))?.slice(9);
const offline = args.includes('--offline');
const checkOnly = args.includes('--check');
const sources = JSON.parse(await readFile(registryPath, 'utf8'));
let oldChunks = []; try { oldChunks = JSON.parse(await readFile(chunksPath, 'utf8')); } catch {}
const nextChunks = new Map(sources.map(source => [source.source_id, oldChunks.filter(chunk => chunk.source_id === source.source_id)]));
const report = { started_at: new Date().toISOString(), mode: checkOnly ? 'check' : offline ? 'offline' : 'fetch', sources: [] };
let failures = 0;

for (const source of sources) {
  if (selectedId && source.source_id !== selectedId) continue;
  if (source.ingestion_method === 'live-query-only') continue;
  const now = new Date().toISOString();
  try {
    if (!/^[a-z0-9-]+$/.test(source.source_id)) throw new Error('Invalid source_id');
    let bytes; let http = {};
    if (offline || checkOnly) {
      if (!source.raw_path) throw new Error('No preserved raw snapshot available');
      const path = resolve(root, source.raw_path);
      if (!path.startsWith(resolve(root, 'data/raw') + '\\') && !path.startsWith(resolve(root, 'data/raw') + '/')) throw new Error('raw_path escapes data/raw');
      bytes = await readFile(path);
    } else {
      const url = new URL(source.fetch_url ?? source.canonical_url);
      if (url.protocol !== 'https:') throw new Error('Source must use HTTPS');
      const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'ParcelPrivateer/0.1 (public-source research; github.com/ParcelPrivateer)', Accept: source.source_type === 'html' ? 'text/html' : '*/*' } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const length = Number(response.headers.get('content-length'));
      if (length > 30 * 1024 * 1024) throw new Error('Source exceeds 30 MiB ingestion limit');
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 30 * 1024 * 1024) throw new Error('Source exceeds 30 MiB ingestion limit');
      http = { response_url: response.url, content_type: response.headers.get('content-type'), etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified') };
    }
    const rawHash = sha256(bytes);
    if ((offline || checkOnly) && source.content_hash && source.content_hash !== rawHash) throw new Error('Raw snapshot hash does not match source registry');
    const normalized = await normalize(bytes, source);
    const retrievedAt = offline || checkOnly ? source.retrieval_date : now;
    const chunks = chunkUnits(normalized, source, retrievedAt, rawHash);
    if (!chunks.length) throw new Error('No evidence chunks extracted');
    if (checkOnly) {
      const stored = nextChunks.get(source.source_id);
      if (JSON.stringify(stored) !== JSON.stringify(chunks)) throw new Error('Saved corpus differs from reproducible normalized raw snapshot');
    } else {
      const extension = source.source_type === 'arcgis' || source.source_type === 'geojson' ? 'json' : source.source_type;
      const rawPath = `data/raw/${source.source_id}/${rawHash}.${extension}`;
      await mkdir(resolve(root, `data/raw/${source.source_id}`), { recursive: true });
      await mkdir(resolve(root, 'data/normalized'), { recursive: true });
      await writeFile(resolve(root, rawPath), bytes);
      await writeFile(resolve(root, `data/normalized/${source.source_id}.json`), JSON.stringify({ source_id: source.source_id, retrieved_at: retrievedAt, raw_content_hash: rawHash, ...normalized }, null, 2) + '\n');
      const normalizedHash = sha256(JSON.stringify(normalized.units));
      const changed = source.normalized_content_hash !== undefined && source.normalized_content_hash !== normalizedHash;
      Object.assign(source, { retrieval_date: retrievedAt, source_updated_date: normalized.source_updated_date ?? source.source_updated_date ?? null, content_hash: rawHash, normalized_content_hash: normalizedHash, raw_path: rawPath, status: 'available', last_attempt: offline ? source.last_attempt : now, last_error: null, ...http });
      if (changed) source.content_changed_at = now;
      nextChunks.set(source.source_id, chunks);
    }
    const ageDays = (Date.now() - Date.parse(source.retrieval_date)) / 86400000;
    report.sources.push({ source_id: source.source_id, status: 'ok', chunks: chunks.length, bytes: bytes.length, content_hash: rawHash, stale: ageDays > source.refresh_days });
    console.log(`${source.source_id}: ${chunks.length} chunks, ${bytes.length} bytes`);
  } catch (error) {
    failures++;
    const errorMessage = error.cause?.code ? `${error.message} (${error.cause.code})` : error.message;
    report.sources.push({ source_id: source.source_id, status: 'unavailable', error: errorMessage, retained_chunks: nextChunks.get(source.source_id).length });
    if (!checkOnly) Object.assign(source, { status: 'unavailable', last_attempt: now, last_error: errorMessage });
    console.error(`${source.source_id}: ${errorMessage}; previous evidence retained with original retrieval date`);
  }
}
if (selectedId && !sources.some(source => source.source_id === selectedId)) throw new Error(`Unknown source: ${selectedId}`);
if (!checkOnly) {
  await writeFile(registryPath, JSON.stringify(sources, null, 2) + '\n');
  await writeFile(chunksPath, JSON.stringify([...nextChunks.values()].flat(), null, 2) + '\n');
}
report.completed_at = new Date().toISOString();
await mkdir(resolve(root, 'data'), { recursive: true });
await writeFile(resolve(root, checkOnly ? 'data/verification-report.json' : 'data/ingestion-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.sources.length - failures}/${report.sources.length} sources ${checkOnly ? 'verified' : 'processed'}`);
if (failures) process.exitCode = 1;
