import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const productionSecurity = process.env.PLAYWRIGHT_PRODUCTION_SECURITY === "true";
const productionInputURL = "http://127.0.0.1:3101";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: productionSecurity ? 0 : process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "evaluation/accessibility/playwright-results.json" },
    ],
    ["html", { open: "never" }],
  ],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : productionSecurity
      ? [
          {
            command: "node node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 3100 --local",
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
          },
          {
            command: "node scripts/serve-built-worker.mjs --port 3101 --no-assets",
            url: productionInputURL,
            reuseExistingServer: false,
            timeout: 120_000,
          },
        ]
      : {
          command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
