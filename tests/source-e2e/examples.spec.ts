import { test, expect } from '@playwright/test';

const examples = [
  ['Find rental assistance', 'Where can I find rental assistance in Tampa?'],
  ['Look up building permits', 'Where can I check building permits for a property in Clearwater?'],
  ['Check property zoning', 'Where can I find zoning information for an address in Tampa?'],
  ['Explore local development', 'How can I find development projects near an address in Tampa?'],
];

test('the composer keeps focus after the pending history reflows', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  let respond: (() => void) | undefined;
  await page.route('**/api/ask', async route => {
    await new Promise<void>(resolve => { respond = resolve; });
    await route.fulfill({ json: {
      status: 'answered', query: route.request().postDataJSON().question,
      answer: 'Check the official source for current information.',
      evidence: [], warnings: [], nextSteps: [], needsAddress: false,
    } });
  });
  await page.goto('/');
  await page.locator('#question').fill('I need help finding housing resources in Tampa. '.repeat(18));
  await page.locator('#question').press('Enter');
  await expect(page.locator('.chat-pending')).toBeVisible();
  await expect.poll(() => Boolean(respond)).toBe(true);
  const history = page.getByRole('region', { name: 'Conversation', exact: true });
  await history.evaluate(element => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  expect(await history.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(80);
  respond!();
  await expect(page.locator('.answer-layout .assistant-message').last()).toBeVisible();
  await expect(page.locator('#question')).toBeFocused();
});

for (const width of [1280, 375]) {
  test(`static example rows submit their exact questions and reset at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    const questions: string[] = [];
    let respond: (() => void) | undefined;
    await page.route('**/api/ask', async route => {
      const question = route.request().postDataJSON().question;
      questions.push(question);
      await new Promise<void>(resolve => { respond = resolve; });
      await route.fulfill({ json: {
        status: 'answered', category: 'housing', query: question,
        answer: 'Check the official source for current information.',
        evidence: [], warnings: [], nextSteps: [], needsAddress: false,
      } });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What would you like to find out?', exact: true })).toBeVisible();
    const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    const before = await storage();
    const group = page.getByRole('group', { name: 'Example questions', exact: true });
    await expect(group.getByRole('button')).toHaveCount(4);
    await expect(group.getByRole('button').first()).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('empty-chat.png'), fullPage: true });
    for (const [index, [title, question]] of examples.entries()) {
      const button = group.getByRole('button', { name: `${title} ${question}`, exact: true });
      await expect(button.locator('.example-title')).toHaveText(title);
      await expect(button.locator('.example-question')).toHaveText(question);
      await button.click();
      await expect.poll(() => questions.length).toBe(index + 1);
      await expect(group).toHaveCount(0);
      await expect(page.locator('.chat-pending')).toContainText(question);
      expect(questions[index]).toBe(question);
      respond!();
      await expect(page.locator('.answer-layout')).toHaveCount(1);
      await expect(page.locator('.chat-pending')).toHaveCount(0);
      await page.getByRole('button', { name: 'New conversation', exact: true }).click();
      await expect(group).toBeVisible();
      await expect(group.getByRole('button')).toHaveCount(4);
    }
    expect(await storage()).toEqual(before);
  });

  test(`history scrolls independently and an arriving reply preserves reading position at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    let requests = 0;
    let respond: (() => void) | undefined;
    await page.route('**/api/ask', async route => {
      requests++;
      if (requests === 2) await new Promise<void>(resolve => { respond = resolve; });
      await route.fulfill({ json: {
        status: 'answered', category: 'housing', query: route.request().postDataJSON().question,
        answer: 'Check the official program for current details. '.repeat(120),
        evidence: [], warnings: [], nextSteps: [], needsAddress: false,
      } });
    });
    await page.goto('/');
    await page.locator('#question').fill('Where can I find rental assistance in Tampa?');
    await page.locator('#question').press('Enter');
    await expect(page.locator('.answer-layout')).toHaveCount(1);
    const history = page.getByRole('region', { name: 'Conversation', exact: true });
    await history.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => history.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    const bodyScroll = await page.evaluate(() => window.scrollY);
    await page.locator('#question').fill('What documents do I need?');
    await page.locator('#question').press('Enter');
    await expect.poll(() => requests).toBe(2);
    await history.evaluate(element => { element.scrollTop = 80; element.dispatchEvent(new Event('scroll')); });
    respond!();
    await expect(page.locator('.answer-layout')).toHaveCount(2);
    await expect.poll(() => history.evaluate(element => element.scrollTop)).toBe(80);
    expect(await page.evaluate(() => window.scrollY)).toBe(bodyScroll);
    const historyBox = (await history.boundingBox())!;
    const composerBox = (await page.locator('.chat-composer').boundingBox())!;
    expect(historyBox.y + historyBox.height).toBeLessThanOrEqual(composerBox.y + 1);
    await expect(page.locator('#question')).toBeFocused();
    await page.setViewportSize({ width, height: 520 });
    await expect.poll(async () => {
      const box = (await page.locator('#question').boundingBox())!;
      return box.y >= 0 && box.y + box.height <= 520;
    }).toBe(true);
  });
}
