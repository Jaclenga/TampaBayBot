import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/source-e2e', timeout: 60_000, workers: 1, retries: 0,
  expect: { timeout: 20_000 }, reporter: [['list'], ['html', { open: 'never', outputFolder: 'work/source-browser-report' }]],
  use: { baseURL: 'http://127.0.0.1:3112', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node scripts/demo.mjs --port 3112', url: 'http://127.0.0.1:3112', reuseExistingServer: false, timeout: 120_000 },
});
