import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('directory preview opens the dedicated privacy page without the API', async ({ page }) => {
  const apiRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.site-header a[href="/privacy/"]')).toBeVisible();
  await expect(page.locator('.crisis-privacy a[href="/privacy/"]')).toBeVisible();
  await expect(page.locator('.site-footer a[href="/privacy/"]')).toBeVisible();
  await page.locator('.crisis-privacy a[href="/privacy/"]').click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy information' })).toBeVisible();
  const response = await page.reload();
  expect(response?.status()).toBe(200);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(apiRequests).toEqual([]);
});

test('directory preview provides housing help without contacting the API', async ({ page }) => {
  const apiRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('TampaBayBot — Housing assistance directory preview');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Browse Tampa Bay housing assistance contacts and official source links without AI or an account.');
  await expect(page.getByText('Housing assistance directory preview.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Housing help', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Need help right now?' })).toBeVisible();
  await expect(page.locator('#crisis-situation')).toHaveValue('');
  await expect(page.locator('.immediate-help')).toContainText('911');
  await expect(page.locator('.immediate-help')).toContainText('988');
  await expect(page.locator('.immediate-help')).toContainText('Resource information last reviewed');
  await expect(page.locator('.housing-card').first()).toContainText('Resource information last reviewed');
  await expect(page.locator('.housing-card').first()).not.toContainText('Link checked');
  await expect(page.getByRole('link', { name: /Ask TampaBayBot|Ask a question|Explore a place|Explore a property/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
  await expect(page.locator('#property')).toHaveCount(0);

  const problem = page.getByLabel('What do you need help with?');
  const location = page.getByLabel('Where are you?');
  for (const category of ['eviction', 'homelessness', 'legal', 'emergency']) {
    await problem.selectOption(category);
    await expect(page.locator('.housing-card').first()).toBeVisible();
    await expect(page.locator('.housing-card-actions a').first()).toHaveAttribute('href', /^https:\/\//);
  }

  await problem.selectOption('eviction');
  for (const [county, clerk, otherClerk] of [
    ['hillsborough', 'Hillsborough County Clerk', 'Pasco County Clerk'],
    ['pinellas', 'Pinellas County Clerk', 'Hillsborough County Clerk'],
    ['pasco', 'Pasco County Clerk', 'Pinellas County Clerk'],
  ]) {
    await location.selectOption(county);
    await expect(page.locator('.housing-card').filter({ hasText: clerk })).toBeVisible();
    await expect(page.locator('.housing-card').filter({ hasText: otherClerk })).toHaveCount(0);
  }

  await expect(page.getByRole('button', { name: 'Copy details' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print this page' })).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy details' }).first().click();
  await expect(page.locator('.housing-card').first().getByRole('status')).toContainText('copied');
  await page.evaluate(() => { window.print = () => { window.__housingPrintCalled = true; }; });
  await page.getByRole('button', { name: 'Print this page' }).click();
  expect(await page.evaluate(() => window.__housingPrintCalled)).toBe(true);
  await page.locator('#housing-language').selectOption('es');
  await expect(page.locator('.housing-card').first()).toContainText('Información del recurso revisada por última vez');
  expect(apiRequests).toEqual([]);
});

test('mobile visitors can reach emergency contacts before choosing any options', async ({ page }) => {
  const apiRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.hero-button').click();
  await expect(page.getByRole('heading', { name: 'Need help right now?' })).toBeVisible();
  await expect(page.locator('.immediate-help')).toContainText('911');
  await expect(page.locator('#crisis-situation')).toHaveValue('');
  await expect(page.getByLabel('What do you need help with?')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);
});
