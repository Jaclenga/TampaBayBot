import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequest } from '../functions/[[path]].js';
import { verifyPublicAssets } from '../scripts/deploy-preserving-worker.mjs';

test('chat assets follow the Worker while directory assets fall back to Pages', async () => {
  const request = new Request('https://example.com/assets/chat.css');
  let fallbacks = 0;
  const next = () => { fallbacks++; return new Response('directory'); };
  const context = {request, next, env:{BACKEND:{fetch:async () => new Response('worker')}}};
  assert.equal(await (await onRequest(context)).text(), 'worker');
  assert.equal(fallbacks, 0);
  context.env.BACKEND.fetch = async () => new Response('', {status:404});
  assert.equal(await (await onRequest(context)).text(), 'directory');
  context.env.BACKEND.fetch = async () => {throw new Error('offline');};
  assert.equal(await (await onRequest(context)).text(), 'directory');
  const packaging = await readFile(new URL('../scripts/prepare-classic-pages.mjs', import.meta.url), 'utf8');
  assert.ok(!packaging.includes("exclude: ['/assets/*'"));
});

test('public deployment check rejects missing or HTML fallback assets', async () => {
  const html = '<link href="/assets/chat.css"><script src="/assets/chat.js"></script>';
  for (const broken of [404,200]) {
    await assert.rejects(verifyPublicAssets('https://example.com/', async url =>
      String(url).endsWith('/') ? new Response(html) : new Response('fallback',{status:broken,headers:{'content-type':'text/html'}})), /asset unavailable/);
  }
  const result = await verifyPublicAssets('https://example.com/', async url => {
    const path = String(url);
    return path.endsWith('/') ? new Response(html) : new Response('asset',{headers:{'content-type':path.endsWith('.css')?'text/css':'application/javascript'}});
  });
  assert.equal(result.assets, 2);
});
