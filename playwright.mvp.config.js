import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/mvp', workers: 1, timeout: 60000,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
  use: { baseURL: 'http://127.0.0.1:3101', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node --experimental-sqlite server/test-start.js', url: 'http://127.0.0.1:3101', reuseExistingServer: false },
  reporter: 'list',
});
