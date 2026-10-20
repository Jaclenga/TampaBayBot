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

test('crisis plan contacts are tappable and copied-resource status follows the selected language', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T12:00:00.000Z') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('What housing problem are you facing?').selectOption('domestic_violence');
  await page.getByLabel('What city or county are you in?').selectOption('hillsborough');
  const planContacts = page.locator('.crisis-plan-resources .housing-contacts');
  await expect(planContacts.getByRole('link', { name: '(813) 247-7233' }).first()).toHaveAttribute('href', 'tel:8132477233');
  await expect(planContacts.locator('a[href="sms:8132477233"]')).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const card = page.locator('.housing-card').first();
  await card.getByRole('button', { name: 'Copy details' }).click();
  await expect(card.getByRole('status')).toHaveText('Resource information copied.');
  await page.locator('#housing-language').selectOption('es');
  await expect(card.getByRole('status')).toBeEmpty();
  await card.getByRole('button', { name: 'Copiar detalles' }).click();
  await expect(card.getByRole('status')).toHaveText('Información del recurso copiada.');
  await page.locator('#housing-language').selectOption('en');
  await expect(card.getByRole('status')).toBeEmpty();
});

test('AI outage and app limits give distinct notices while housing help stays open', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { corpus: { chunks: 1, status: 'ready' } } }));
  const usage = { remaining: 12, limit: 15, used: 3, resetAt: '2026-10-10T00:00:00.000Z', available: false, reason: 'provider_quota' };
  await page.route('**/api/usage', route => route.fulfill({ json: { ai: usage } }));
  await page.goto('/');
  await expect(page.locator('.ai-usage')).toContainText('AI questions remaining today: 12 of 15');
  await expect(page.locator('.chat-panel .ai-fallback-note')).toContainText("TampaBayBot's AI chat is temporarily unavailable. You can still browse housing assistance contacts and official links.");
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

test('emergency contacts and Spanish copied details expose overdue reviews', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T12:00:00.000Z') });
  await page.goto('/');
  const hotline = page.locator('.immediate-links > div').filter({ hasText: 'Domestic violence crisis hotline' });
  await expect(hotline).toContainText('Hillsborough');
  await expect(hotline).toContainText('Review due');
  await expect(hotline).toContainText('2026-10-09');
  await page.getByLabel('What housing problem are you facing?').selectOption('domestic_violence');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Domestic violence crisis hotline');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Coverage: Hillsborough County');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Review due; verify directly');
  await page.locator('#housing-language').selectOption('es');
  await expect(hotline).toContainText('Necesita nueva revisión');
  await expect(page.locator('.crisis-plan-resources')).toContainText('Necesita nueva revisión');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar detalles' }).first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Estado de revisión:');
  expect(copied).toContain('Información revisada por última vez: 2026-10-09');
  expect(copied).not.toContain('Source status:');
});

test('known source conflicts are visible in directory and crisis plans', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T12:00:00Z') });
  await page.goto('/');
  const rmap = page.locator('.housing-card').filter({ hasText: 'Rental and Move-In Assistance Program' });
  await expect(rmap.locator('.resource-review-warnings')).toContainText('conflicting help for existing leases');
  await page.getByLabel('What housing problem are you facing?').selectOption('affordable_housing');
  await page.getByLabel('What city or county are you in?').selectOption('tampa');
  await expect(page.locator('.crisis-plan-resources .resource-review-warnings')).toContainText('conflicting help for existing leases');
  await page.locator('#housing-language').selectOption('es');
  await expect(rmap.locator('.resource-review-warnings')).toContainText('Advertencia conocida de la fuente (en inglés)');
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
  await expect(page.locator('.crisis-plan')).toContainText('Resource information last reviewed: 2026-10-09');
  await expect(page.locator('.crisis-plan-support').last().getByRole('link').first()).toHaveAttribute('href', /^https:\/\//);
  expect(apiRequests).toBe(initialRequests);
  await page.locator('#housing-language').selectOption('es');
  await expect(page.locator('.crisis-plan')).toContainText('Haga esto primero');
  await expect(page.locator('.crisis-plan')).toContainText('Fuentes oficiales');
  await expect(page.locator('.housing-directory-heading .housing-translation-note')).toBeVisible();
  expect(apiRequests).toBe(initialRequests);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(page.url()).not.toContain('court_summons');
  const accessibility = await new AxeBuilder({ page }).include('#housing-help').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator('#housing-language').selectOption('en');
  await page.getByLabel('What housing problem are you facing?').selectOption('affordable_housing');
  await expect(page.locator('.crisis-plan')).toContainText('The city program page says Phase X is for new move-in costs only');
  await expect(page.locator('.crisis-plan')).toContainText('Only these cities: City of Tampa');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy plan' }).click();
  const copiedPlan = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedPlan).toContain('existing leases are ineligible');
  expect(copiedPlan).toContain('Only these cities: City of Tampa');
  expect(copiedPlan).toContain('Resource information last reviewed: 2026-10-09');
  expect(apiRequests).toBe(initialRequests);
});

test('site and guide language switches keep an in-progress housing workflow and question draft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByLabel('Question or address').fill('I need help with rent');
  await page.getByLabel('What housing problem are you facing?').selectOption('eviction');
  await page.getByLabel('How soon do you need help?').selectOption('days');
  await page.getByLabel('What city or county are you in?').selectOption('tampa');
  await page.getByLabel('Are you somewhere safe right now?').selectOption('no');
  await page.getByLabel('Have you received a notice or court document?').selectOption('court_summons');
  await page.getByLabel('What do you need help with?').selectOption('legal');
  await page.getByLabel('I need help urgently').check();
  await page.locator('#site-language').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Ayuda de vivienda' })).toBeVisible();
  await expect(page.getByText('Las preguntas, respuestas y herramientas de propiedades se presentan actualmente en inglés.')).toBeVisible();
  for (const [selector, value] of [
    ['#crisis-situation', 'eviction'], ['#crisis-timeframe', 'days'], ['#crisis-location', 'tampa'],
    ['#crisis-safe', 'no'], ['#crisis-notice', 'court_summons'], ['#housing-problem', 'legal'],
  ]) await expect(page.locator(selector)).toHaveValue(value);
  await expect(page.getByLabel('Necesito ayuda urgente')).toBeChecked();
  await expect(page.getByLabel('Question or address')).toHaveValue('I need help with rent');
  await expect(page.locator('.crisis-priority')).toContainText('citación');
  await expect(page.locator('.crisis-guide > [role="status"]')).toContainText('Se actualizó el plan de vivienda');
  await expect(page.locator('.crisis-plan')).toContainText('Haga esto primero');
  await expect(page.locator('.crisis-plan')).toContainText('están en inglés');
  await expect(page.locator('.housing-card').first().locator('[lang="en"]').first()).toBeVisible();
  await expect(page.locator('#housing-language')).toHaveValue('es');
  await page.locator('#housing-language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#site-language')).toHaveValue('en');
  await expect(page.locator('#crisis-situation')).toHaveValue('eviction');
  await expect(page.locator('#crisis-notice')).toHaveValue('court_summons');
  await expect(page.getByLabel('Question or address')).toHaveValue('I need help with rent');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('#housing-help').analyze()).violations).toEqual([]);
});

test('mobile Pages controls keep visible focus and practical pointer targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  const focus = await page.locator('.skip-link').evaluate((element) => getComputedStyle(element).outlineWidth);
  expect(Number.parseFloat(focus)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
  for (const selector of ['#site-language', '#housing-language', '.crisis-safe-exit button', '.housing-card-actions button']) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box?.height, selector).toBeGreaterThanOrEqual(24);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test('chat citation cards show sourced metadata and only permitted previews on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/ask', route => route.fulfill({ json: {
    status: 'conflicting_evidence', answer: 'The sources disagree. [E1] [E2] [E9]',
    jurisdictionId: 'tampa', jurisdictionLabel: 'City of Tampa', conversation: null, conversationUsed: false,
    evidence: [
      { id: 'E1', title: 'First notice', agency: 'Agency One', publisher: 'Agency One', quote: 'Applications are open.', url: 'https://agency.example/program', section: null, retrieved_at: '2026-10-01', source_date: '2026-09-20', source_updated_date: '2026-09-20', stale: false, previewStatus: 'permitted', preview: 'Applications are' },
      { id: 'E2', title: 'Second notice', agency: 'Agency Two', publisher: 'Agency Two', quote: 'Applications are closed.', url: 'https://second.example/program', section: null, retrieved_at: null, source_date: null, source_updated_date: null, stale: false, previewStatus: 'not_permitted', preview: 'Do not show this preview.' },
    ],
    nextSteps: [], warnings: ['The snapshots cannot establish current availability.'], meaning: 'Ask the agency to confirm.',
    generation: { status: 'fallback', provider: 'none', reason: 'invalid_evidence' },
  } }));
  await page.goto('/');
  await page.getByLabel('Question or address').fill('Are applications open?');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.inline-citation')).toHaveCount(2);
  await expect(page.locator('.unverified-reference')).toHaveText('[unverified reference]');
  await expect(page.locator('.answer-text')).not.toContainText('[E9]');
  await expect(page.getByRole('link', { name: 'Read source E1' })).toHaveAttribute('href', '#source-1-E1');
  await expect(page.locator('#source-1-E1')).toContainText('Source statement');
  await expect(page.locator('#source-1-E1')).toContainText('Publisher');
  await expect(page.locator('#source-1-E1')).toContainText('Source date');
  await expect(page.locator('#source-1-E1 .source-preview')).toContainText('Applications are');
  await expect(page.locator('#source-1-E2 .source-preview')).toHaveCount(0);
  await expect(page.getByText('Do not show this preview.')).toHaveCount(0);
  await expect(page.locator('#source-1-E2')).not.toContainText('Source date');
  await expect(page.getByRole('heading', { name: 'Interpretation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What remains uncertain' })).toBeVisible();
  await expect(page.getByText('Source references could not be verified.', { exact: false })).toBeVisible();
  await expect(page.getByText('invalid_evidence')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.answer-card').analyze()).violations).toEqual([]);
});
