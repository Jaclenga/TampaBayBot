import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

test('measure typing work with a long conversation without recording its contents', async ({ page }) => {
  await page.route('**/api/ask', route => route.fulfill({ json: {
    category: 'housing', status: 'answered', query: '',
    answer: 'Fictional demonstration evidence for a performance fixture. [E1]',
    evidence: [{ id: 'E1', source_id: 'fixture', chunk_id: 'fixture-1', title: 'Fictional source', agency: 'Demo',
      quote: 'Fictional demonstration evidence for a performance fixture.', url: 'https://example.com/', language: 'en',
      source_date: '2026-11-16', retrieved_at: '2026-11-16', previewStatus: 'not_permitted', stale: false }],
    meaning: null, nextSteps: [], warnings: [], needsAddress: false, needsJurisdiction: false, jurisdictionId: 'tampa', jurisdictionLabel: 'City of Tampa',
  } }));
  await page.goto('/');
  const input = page.locator('#question');
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const metric = async () => {
    const { metrics } = await session.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((item: {name: string; value: number}) => [item.name, item.value]));
  };
  for (let turn = 0; turn < 30; turn++) {
    await input.fill('Where can I find housing help?');
    await input.press('Enter');
    await expect(page.locator('.chat-turn')).toHaveCount(turn+1);
  }
  const measurements: {wallMs: number; scriptMs: number; layoutMs: number}[] = [];
  for (let i = 0; i < 30; i++) {
    const before = await metric();
    const began = performance.now();
    await input.fill(`Draft ${i}`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await metric();
    measurements.push({ wallMs: performance.now()-began, scriptMs: (after.ScriptDuration-before.ScriptDuration)*1000,
      layoutMs: (after.LayoutDuration-before.LayoutDuration)*1000 });
  }
  expect(await input.inputValue()).toBe('Draft 29');
  const percentile = (key: 'wallMs'|'scriptMs'|'layoutMs', q: number) => measurements.map(row => row[key]).sort((a,b) => a-b)[Math.ceil(measurements.length*q)-1];
  const output = process.env.PERF_OUTPUT || 'work/performance/frontend.json';
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ mode: 'Chromium CDP; isolated development demo; 30 turns; mocked answers; no throttling',
    samples: 30, metrics: Object.fromEntries((['wallMs','scriptMs','layoutMs'] as const).map(key => [key, {p50:percentile(key,.5), p95:percentile(key,.95)}])) }, null, 2));
});
