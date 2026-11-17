import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/performance', workers: 1, timeout: 180_000, reporter: 'list',
  outputDir: 'work/performance/browser-artifacts',
  use: { baseURL: 'http://127.0.0.1:3116' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node scripts/demo.mjs --port 3116', url: 'http://127.0.0.1:3116', reuseExistingServer: false, timeout: 120_000 },
});
