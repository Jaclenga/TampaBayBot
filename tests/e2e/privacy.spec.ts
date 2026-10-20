import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the classic preview has a directly accessible privacy page", async ({ page }) => {
  const response = await page.goto("/privacy/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: /privacy/i })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/housing guide/i);
  await expect(page.getByRole("main")).toContainText(/model provider/i);
  await expect(page.getByRole("main")).toContainText(/question is not automatically redacted/i);
  await expect(page.getByRole("main")).toContainText(/hosted question and property tools use the backend/i);
  await expect(page.getByRole("main")).toContainText(/property/i);

  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});

test("the classic preview links to privacy details beside forms and in the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".site-header a[href='/privacy/']")).toBeVisible();
  await expect(page.locator(".question-form a[href='/privacy/']")).toBeVisible();
  await expect(page.locator(".question-form .privacy-hint")).toContainText(/question goes to the app backend/i);
  await expect(page.locator(".site-footer a[href='/privacy/']")).toBeVisible();
  await page.getByLabel("Your area").selectOption("tampa");
  await page.getByLabel("Question or address").fill("315 E Kennedy Blvd, Tampa");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".property-panel form a[href='/privacy/']")).toBeVisible();
  await page.locator(".question-form a[href='/privacy/']").click();
  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: /privacy/i })).toBeVisible();

  await page.goto("/housing-help");
  await expect(page.locator(".crisis-intake a[href='/privacy/']")).toBeVisible();
  await page.locator("#interface-language").selectOption("es");
  await expect(page.locator(".crisis-intake a[href='/privacy/']")).toContainText("en inglés");
});
