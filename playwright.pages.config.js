import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    env: { PIT_BASE_PATH: '/pit-detail-club/' },
    url: 'http://127.0.0.1:4173/pit-detail-club/',
    reuseExistingServer: true,
  },
  reporter: 'list',
});
