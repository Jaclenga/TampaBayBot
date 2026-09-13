import { test, expect, type Locator, type Page, type TestInfo, type Worker } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Keep demo.spec.ts first in the file order so its cold-start regression remains meaningful.

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 80; index++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, 'The control must be reachable using the keyboard').toBeFocused();
}

async function expectReflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      viewport: width,
      document: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('main *, header *, footer *')]
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.right > width + 1 || rect.left < -1);
        })
        .slice(0, 10).map(element => `${element.tagName}.${element.className}`),
    };
  });
  expect(overflow.document, `${label}: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function answer(page: Page) {
  await page.getByLabel('Your area', { exact: true }).selectOption('tampa');
  await page.getByLabel('Question or address', { exact: true }).fill('Where can I find rental assistance?');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeFocused();
  await page.locator('.citation-link').first().click();
  await expect(page.locator('details[open] summary').first()).toBeFocused();
}

test('keyboard-only question, error correction, citation and reset preserve focus and accessible names', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const area = page.getByLabel('Your area', { exact: true });
  await expect(area, 'Skip link must bypass the header controls').toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(area).toHaveValue('tampa');
  await page.keyboard.press('Tab');
  const input = page.getByLabel('Question or address', { exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.type('Where can I find rental assistance?');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeFocused();
  await tabTo(page, page.locator('.citation-link').first());
  await page.keyboard.press('Enter');
  const summary = page.locator('.evidence-card summary').first();
  await expect(summary).toBeFocused();
  await expect(page.locator('.evidence-card').first()).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(page.locator('.evidence-card').first()).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(page.locator('.evidence-card').first()).toHaveAttribute('open', '');
  const tree = await page.locator('main').ariaSnapshot();
  expect(tree).toContain('heading "Answer"');
  expect(tree).toContain('Fictional rental assistance');
  await testInfo.attach('keyboard-accessibility-tree', { body: tree, contentType: 'text/plain' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await tabTo(page, page.getByRole('button', { name: 'New question', exact: true }));
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(page.locator('.answer-layout')).toHaveCount(0);
});

test('320 and 375 pixel layouts retain readable controls and focus under forced colors', async ({ page }, testInfo) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    await expectReflow(page, `Home at ${width}px with forced colors`);
    await attachBrowserViewport(page, testInfo, `forced-colors-${width}-home`);
    await answer(page);
    await expectReflow(page, `Open cited answer at ${width}px with forced colors`);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('details[open] summary').first()).toBeFocused();
    const focused = page.locator(':focus');
    const outline = await focused.evaluate(element => ({ width: parseFloat(getComputedStyle(element).outlineWidth), style: getComputedStyle(element).outlineStyle, keyboardVisible: element.matches(':focus-visible') }));
    expect(outline.keyboardVisible).toBe(true);
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await attachBrowserViewport(page, testInfo, `forced-colors-${width}-evidence`);
    for (const path of ['/sources', '/about', '/evaluation']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expectReflow(page, `${path} at ${width}px with forced colors`);
    }
  }
});

type ChromeApi = {
  tabs: {
    query(query: { url: string }): Promise<{ id: number }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
  fontSettings: {
    setDefaultFontSize(settings: { pixelSize: number }): Promise<void>;
    getDefaultFontSize(settings: object): Promise<{ pixelSize: number }>;
  };
};

async function browserPreference(worker: Worker, origin: string, zoom: number, fontSize: number) {
  return worker.evaluate(async ({ origin, zoom, fontSize }) => {
    const chrome = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    if (!tab) throw new Error('Expected the isolated local test tab');
    await chrome.tabs.setZoom(tab.id, zoom);
    await chrome.fontSettings.setDefaultFontSize({ pixelSize: fontSize });
    return { zoom: await chrome.tabs.getZoom(tab.id), font: (await chrome.fontSettings.getDefaultFontSize({})).pixelSize };
  }, { origin, zoom, fontSize });
}

async function extensionFiles(testInfo: TestInfo) {
  const directory = testInfo.outputPath('browser-preference-extension');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Local accessibility test preferences', version: '1.0',
    permissions: ['fontSettings'], host_permissions: ['http://127.0.0.1/*'],
    background: { service_worker: 'background.js' },
  }));
  await writeFile(join(directory, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return directory;
}

async function attachBrowserViewport(page: Page, testInfo: TestInfo, name: string) {
  // Capture the existing browser surface without Playwright resizing the page
  // for a full-page screenshot, which interferes with native browser zoom.
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await testInfo.attach(name, { body: Buffer.from(data, 'base64'), contentType: 'image/png' });
  } finally {
    await session.detach();
  }
}

async function interfaceFontSizes(page: Page) {
  return page.locator('main h1, .question-form label, .question-form textarea, .question-form button, .privacy-hint')
    .evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
}

for (const mode of ['browser-zoom', 'text-size'] as const) {
  test(`${mode} uses actual Chromium preferences and retains complete question/reference flows`, async ({ playwright, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    const extension = await extensionFiles(testInfo);
    const context = await playwright.chromium.launchPersistentContext(testInfo.outputPath('isolated-profile'), {
      channel: 'chromium', headless: true, viewport: null, deviceScaleFactor: undefined,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--window-size=1280,1000'],
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const page = context.pages()[0] ?? await context.newPage();
      const origin = new URL(baseURL!).origin;
      await page.goto(origin);
      await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
      const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, font: parseFloat(getComputedStyle(document.body).fontSize) }));
      const baselineInterfaceFonts = await interfaceFontSizes(page);
      const observations = [];
      for (const factor of mode === 'browser-zoom' ? [2, 4] : [2]) {
        const zoom = mode === 'browser-zoom' ? factor : 1;
        const fontSize = mode === 'text-size' ? 16 * factor : 16;
        const preference = await browserPreference(worker, origin, zoom, fontSize);
        expect(preference.zoom).toBeCloseTo(zoom, 6);
        expect(preference.font).toBe(fontSize);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBeCloseTo(baseline.dpr * zoom, 1);
        await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBeCloseTo(baseline.font * (mode === 'text-size' ? factor : 1), 1);
        if (mode === 'text-size') {
          await expect.poll(() => interfaceFontSizes(page), 'Headings, labels, inputs, actions and hints must all respect enlarged text')
            .toEqual(baselineInterfaceFonts.map(size => size * factor));
        }
        const metrics = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, font: parseFloat(getComputedStyle(document.body).fontSize), cssZoom: getComputedStyle(document.documentElement).zoom }));
        expect(Math.abs(metrics.width - baseline.width / zoom)).toBeLessThanOrEqual(2);
        expect(metrics.cssZoom).toBe('1');
        await expectReflow(page, `${mode} ${factor * 100}% home`);
        await attachBrowserViewport(page, testInfo, `${mode}-${factor * 100}-home`);
        await answer(page);
        await expectReflow(page, `${mode} ${factor * 100}% open cited answer`);
        await attachBrowserViewport(page, testInfo, `${mode}-${factor * 100}-evidence`);
        observations.push({ factor, preference, metrics });
        for (const path of ['/sources', '/about', '/evaluation', '/']) {
          await page.goto(origin + path);
          await expect(page.locator('main h1')).toBeVisible();
          await expectReflow(page, `${mode} ${factor * 100}% ${path}`);
        }
      }
      await testInfo.attach('browser-preferences', { body: JSON.stringify({ browserVersion: context.browser()?.version(), platform: process.platform, baseline, observations }, null, 2), contentType: 'application/json' });
    } finally {
      await context.close();
    }
  });
}
