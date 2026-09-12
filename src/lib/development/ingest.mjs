// Standalone archival CLI. This Node-only file is never imported by the application runtime.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import config from '../../../data/development-config.json' with { type: 'json' };
import { fetchBoundedText } from '../geospatial/remote.mjs';
import { normalizeDevelopmentCsv } from './index.mjs';

const directory = resolve('data/raw/development', config.commit);
const response = await fetchBoundedText(config.csv_url, { timeoutMs: config.timeout_ms, maxBytes: config.max_response_bytes });
const sha256 = createHash('sha256').update(response.text, 'utf8').digest('hex');
if (sha256 !== config.sha256) throw new Error('Snapshot hash differs from the reviewed configuration; update and review the source before ingestion.');
const normalized = normalizeDevelopmentCsv(response.text);
const metadata = {
  source_id: config.source_id,
  canonical_url: config.repository_url,
  fetched_url: config.csv_url,
  commit: config.commit,
  source_snapshot_date: config.source_snapshot_date,
  retrieval_date: response.retrievedAt,
  sha256,
  utf8_bytes: Buffer.byteLength(response.text, 'utf8'),
  input_rows: normalized.inputRows,
  searchable_rows: normalized.records.length,
  excluded_rows: normalized.excludedRows,
  terms: `${config.repository_url}/blob/${config.commit}/DATA_LICENSE.md`,
};
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'tampa_development_activity.csv'), response.text, 'utf8');
await writeFile(resolve(directory, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', 'utf8');
await writeFile(resolve(directory, 'normalized.json'), JSON.stringify(normalized, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ directory, ...metadata }, null, 2));
