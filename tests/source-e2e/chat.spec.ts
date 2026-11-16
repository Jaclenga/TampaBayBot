import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1280, 375, 320]) {
  test(`follow-ups stay in reach and preserve context, history and citations at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    const requests: Record<string, unknown>[] = [];
    const conversation = { version: 1, topic: 'housing', jurisdictionId: 'tampa', housingNeed: 'rental_assistance' };
    let failNext = false;
    await page.route('**/api/ask', route => {
      const request = route.request().postDataJSON();
      requests.push(request);
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { code: 'service_unavailable' } });
      }
      return route.fulfill({ json: {
        status: 'answered', category: 'housing', query: request.question,
        answer: `${'Check the official program for current details. '.repeat(90)} [E1]`,
        evidence: [{ id: 'E1', source_id: 'program', chunk_id: 'one', title: 'Program notice', agency: 'City of Tampa', language: 'en', quote: 'Check the official program for current details.', url: 'https://example.gov/program', retrieved_at: '2026-11-16', stale: false }],
        warnings: [], nextSteps: [], jurisdictionId: 'tampa', needsAddress: false,
        conversation, conversationUsed: requests.length > 1,
      } });
    });
    await page.goto('/');
    const initial = page.locator('#question');
    await initial.fill('Where can I find rental assistance in Tampa?');
    await initial.press('Enter');
    await expect(page.locator('.answer-layout')).toHaveCount(1);
    const reply = page.getByRole('textbox', { name: 'Ask a follow-up question', exact: true });
    await expect(reply).toHaveValue('');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await reply.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await reply.fill('What documents do I need?');
    await reply.press('Shift+Enter');
    await expect(reply).toHaveValue('What documents do I need?\n');
    expect(requests).toHaveLength(1);
    failNext = true;
    await reply.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(reply).toHaveValue('What documents do I need?\n');
    await expect(page.locator('.answer-layout')).toHaveCount(1);
    await reply.press('Enter');
    await expect(page.locator('.answer-layout')).toHaveCount(2);
    await expect(reply).toHaveValue('');
    expect(requests[2].conversation).toEqual(conversation);
    await page.locator('#interface-language').selectOption('es');
    await expect(page.getByRole('textbox', { name: 'Haga una pregunta de seguimiento', exact: true })).toHaveValue('');
    await expect(page.locator('.answer-layout')).toHaveCount(2);
    await page.locator('#interface-language').selectOption('en');
    await expect(page.locator('.chat-question').first()).toContainText('Where can I find rental assistance in Tampa?');
    await expect(page.locator('.chat-question').last()).toContainText('What documents do I need?');
    await page.locator('.answer-layout').first().getByRole('link', { name: 'Read evidence E1' }).click();
    await expect(page.locator('#turn-0-evidence-E1')).toHaveAttribute('open', '');
    await expect(page.locator('#turn-0-evidence-E1 summary')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('chat-followup.png') });
    expect(await page.locator('[id]').evaluateAll(nodes => {
      const ids = nodes.map(node => node.id);
      return ids.length === new Set(ids).size;
    })).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await expect(page.locator('.chat-composer')).toHaveCount(0);
    await expect(page.locator('.answer-layout')).toHaveCount(0);
    await expect(initial).toBeFocused();
    await initial.fill('How do I find a building permit?');
    await initial.press('Enter');
    await expect(page.locator('.answer-layout')).toHaveCount(1);
    expect(requests.at(-1)).not.toHaveProperty('conversation');
  });
}
