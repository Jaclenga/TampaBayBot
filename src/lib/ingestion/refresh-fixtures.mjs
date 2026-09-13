import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { digest, json, makeCorpus } from './generation.mjs';
import { normalize, chunkUnits } from './normalize.mjs';

export async function refreshFixture(t) {
  const work = resolve('work'); await mkdir(work, { recursive: true });
  const root = await mkdtemp(join(work, 'source-refresh-test-'));
  t.after(async () => { assert.ok(root.startsWith(work + sep)); await rm(root, { recursive: true, force: true }); });
  const bytes = Buffer.from('<main><h1>Fixture program</h1><p>Original synthetic guidance for a bounded test.</p></main>');
  const source = { source_id: 'fixture', title: 'Synthetic fixture', source_type: 'html', canonical_url: 'https://example.gov/source',
    fetch_url: 'https://example.gov/source', selector: 'main', ingestion_method: 'html', status: 'available', refresh_days: 7,
    retrieval_date: '2026-01-01T00:00:00Z', content_hash: digest(bytes), raw_path: `data/raw/fixture/${digest(bytes)}.html` };
  const normalized = await normalize(bytes, source); source.normalized_content_hash = digest(JSON.stringify(normalized.units));
  const corpus = makeCorpus([source], chunkUnits(normalized, source, source.retrieval_date, source.content_hash));
  await mkdir(join(root, 'data'), { recursive: true });
  for (const [name, value] of [['data/sources.json', json(corpus.sources)], ['data/chunks.json', json(corpus.chunks)], ['data/corpus.json', json(corpus)], [source.raw_path, bytes]]) {
    const filename = join(root, name); await mkdir(dirname(filename), { recursive: true }); await writeFile(filename, value);
  }
  return { root, corpus, source, bytes };
}
