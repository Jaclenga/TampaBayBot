import { test, expect } from '@playwright/test';

for (const width of [1440, 1280, 768, 390, 320]) {
  test(`conversation owns scrolling and preserves reading position at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/ask', route => route.fulfill({ json: {
      status: 'answered', query: route.request().postDataJSON().question,
      answer: 'Confirm deadlines and availability with the responsible office.\n'.repeat(80) + '[E1]',
      evidence: [{ id: 'E1', source_id: 'office', chunk_id: 'one', title: 'Official guidance', agency: 'City of Tampa', language: 'en', quote: 'Confirm current requirements. '.repeat(100), url: 'https://example.gov/housing', retrieved_at: '2026-11-16', stale: false }],
      warnings: ['Eligibility and funding are not guaranteed.'], nextSteps: [], needsAddress: false,
    } }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('empty.png') });
    await page.locator('#question').fill('Where can I get housing help?');
    await page.locator('#question').press('Enter');
    await expect(page.locator('.chat-turn')).toHaveCount(1);
    const region = page.locator('.chat-history');
    await expect.poll(() => region.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
    const composer = (await page.locator('.chat-composer').boundingBox())!;
    const history = (await region.boundingBox())!;
    expect(history.y + history.height).toBeLessThanOrEqual(composer.y + 1);
    expect(composer.y + composer.height).toBeLessThanOrEqual(901);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    await region.evaluate(el => { el.scrollTop = 100; });
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
    const before = await region.evaluate(el => el.scrollTop);
    // Expansion below the reader must not move their reading position.
    await page.locator('.evidence-card').evaluate(el => { (el as HTMLDetailsElement).open = true; });
    await expect.poll(() => region.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0);
    await page.locator('#jurisdiction').selectOption('pinellas-county');
    await expect(page.locator('.chat-turn')).toHaveCount(1);
    await expect(page.locator('#jurisdiction')).toHaveValue('pinellas-county');
    await page.getByRole('button', { name: 'Jump to latest' }).click();
    await expect.poll(() => region.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath('long-conversation.png') });
    // Approximate a mobile keyboard reducing the available viewport.
    await page.setViewportSize({ width, height: 500 });
    await expect(page.locator('#question')).toBeVisible();
    await expect.poll(async () => {
      const resized = (await page.locator('.chat-composer').boundingBox())!;
      return resized.y + resized.height;
    }).toBeLessThanOrEqual(501);
  });
}

test('long eviction guidance stays readable above the composer', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#jurisdiction').selectOption('tampa');
  await page.locator('#question').fill('I received an eviction notice. What should I do?');
  await page.locator('#question').press('Enter');
  await expect(page.locator('.crisis-plan')).toBeVisible();
  await page.locator('.chat-history').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('eviction-start.png') });
  await page.locator('.chat-history').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const thread = (await page.locator('.chat-thread').boundingBox())!;
  const composer = (await page.locator('.chat-composer').boundingBox())!;
  expect(thread.y + thread.height).toBeLessThanOrEqual(composer.y + 1);
  await page.screenshot({ path: testInfo.outputPath('eviction-end.png') });
});

