import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('privacy page loads directly and explains the separate preview data flows', async ({ page }) => {
  const apiRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  const response = await page.goto('/privacy/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /privacy/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /TampaBayBot home/i })).toHaveAttribute('href', '/');
  await expect(page.getByRole('main')).toContainText(/housing guide/i);
  await expect(page.getByRole('main')).toContainText(/question/i);
  await expect(page.getByRole('main')).toContainText(/address/i);
  await expect(page.getByRole('main')).toContainText(/model provider/i);
  await expect(page.getByRole('main')).toContainText(/question is not automatically redacted/i);
  await expect(page.getByRole('main')).toContainText(/hosted question and property tools use the backend/i);
  await expect(page.getByRole('main')).toContainText(/logs/i);
  await expect(page.getByRole('main')).toContainText(/preview/i);
  expect(apiRequests).toEqual([]);
});

test('privacy links are available beside the relevant inputs and in site navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.site-header a[href="/privacy/"]')).toBeVisible();
  await expect(page.locator('.chat-panel a[href="/privacy/"]')).toBeVisible();
  await expect(page.locator('.chat-panel #question-hint')).toContainText(/question goes to the hosted backend/i);
  await expect(page.locator('.chat-panel #question-hint')).toContainText(/model service may receive your question/i);
  await expect(page.locator('.crisis-privacy a[href="/privacy/"]')).toBeVisible();
  await expect(page.locator('.crisis-privacy')).toContainText(/guide does not send selections to the API/i);
  await expect(page.locator('.address-form a[href="/privacy/"]')).toBeVisible();
  await expect(page.locator('.site-footer a[href="/privacy/"]')).toBeVisible();

  await page.locator('.chat-panel a[href="/privacy/"]').click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /privacy/i })).toBeVisible();
});

test('privacy page remains readable at narrow widths and passes automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { level: 1, name: /privacy/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
