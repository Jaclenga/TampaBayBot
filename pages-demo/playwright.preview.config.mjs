import { defineConfig } from '@playwright/test';

const liveUrl = process.env.PAGES_LIVE_URL;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/directory-preview.spec.mjs',
  use: { baseURL: liveUrl || 'http://127.0.0.1:4182', headless: true },
  webServer: liveUrl ? undefined : { command: 'node tests/serve-static.mjs', url: 'http://127.0.0.1:4182', reuseExistingServer: false, timeout: 10_000 },
  reporter: 'list',
});
