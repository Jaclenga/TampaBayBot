import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1280, 375]) {
  test(`chat presents greetings, factual replies, limitations and processing naturally at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    const requests: Record<string, unknown>[] = [];
    let release: (() => void) | undefined;
    const conversation = { version: 1, topic: 'housing', jurisdictionId: 'tampa', housingNeed: 'rent', sourceId: null, awaitingJurisdiction: false, turns: 0 };
    await page.route('**/api/ask', async route => {
      const request = route.request().postDataJSON();
      requests.push(request);
      const greeting = request.question === 'hello';
      const unsupported = request.question === 'Write a song';
      const unavailable = request.question === 'Find an unverified program';
      if (requests.length === 2) await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ json: {
        status: greeting || unsupported ? 'out_of_scope' : unavailable ? 'unavailable_source' : 'answered',
        query: request.question,
        answer: greeting ? 'Formal capabilities text that should not be shown for a greeting.' : unsupported ? 'Please ask about housing, property records, or development in Tampa Bay.' : unavailable ? 'I could not find verified source information for this program. Check with the responsible office.' : 'Contact the responsible housing office. [E1]',
        evidence: unsupported || unavailable ? [] : [{ id: 'E1', source_id: 'housing', chunk_id: 'one', title: 'Official housing information', agency: 'City of Tampa', publisher: 'City of Tampa', language: 'en', quote: 'Contact the responsible housing office.', url: 'https://example.gov/housing', retrieved_at: '2026-11-16', source_date: '2026-11-01', stale: false }],
        warnings: [], nextSteps: [], jurisdictionId: 'tampa', jurisdictionLabel: 'City of Tampa', needsAddress: false,
        conversation: greeting || unsupported ? null : conversation,
        generation: { status: 'used', provider: 'fixture' }, coverage: { statement: 'Source coverage metadata' },
      } });
    });
    await page.goto('/');
    const storageBefore = await page.evaluate(() => ({ ...localStorage }));
    await expect(page.getByRole('group', { name: 'Example questions', exact: true }).getByRole('button')).toHaveCount(4);
    await page.locator('#question').fill('hello');
    await page.locator('#question').press('Enter');
    const first = page.locator('.chat-turn').first();
    await expect(first.locator('.answer-lead')).toHaveText('Hi! What would you like to know about Tampa Bay?');
    expect(requests).toHaveLength(1);
    await expect(first.locator('.citation-link, .evidence-section, .status-label')).toHaveCount(0);
    await expect(first).not.toContainText('Source coverage');
    await expect(first).not.toContainText('language model');
    await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toHaveCount(0);
    await expect(page.locator('#question')).toBeFocused();
    await expect(page.locator('.chat-composer #jurisdiction')).toHaveCount(0);
    const user = (await first.locator('.chat-question').boundingBox())!;
    const assistant = (await first.locator('.assistant-message').boundingBox())!;
    const thread = (await page.locator('.chat-thread').boundingBox())!;
    const composer = (await page.locator('.chat-composer').boundingBox())!;
    expect(thread.width).toBeLessThanOrEqual(820);
    expect(user.x).toBeGreaterThan(assistant.x);
    expect(Math.abs(user.x + user.width - (thread.x + thread.width))).toBeLessThan(2);
    expect(composer.y - (assistant.y + assistant.height)).toBeLessThan(48);
    await page.screenshot({ path: testInfo.outputPath('greeting-chat.png') });

    const reply = page.locator('#question');
    await reply.fill('Where can I find rental assistance in Tampa?');
    await reply.press('Enter');
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(reply).toBeFocused();
    await expect(page.getByRole('button', { name: 'Searching...', exact: true })).toBeDisabled();
    await reply.fill('A draft written while processing');
    release!();
    await expect(page.locator('.chat-turn')).toHaveCount(2);
    await expect(reply).toHaveValue('A draft written while processing');
    await expect(reply).toBeFocused();
    const factual = page.locator('.chat-turn').last();
    await expect(factual.locator('.answer-lead')).toContainText('Contact the responsible housing office.');
    await factual.getByRole('link', { name: 'Read evidence E1' }).click();
    await expect(factual.locator('.evidence-card')).toHaveAttribute('open', '');
    await expect(factual.locator('.evidence-body')).toContainText('2026');
    await expect(factual).toContainText('Tampa');
    await reply.fill('What documents do I need?');
    await reply.press('Enter');
    await expect(page.locator('.chat-turn')).toHaveCount(3);
    expect(requests[2].conversation).toEqual(conversation);
    await reply.fill('Write a song');
    await reply.press('Enter');
    await expect(page.locator('.chat-turn')).toHaveCount(4);
    await expect(page.locator('.chat-turn').last()).not.toContainText('Outside this service');
    await expect(page.locator('.chat-turn').last()).toContainText('Tampa Bay');
    await reply.fill('Find an unverified program');
    await reply.press('Enter');
    await expect(page.locator('.chat-turn')).toHaveCount(5);
    await expect(page.locator('.chat-turn').last()).toContainText('could not find verified source information');
    await expect(page.locator('.chat-turn').last().locator('.citation-link')).toHaveCount(0);
    await reply.fill('Line one\nLine two\nLine three\nLine four\nLine five');
    expect((await reply.boundingBox())!.height).toBeGreaterThan(44);
    expect((await reply.boundingBox())!.height).toBeLessThanOrEqual(160);
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Example questions', exact: true })).toBeVisible();
    await expect(page.locator('#question')).toBeFocused();
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storageBefore);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
