import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/housing-browser.spec.mjs',
  use: { baseURL: 'http://127.0.0.1:4182', headless: true },
  webServer: { command: 'node tests/serve-static.mjs', url: 'http://127.0.0.1:4182', reuseExistingServer: false, timeout: 10_000 },
  reporter: 'list',
});
