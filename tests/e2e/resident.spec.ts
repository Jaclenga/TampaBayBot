import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("regional questions require an area and city changes keep evidence in the selected jurisdiction", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tampa Bay housing information" })).toBeVisible();
  const area = page.getByLabel("Your city or county");
  await expect(area).toHaveValue("tampa-bay");
  await page.getByLabel("Ask a question or enter an address").fill("Where can I find housing assistance?");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".status-label")).toHaveText("Choose a city or county");

  for (const [id, agency] of [["st-petersburg", "St. Petersburg"], ["clearwater", "Clearwater"]]) {
    await area.selectOption(id);
    await expect(page.locator(".answer-layout")).toHaveCount(0);
    const response = page.waitForResponse(result => result.url().endsWith("/api/ask") && result.request().method() === "POST");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const answer = await (await response).json();
    expect(answer.jurisdictionId).toBe(id);
    expect(answer.evidence.length).toBeGreaterThan(0);
    expect(answer.evidence.some((item: { agency: string }) => item.agency.includes(agency))).toBe(true);
    expect(answer.evidence.some((item: { source_id: string }) => item.source_id.startsWith("tampa-") || item.source_id === "hillsborough-help")).toBe(false);
    await expect(page.locator(".evidence-card").first()).toBeVisible();
  }
});

test("home, source library, and about page meet automated WCAG A/AA checks", async ({
  page,
}, testInfo) => {
  for (const path of ["/", "/sources", "/about", "/evaluation"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    if (path === "/") {
      await expect(page.locator("#question-privacy")).toContainText(
        "Model assistance is off",
      );
      await expect(
        page.getByRole("button", { name: "Search", exact: true }),
      ).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath("desktop-home.png"),
        fullPage: true,
      });
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await testInfo.attach(`axe-${path.replaceAll("/", "") || "home"}`, {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
    expect(results.violations).toEqual([]);
  }
});

test("evaluation page exposes the published offline cases and exact failure counts", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/evaluation?artifact=suite");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-disposition"]).toContain(
    'filename="parcelprivateer-suite.json"',
  );
  const report = await response.json();
  expect(report.mode).toBe("offline");
  expect(Array.isArray(report.cases)).toBe(true);
  expect(Object.keys(report.summary.suites)).toEqual(
    expect.arrayContaining(["navigation", "guardrails", "providers", "metamorphic", "jurisdiction"]),
  );
  expect(report.summary.cases).toBeGreaterThanOrEqual(224);
  expect(report.cases).toHaveLength(report.summary.cases);
  const totalFailed = report.cases.filter(
    (item: { checks: { passed: boolean | null }[] }) =>
      item.checks.some((check) => check.passed === false),
  ).length;
  expect(report.summary.failed).toBe(totalFailed);
  expect(report.summary.passed).toBe(report.cases.length - totalFailed);
  await page.goto("/evaluation");
  await expect(
    page.getByRole("heading", { name: "Offline engineering checks" }),
  ).toBeVisible();
  const table = page.getByRole("table", {
    name: "Published offline engineering cases",
  });
  await expect(table).toBeVisible();
  for (const [name, value] of Object.entries(report.summary.suites)) {
    const summary = value as { cases: number; passed: number; failed: number };
    const cases = report.cases.filter(
      (item: { suite: string }) => item.suite === name,
    );
    const failed = cases.filter(
      (item: { checks: { passed: boolean | null }[] }) =>
        item.checks.some((check) => check.passed === false),
    ).length;
    expect(summary.cases).toBe(cases.length);
    expect(summary.failed).toBe(failed);
    expect(summary.passed).toBe(cases.length - failed);
    const cells = table.getByTestId(`offline-suite-${name}`).getByRole("cell");
    await expect(cells).toHaveText([
      String(summary.cases), String(summary.passed), String(summary.failed),
    ]);
  }
  const totals = table.getByTestId("offline-suite-total").getByRole("cell");
  await expect(totals).toHaveText([
    String(report.summary.cases),
    String(report.summary.passed),
    String(report.summary.failed),
  ]);
  await expect(page.getByTestId("offline-suite-outcome")).toHaveText(
    report.summary.failed > 0
      ? "Some cases failed. Inspect the report before relying on these checks."
      : "No failing cases were recorded in this run.",
  );
  const suiteDisclosure = page.getByRole("region", { name: "Offline engineering checks" });
  await expect(suiteDisclosure).toContainText("Provider responses are synthetic");
  await expect(suiteDisclosure).toContainText(
    "do not evaluate a real model or establish answer accuracy",
  );
  await expect(
    page.getByRole("link", { name: "Offline engineering suite report (JSON)" }),
  ).toHaveAttribute("href", "/api/evaluation?artifact=suite");
  // The original artifacts remain separately inspectable.
  expect((await request.get("/api/evaluation?artifact=summary")).ok()).toBeTruthy();
  expect((await request.get("/api/evaluation?artifact=human")).ok()).toBeTruthy();
});

test("model selection and fallback remain labeled with accessible source citations", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.post("/api/ask", {
    data: { question: "Where can I find help paying for housing?", jurisdictionId: "tampa" },
  });
  expect(response.ok()).toBeTruthy();
  const baseline = await response.json();
  // The model service is deliberately mocked: this checks display and focus,
  // while test:llm-runtime covers actual server-to-provider transport.
  let status = "used";
  await page.route("**/api/ask", (route) =>
    route.fulfill({
      json: {
        ...baseline,
        generation: {
          mode: status === "used" ? "llm" : "extractive",
          provider: "ollama",
          status,
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Your city or county").selectOption("tampa");
  for (const current of ["used", "fallback"]) {
    status = current;
    const question = page.getByLabel("Ask a question or enter an address");
    await expect(question).toBeEnabled();
    await question.fill("Where can I find help paying for housing?");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Answer", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByText(
        current === "used"
          ? "A language model selected these source excerpts. Their wording was checked against the saved evidence."
          : "Model assistance could not provide a verified result. This answer uses the standard source search.",
      ),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Read evidence E1", exact: true })
      .click();
    await expect(page.locator("#evidence-E1 summary")).toBeFocused();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await testInfo.attach(`axe-model-${current}`, {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
    expect(results.violations).toEqual([]);
    if (current === "used")
      await page.getByRole("button", { name: "Start a new question" }).click();
  }
});

test("keyboard search produces inspectable citations and actionable next steps", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your city or county").selectOption("tampa");
  const question = page.getByLabel("Ask a question or enter an address");
  await expect(question).toBeEnabled();
  await question.focus();
  await page.keyboard.type("Where can I find help paying for housing?");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Answer", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Evidence you can inspect" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What you can do next" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Read original source/ }).first(),
  ).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator("blockquote").first()).not.toBeEmpty();
  await page
    .getByRole("link", { name: "Read evidence E1", exact: true })
    .click();
  await expect(page.locator("#evidence-E1")).toHaveAttribute("open", "");
  // Normalize only capture position; interaction and focus assertions ran above.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("housing-answer.png"),
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await testInfo.attach("axe-answer", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.violations).toEqual([]);
});

test("empty questions show an accessible error and unsupported programs remain uncertain", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your city or county").selectOption("tampa");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a housing question",
  );
  await expect(
    page.getByLabel("Ask a question or enter an address"),
  ).toHaveAttribute("aria-invalid", "true");
  await page
    .getByLabel("Ask a question or enter an address")
    .fill('Where do I apply for the "Magic Free Mansion" grant?');
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".answer-lead")).toContainText("could not verify");
  await expect(
    page.getByText("More information needed", { exact: true }),
  ).toBeVisible();
});

test("small screens, enlarged text and reduced motion retain all primary controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Your city or county").selectOption("tampa");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile-home.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Ask a question or enter an address"),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("zoom-200.png"),
    fullPage: true,
  });
});

test("an address entered as the question opens a prefilled property lookup without an automatic GIS request", async ({
  page,
}) => {
  let lookupRequests = 0;
  await page.route("**/api/location", (route) => {
    lookupRequests++;
    return route.fulfill({ json: { candidates: [], message: "Synthetic lookup" } });
  });
  await page.goto("/");
  await page.getByLabel("Your city or county").selectOption("tampa");
  const question = page.getByLabel("Ask a question or enter an address");
  await expect(question).toBeEnabled();
  await question.fill("315 E Kennedy Blvd, Tampa");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Tampa Bay street address")).toHaveValue(
    "315 E Kennedy Blvd, Tampa",
  );
  await expect(page.locator(".answer-lead")).toContainText(
    "Confirm the address and jurisdiction",
  );
  expect(lookupRequests).toBe(0);
  await page.getByRole("button", { name: "Find address", exact: true }).click();
  await expect(page.getByText("Synthetic lookup", { exact: true })).toBeVisible();
  expect(lookupRequests).toBe(1);
});

test("property workflow requires address confirmation and handles GIS failures with text", async ({
  page,
}, testInfo) => {
  // Synthetic fixture deliberately supplies two matches; it tests UI state, not live geographic correctness.
  const candidate = {
    id: "test-a",
    address: "Test address A (synthetic)",
    latitude: 27.9476,
    longitude: -82.4572,
    score: 90,
    sourceId: "tampa-city-gis",
    sourceUrl: "https://www.tampa.gov/",
    retrievedAt: "2026-09-12T00:00:00Z",
  };
  let propertyRequests = 0;
  await page.route("**/api/location", (route) =>
    route.fulfill({
      json: {
        status: "ambiguous_address",
        message: "Two test matches. Confirm your address.",
        retrievedAt: null,
        candidates: [
          candidate,
          { ...candidate, id: "test-b", address: "Test address B (synthetic)" },
        ],
      },
    }),
  );
  await page.route("**/api/property", (route) => {
    propertyRequests++;
    return route.fulfill({
      json: {
        status: "partial",
        message: "Some public layers are unavailable.",
        address: candidate.address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        jurisdiction: "Not determined",
        warnings: ["Zoning service unavailable."],
        evidence: [],
        parcel: {
          status: "unavailable",
          records: [],
          sourceId: "tampa-city-gis",
          sourceUrl: "https://www.tampa.gov/",
          agency: "Test fixture",
          title: "Property record",
          retrievedAt: null,
          message: "Property service unavailable.",
        },
      },
    });
  });
  await page.route("**/api/development", (route) =>
    route.fulfill({
      json: {
        status: "unavailable",
        message: "The development source is unavailable.",
        sourceId: "tampa-development-records",
        sourceUrl: "https://github.com/Jaclenga/Tampa-Development-Records",
        sourceSnapshotDate: "2026-08-23",
        authoritativeStatus: "independent",
        commit: "fixture",
        radiusMeters: 1000,
        distanceMethod: "haversine",
        coverage: "Synthetic fixture",
        warnings: ["Coverage incomplete."],
        records: [],
        totalMatches: 0,
        retrievedAt: null,
        activityByYear: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Your city or county").selectOption("tampa");
  await page
    .getByRole("button", { name: "What zoning applies to this address?" })
    .click();
  await expect(page.getByLabel("Tampa Bay street address")).toBeVisible();
  await page
    .getByLabel("Tampa Bay street address")
    .fill("315 E Kennedy Blvd, Tampa");
  await page.getByRole("button", { name: "Find address", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm the matching address" }),
  ).toBeVisible();
  expect(propertyRequests).toBe(0);
  await page.getByRole("button", { name: /Test address A/ }).click();
  await expect(
    page.getByRole("heading", { name: "Property context", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Property service unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByText("The development source is unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No records were returned within this distance.", {
      exact: false,
    }),
  ).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await testInfo.attach("axe-property", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Choose a different match" }).click();
  await expect(page.getByRole("heading", { name: "Confirm the matching address" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Property context", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Test address B/ }).click();
  await expect(page.locator(".selected-address")).toContainText("Test address B");
  await expect(page.getByText("Property service unavailable.", { exact: true })).toBeVisible();
  expect(propertyRequests).toBe(2);

  await page.getByRole("button", { name: "Find address", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm the matching address" })).toBeFocused();
  await expect(page.locator(".selected-property")).toHaveCount(0);
  expect(propertyRequests).toBe(2);
});

test("private identifiers show an accessible error and residents can correct the question", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Your city or county").selectOption("tampa");
  const input = page.getByLabel("Ask a question or enter an address");
  await expect(input).toBeEnabled();
  await input.fill("My SSN is 000-00-0000. Where can I find housing help?");
  const blocked = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ask") && response.status() === 422,
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const payload = await (await blocked).json();
  expect(payload.code).toBe("sensitive_input");
  expect(JSON.stringify(payload)).not.toContain("000-00-0000");
  await expect(page.getByRole("alert")).toContainText(
    "Remove Social Security numbers",
  );
  await expect(input).toHaveAttribute("aria-invalid", "true");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await testInfo.attach("axe-private-input-error", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.violations).toEqual([]);
  await input.fill("Where can I find help paying for housing?");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Answer", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("HTTP APIs reject malformed or oversized input without performing a lookup", async ({
  request,
}) => {
  expect(
    (await request.post("/api/ask", { data: { question: "" } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/ask", { data: { question: "x".repeat(1001) } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/location", {
        data: { address: "a".repeat(9000) },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/property", {
        data: { latitude: 0, longitude: 0, address: "x" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/development", {
        data: { latitude: 27.94, longitude: -82.45, radiusMeters: [1000] },
      })
    ).status(),
  ).toBe(400);
});
