import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { buildCrisisPlan } from '../../src/lib/housing/crisis.mjs';

const staticResources = JSON.parse(readFileSync(new URL('../src/housing-resources.json', import.meta.url), 'utf8')).resources;

test('essential directory works with every API route disabled', async ({ page }) => {
  let apiRequests = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests++; });
  await page.goto('/');
  await expect(page.getByText('Service unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Housing help', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Need help right now?' })).toBeVisible();
  await expect(page.locator('.immediate-help')).toContainText('911');
  const initialApiRequests = apiRequests;

  const problem = page.getByLabel('What do you need help with?');
  const location = page.getByLabel('Where are you?');
  for (const category of ['eviction', 'homelessness', 'legal', 'emergency']) {
    await problem.selectOption(category);
    await expect(page.locator('.housing-card').first()).toBeVisible();
    await expect(page.locator('.housing-card-actions a').first()).toHaveAttribute('href', /^https:\/\//);
  }

  await problem.selectOption('eviction');
  await location.selectOption('tampa');
  await expect(page.locator('.housing-card').filter({ hasText: 'Rental and Move-In Assistance Program' })).toHaveCount(0);
  await problem.selectOption('all');
  await expect(page.locator('.housing-card').filter({ hasText: 'Rental and Move-In Assistance Program' })).toBeVisible();
  await location.selectOption('pasco');
  await expect(page.locator('.housing-card').filter({ hasText: 'Rental and Move-In Assistance Program' })).toHaveCount(0);
  await problem.selectOption('eviction');
  await expect(page.locator('.housing-card').filter({ hasText: 'Pasco County Clerk' })).toBeVisible();
  await page.getByLabel('I need help urgently').check();
  await expect(page.getByRole('heading', { name: 'Need help right now?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy details' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print this page' })).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy details' }).first().click();
  await expect(page.locator('.housing-card').first().getByRole('status')).toContainText('copied');
  await page.evaluate(() => { window.print = () => { window.__housingPrintCalled = true; }; });
  await page.getByRole('button', { name: 'Print this page' }).click();
  expect(await page.evaluate(() => window.__housingPrintCalled)).toBe(true);
  expect(apiRequests).toBe(initialApiRequests);
});

test('mobile visitors reach emergency help without filtering', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: /Find Housing Help Without AI/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Need help right now?' })).toBeVisible();
  await expect(page.locator('.immediate-help')).toContainText('988');
  await expect(page.getByLabel('What do you need help with?')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).include('#housing-help').analyze();
  expect(accessibility.violations).toEqual([]);
});

test('AI outage and app limits give distinct notices while housing help stays open', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { corpus: { chunks: 1, status: 'ready' } } }));
  const usage = { remaining: 12, limit: 15, used: 3, resetAt: '2026-10-10T00:00:00.000Z', available: false, reason: 'provider_quota' };
  await page.route('**/api/usage', route => route.fulfill({ json: { ai: usage } }));
  await page.goto('/');
  await expect(page.locator('.ai-usage')).toContainText('AI questions remaining today: 12 of 15');
  await expect(page.locator('.chat-panel .ai-fallback-note')).toContainText("TampaBayBot's AI chat is temporarily unavailable. You can still browse verified housing assistance resources.");
  await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Housing help', exact: true })).toBeVisible();

  await page.unroute('**/api/usage');
  await page.route('**/api/usage', route => route.fulfill({ json: { ai: { ...usage, remaining: 0, used: 15, reason: 'ai_visitor_limit' } } }));
  await page.reload();
  await expect(page.locator('.ai-limit-note')).toContainText("You've reached today's AI chat limit.");
  await expect(page.locator('.chat-panel .ai-fallback-note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled();

  await page.unroute('**/api/usage');
  await page.route('**/api/usage', route => route.fulfill({ json: { ai: { ...usage, reason: 'ai_global_limit' } } }));
  await page.reload();
  await expect(page.getByText("Today's application AI budget is reached.")).toBeVisible();
  await expect(page.locator('.chat-panel .ai-fallback-note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled();
});

test('a deliberately source-only service keeps the plain search and directory free of AI outage notices', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { corpus: { chunks: 0, status: 'no_evidence' } } }));
  await page.route('**/api/usage', route => route.fulfill({ json: { ai: {
    remaining: 15, limit: 15, used: 0, resetAt: '2026-10-10T00:00:00.000Z',
    available: false, reason: 'ai_configuration',
  } } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tampa Bay housing information' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
  await expect(page.locator('.ai-usage')).toHaveCount(0);
  await expect(page.locator('.chat-panel .ai-fallback-note')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Housing help', exact: true })).toBeVisible();
});

test('an exhausted chat tab refreshes its allowance after the UTC reset', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-09T23:59:58.000Z') });
  let usageCalls = 0;
  await page.route('**/api/usage', route => {
    usageCalls++;
    const exhausted = usageCalls === 1;
    return route.fulfill({ json: { ai: {
      remaining: exhausted ? 0 : 15, limit: 15, used: exhausted ? 15 : 0,
      resetAt: exhausted ? '2026-10-10T00:00:00.000Z' : '2026-10-11T00:00:00.000Z',
      available: !exhausted, reason: exhausted ? 'ai_visitor_limit' : null,
    } } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled();
  await page.clock.fastForward(4_000);
  await expect(page.locator('.ai-usage')).toContainText('AI questions remaining today: 15 of 15');
  await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
  expect(usageCalls).toBe(2);
});

test('emergency contacts and Spanish copied details expose expired source checks', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T12:00:00.000Z') });
  await page.goto('/');
  const hotline = page.locator('.immediate-links > div').filter({ hasText: 'Domestic violence crisis hotline' });
  await expect(hotline).toContainText('Hillsborough');
  await expect(hotline).toContainText('Needs recheck');
  await expect(hotline).toContainText('2026-10-09');
  await page.getByLabel('What housing problem are you facing?').selectOption('domestic_violence');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Domestic violence crisis hotline');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Coverage: Hillsborough County');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Source check expired; verify directly');
  await page.getByLabel('Language').selectOption('es');
  await expect(hotline).toContainText('Necesita nueva verificación');
  await expect(page.locator('.crisis-plan-resources')).toContainText('La comprobación de la fuente venció');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar detalles' }).first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Estado de la fuente:');
  expect(copied).toContain('Última comprobación: 2026-10-09');
  expect(copied).not.toContain('Source status:');
});

test('optional crisis guide creates a cited eviction plan entirely from static data', async ({ page }) => {
  let apiRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests++; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'I Need Housing Help' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Need help right now?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Skip questions and browse all resources/ })).toBeVisible();
  const initialRequests = apiRequests;
  await page.getByLabel('What housing problem are you facing?').selectOption('eviction');
  await page.getByLabel('How soon do you need help?').selectOption('days');
  await page.getByLabel('What city or county are you in?').selectOption('tampa');
  await page.getByLabel('Have you received a notice or court document?').selectOption('court_summons');
  await expect(page.locator('.crisis-priority')).toContainText('Read the summons and attached court papers');
  await expect(page.locator('.crisis-urgency')).toHaveText('Urgent');
  await expect(page.locator('.crisis-plan')).toContainText('Bay Area Legal Services');
  await expect(page.locator('.crisis-plan')).not.toContainText('Rental and Move-In Assistance Program');
  await expect(page.locator('.crisis-plan')).toContainText('Coverage:');
  await expect(page.locator('.crisis-plan')).toContainText('Who can use this:');
  await expect(page.locator('.crisis-plan')).toContainText('Service availability:');
  await expect(page.locator('.crisis-plan')).toContainText('Public details last source-checked: 2026-10-09');
  await expect(page.locator('.crisis-plan-support').last().getByRole('link').first()).toHaveAttribute('href', /^https:\/\//);
  expect(apiRequests).toBe(initialRequests);
  await page.getByLabel('Language').selectOption('es');
  await expect(page.locator('.crisis-plan')).toContainText('Haga esto primero');
  await expect(page.locator('.crisis-plan')).toContainText('Fuentes oficiales');
  await expect(page.locator('.housing-translation-note')).toBeVisible();
  expect(apiRequests).toBe(initialRequests);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(page.url()).not.toContain('court_summons');
  const accessibility = await new AxeBuilder({ page }).include('#housing-help').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByLabel('Idioma').selectOption('en');
  await page.getByLabel('What housing problem are you facing?').selectOption('affordable_housing');
  await expect(page.locator('.crisis-plan')).toContainText('The city program page says Phase X is for new move-in costs only');
  await expect(page.locator('.crisis-plan')).toContainText('Only these cities: City of Tampa');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy plan' }).click();
  const copiedPlan = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedPlan).toContain('existing leases are ineligible');
  expect(copiedPlan).toContain('Only these cities: City of Tampa');
  expect(copiedPlan).toContain('Public details last source-checked: 2026-10-09');
  expect(apiRequests).toBe(initialRequests);
});

test('unsafe sleep tonight routes to shelter intake, while quick exit is available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('What housing problem are you facing?').selectOption('homelessness');
  await page.getByLabel('How soon do you need help?').selectOption('tonight');
  await page.getByLabel('What city or county are you in?').selectOption('pinellas');
  await expect(page.locator('.crisis-urgency')).toHaveText('Emergency');
  await expect(page.locator('.crisis-priority')).toContainText('shelter intake');
  await expect(page.locator('.crisis-priority')).not.toContainText('911');
  await expect(page.getByRole('button', { name: 'Quick exit to weather' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('chat displays a structured crisis plan returned with its cited answer', async ({ page }) => {
  const crisisPlan = buildCrisisPlan({ situation: 'eviction', location: 'tampa', noticeStage: 'court_summons' }, staticResources, { locale: 'en' });
  await page.route('**/api/health', route => route.fulfill({ json: { corpus: { chunks: 1, status: 'ready' } } }));
  await page.route('**/api/usage', route => route.fulfill({ json: { ai: { remaining: 15, limit: 15, used: 0, resetAt: null, available: true, reason: null } } }));
  await page.route('**/api/ask', route => route.fulfill({ json: {
    status: 'answered', answer: 'Read the summons and contact legal aid.', jurisdictionId: 'tampa', jurisdictionLabel: 'City of Tampa',
    conversation: null, conversationUsed: false, evidence: [], nextSteps: [], warnings: [], meaning: null,
    crisisPlan,
  } }));
  await page.goto('/');
  await page.getByLabel('Question or address').fill('I received an eviction summons');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.chat-crisis-plan')).toContainText('Read the summons');
  await expect(page.locator('.chat-crisis-plan')).toContainText('Bay Area Legal Services');
  await expect(page.locator('.chat-crisis-plan').getByRole('link', { name: /Hillsborough County Clerk/ })).toHaveAttribute('href', /^https:\/\//);
});
