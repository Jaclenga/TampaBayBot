import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test("the Next housing guide works without any API and keeps county eviction referrals", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  const apiCalls: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto("/housing-help");
  await expect(page.getByRole("heading", { name: "I Need Housing Help", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Immediate help" })).toBeVisible();
  await expect(page.locator(".crisis-directory li").first()).toContainText("Resource information last reviewed");
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
  await expect(page.locator(".crisis-directory").getByText("conflicting help for existing leases", { exact: false })).toBeVisible();
  await expect(plan).toContainText("Known source issue");
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
  await expect(plan).toContainText("Información del recurso revisada por última vez");
  await expect(plan).toContainText("First Contact");
  await expect(plan).not.toContainText("911.gov");
  expect(apiCalls).toEqual([]);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});

test("housing guide keyboard skip, live plan updates, language switch and mobile reflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const apiCalls: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto("/housing-help");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();

  const situation = page.getByLabel("Housing problem");
  await situation.selectOption("eviction");
  await page.getByLabel("City or county (optional)").selectOption("tampa");
  const planStatus = page.locator('.crisis-intake [role="status"]').first();
  await expect(planStatus).toContainText("Tampa");
  await page.getByLabel("How soon do you need help?").selectOption("days");
  await expect(planStatus).toContainText("In a few days");
  await page.getByLabel("What document did you receive?").selectOption("court_summons");
  const plan = page.locator(".crisis-plan");
  await expect(plan).toContainText("Hillsborough County Clerk");
  await expect(planStatus).toContainText("Plan updated:");
  await expect(planStatus).toContainText("Court summons");

  await page.locator("#interface-language").selectOption("es");
  await expect(page.getByLabel("Problema de vivienda")).toHaveValue("eviction");
  await expect(page.getByLabel("Ciudad o condado (opcional)")).toHaveValue("tampa");
  await expect(page.getByLabel("¿Qué documento recibió?")).toHaveValue("court_summons");
  await expect(planStatus).toContainText("Plan actualizado:");
  await expect(planStatus).toContainText("Citación judicial");
  await expect(plan).toContainText("Hillsborough County Clerk");
  await expect(page.locator(".crisis-directory")).toContainText("están en inglés");
  await expect(page.locator(".crisis-resource-list [lang=en]").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations).toEqual([]);

  await page.locator("#interface-language").selectOption("en");
  await expect(situation).toHaveValue("eviction");
  await expect(plan).toContainText("Hillsborough County Clerk");
  expect(apiCalls).toEqual([]);
});

test("copied and saved Spanish housing plans preserve source context and readable statuses", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/housing-help");
  await page.locator("#interface-language").selectOption("es");
  await page.getByLabel("Problema de vivienda").selectOption("eviction");
  await page.getByLabel("Ciudad o condado (opcional)").selectOption("tampa");
  await page.getByLabel("¿Qué documento recibió?").selectOption("court_summons");

  await page.getByRole("button", { name: "Copiar plan" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Guardar texto" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("tampabaybot-housing-plan.txt");
  const saved = await readFile(await download.path(), "utf8");

  expect(saved.replace(/\r\n/g, "\n")).toBe(copied.replace(/\r\n/g, "\n"));
  expect(saved).toContain("La descripción del recurso, los requisitos, la disponibilidad y el texto oficial");
  expect(saved).toContain("Estado de disponibilidad: No verificada; confirme la disponibilidad actual con el proveedor");
  expect(saved).toContain("Estado de la fuente: Información pública revisada en la fecha indicada");
  expect(saved).toContain("People with an eviction matter in Hillsborough County.");
  expect(saved).toContain("https://www.hillsclerk.com/eviction");
  expect(saved).not.toMatch(/Estado de (?:disponibilidad|la fuente): (?:unknown|source_checked|needs_recheck|source_unavailable|confirmed_open|temporarily_closed|discontinued)/);
});
