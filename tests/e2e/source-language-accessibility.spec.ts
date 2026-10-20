import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("source library keeps search state in Spanish and identifies unrecorded source language", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/sources");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();

  const search = page.getByRole("searchbox", { name: "Search sources" });
  await expect(search).toBeEnabled();
  await search.fill("housing");
  await expect(search).toHaveValue("housing");
  await page.locator("#interface-language").selectOption("es");
  await expect(page.getByRole("searchbox", { name: "Buscar fuentes" })).toHaveValue("housing");
  await expect(page.locator(".source-card").first()).toBeVisible();
  await expect(page.locator(".source-card h2[lang=und]").first()).toBeVisible();
  await expect(page.locator(".source-language-note").first()).toContainText("No se ha registrado el idioma");
  await page.getByRole("button", { name: "Borrar búsqueda" }).click();
  await expect(page.getByRole("searchbox", { name: "Buscar fuentes" })).toBeFocused();
  await expect(page.locator(".source-results-summary")).toContainText("fuentes");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations).toEqual([]);
});
