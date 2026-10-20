import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectVisibleFocusRing(page: Page) {
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return { visible: false, width: 0 };
    const style = getComputedStyle(element);
    return { visible: element.matches(":focus-visible") && style.outlineStyle !== "none", width: parseFloat(style.outlineWidth) };
  });
  expect(focus.visible).toBe(true);
  expect(focus.width).toBeGreaterThanOrEqual(2);
}

async function checkAxe(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify({
      url: page.url(),
      tags: wcagTags,
      violations: result.violations,
      incomplete: result.incomplete,
    }, null, 2),
    contentType: "application/json",
  });
  expect(result.violations).toEqual([]);
}

test("classic keyboard entry and language switch preserve an in-progress question", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await expectVisibleFocusRing(page);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();

  await page.getByLabel("Your area").selectOption("tampa");
  const question = page.getByLabel("Question or address");
  await question.fill("Where can I find housing help?");
  const switcher = page.locator("#interface-language");
  await switcher.focus();
  await switcher.selectOption("es");
  await expect(switcher).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByLabel("Su zona", { exact: true })).toHaveValue("tampa");
  await expect(page.getByLabel("Pregunta o dirección", { exact: true })).toHaveValue("Where can I find housing help?");
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toContainText("Fuentes públicas");
  await expect(page.getByRole("button", { name: "Buscar", exact: true })).toBeEnabled();
  await checkAxe(page, testInfo, "classic-spanish-home");

  await switcher.selectOption("en");
  await expect(page.getByLabel("Your area")).toHaveValue("tampa");
  await expect(page.getByLabel("Question or address")).toHaveValue("Where can I find housing help?");
  await page.getByLabel("Question or address").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeFocused();
  await expectVisibleFocusRing(page);
  await switcher.selectOption("es");
  const spanishQuestion = page.getByLabel("Pregunta o dirección", { exact: true });
  await spanishQuestion.fill("");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Escriba una pregunta");
  await expect(spanishQuestion).toHaveAttribute("aria-invalid", "true");
  await expect(spanishQuestion).toBeFocused();
});

test("Spanish eviction guide keeps selections and focus through language changes on mobile", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  const apiCalls: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/housing-help");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();

  const situation = page.getByLabel("Housing problem");
  await expect(situation).toBeEnabled();
  await situation.focus();
  await situation.press("ArrowDown");
  await expect(situation).toHaveValue("eviction");
  await expect(situation).toBeFocused();
  const planStatus = page.locator(".crisis-intake > p.sr-only[role='status']");
  await expect(planStatus).toContainText("Plan updated:");
  await page.getByLabel("City or county (optional)").selectOption("tampa");
  await expect(planStatus).toContainText("Tampa");
  const notice = page.getByLabel("What document did you receive?");
  await notice.selectOption("pending_case");
  await notice.focus();
  await notice.press("ArrowUp");
  await expect(notice).toHaveValue("court_summons");
  await expect(notice).toBeFocused();
  await expect(planStatus).toContainText("Court summons");
  await expect(page.locator(".crisis-plan")).toContainText("Hillsborough County Clerk");
  const switcher = page.locator("#interface-language");
  await switcher.focus();
  await switcher.selectOption("es");
  await expect(switcher).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByLabel("Problema de vivienda")).toHaveValue("eviction");
  await expect(page.getByLabel("Ciudad o condado (opcional)")).toHaveValue("tampa");
  await expect(page.getByLabel("¿Qué documento recibió?")).toHaveValue("court_summons");
  await expect(page.locator(".crisis-plan")).toContainText("Urgente");
  await expect(page.locator(".crisis-plan")).toContainText("Hillsborough County Clerk");
  await expect(planStatus).toContainText("Plan actualizado:");
  await expect(planStatus).toContainText("Citación judicial");
  await expect(page.locator(".crisis-directory")).toContainText("en inglés");
  await expect(page.getByRole("link", { name: "Salir rápido" })).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copiar plan" }).click();
  await expect(page.locator(".crisis-actions + [role='status']")).toContainText("Plan copiado.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(apiCalls).toEqual([]);
  await checkAxe(page, testInfo, "spanish-eviction-guide-mobile");

  await switcher.selectOption("en");
  await expect(page.getByLabel("Housing problem")).toHaveValue("eviction");
  await expect(page.getByLabel("What document did you receive?")).toHaveValue("court_summons");
});

test("classic reference navigation and housing guide pass WCAG 2.2 tagged axe checks", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/sources", "/about", "/housing-help"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await page.locator("#interface-language").selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await checkAxe(page, testInfo, `${path.slice(1)}-spanish-mobile`);
  }
});
