import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the Next housing guide works without any API and keeps county eviction referrals", async ({ page }) => {
  const apiCalls: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto("/housing-help");
  await expect(page.getByRole("heading", { name: "I Need Housing Help", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Immediate help" })).toBeVisible();
  await page.getByLabel("Housing problem").selectOption("eviction");
  await page.getByLabel("City or county (optional)").selectOption("tampa");
  await page.getByLabel("What document did you receive?").selectOption("court_summons");
  const plan = page.locator(".crisis-plan");
  await expect(plan).toContainText("Urgent");
  await expect(plan).toContainText("Bay Area Legal Services");
  await expect(plan).toContainText("Hillsborough County Clerk");
  await expect(plan).not.toContainText("Rental and Move-In Assistance Program");
  await expect(plan.getByRole("heading", { name: "Official sources" })).toBeVisible();
  await page.getByLabel("Housing problem").selectOption("affordable_housing");
  await expect(plan).toContainText("Planning");
  await expect(plan).not.toContainText("Confirm the response deadline promptly");
  expect(apiCalls).toEqual([]);
});

test("the Next housing guide offers Spanish without sending selections or critical axe violations", async ({ page }) => {
  const apiCalls: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto("/housing-help");
  await page.locator("#interface-language").selectOption("es");
  await page.getByLabel("Problema de vivienda").selectOption("homelessness");
  await page.getByLabel("Ciudad o condado (opcional)").selectOption("pinellas");
  await page.getByLabel("¿Cuándo necesita ayuda?").selectOption("tonight");
  const plan = page.locator(".crisis-plan");
  await expect(plan).toContainText("Ayuda inmediata");
  await expect(plan).toContainText("First Contact");
  await expect(plan).not.toContainText("911.gov");
  expect(apiCalls).toEqual([]);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});
