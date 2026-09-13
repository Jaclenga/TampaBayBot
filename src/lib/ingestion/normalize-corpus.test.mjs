import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256 } from './normalize.mjs';

test('every shipped evidence chunk resolves to a registry source and its verified raw snapshot', async () => {
  const registry = JSON.parse(await readFile(new URL('../../../data/sources.json', import.meta.url), 'utf8'));
  const chunks = JSON.parse(await readFile(new URL('../../../data/chunks.json', import.meta.url), 'utf8'));
  const hashes = new Map();
  for (const source of registry.filter(source => source.raw_path)) {
    const bytes = await readFile(new URL(`../../../${source.raw_path}`, import.meta.url));
    hashes.set(source.source_id, sha256(bytes));
    assert.equal(hashes.get(source.source_id), source.content_hash);
  }
  for (const chunk of chunks) {
    assert.ok(registry.some(source => source.source_id === chunk.source_id));
    assert.equal(chunk.content_hash, sha256(chunk.text));
    assert.equal(chunk.raw_content_hash, hashes.get(chunk.source_id));
  }
});
