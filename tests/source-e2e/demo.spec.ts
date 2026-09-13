import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /invalid hook call|hydration|useState/i.test(message.text())) errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'Rendering must not silently recover from React runtime errors').toEqual([]);
});
test('fresh source demo supports a keyboard question with cited fictional evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('Fictional demonstration');
  await page.getByLabel('Your city or county', { exact: true }).selectOption('tampa');
  await page.getByLabel('Ask a question or enter an address', { exact: true }).fill('Where can I find rental assistance?');
  await page.getByRole('button', { name: 'Search', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeVisible();
  await expect(page.locator('.citation-link').first()).toBeVisible();
  await page.locator('.citation-link').first().click();
  await expect(page.locator('details[open]').first()).toContainText(/fictional/i);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.TAMPABAYBOT_CAPTURE_DEMO === '1') {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('docs/images', { recursive: true });
    await page.screenshot({ path: 'docs/images/demo.png' });
  }
});
test('source demo works on mobile and marks unevaluated results honestly', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('note')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/evaluation');
  await expect(page.getByText('No evaluation has been run for this installation.', { exact: false })).toBeVisible();
});
test('jurisdiction clarification preserves the original housing topic and reset clears it', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Ask a question or enter an address', { exact: true });
  await input.fill('I need help paying rent');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.status-label')).toHaveText('Choose a city or county');
  await input.fill('Tampa');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.citation-link').first()).toBeVisible();
  await expect(page.locator('.evidence-list')).toContainText('Fictional rental assistance');
  await page.getByRole('button', { name: 'Start a new question', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.locator('.answer-layout')).toHaveCount(0);
});
test('Spanish questions return localized navigation with unchanged source quotations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('#interface-language').selectOption('es');
  await page.getByLabel('Su ciudad o condado', { exact: true }).selectOption('tampa');
  await page.getByLabel('Haga una pregunta o escriba una dirección', { exact: true }).fill('Necesito ayuda para pagar el alquiler');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Respuesta', exact: true })).toBeVisible();
  await expect(page.locator('.evidence-list blockquote').first()).toHaveText('Demo applications are closed. Do not submit personal information or apply for this fictional benefit.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
