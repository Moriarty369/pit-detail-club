import { defineConfig } from "@playwright/test";

// UI integration only: every API request is intercepted with fictitious data.
// Real Auth/database E2E remains in playwright.cloud.config.ts.
export default defineConfig({
  testDir: "./tests/cloud-ui",
  workers: 1,
  timeout: 30000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:5190",
    viewport: { width: 390, height: 844 },
    trace: "off",
  },
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js preview --config vite.cloud.config.ts --host 127.0.0.1 --port 5190 --strictPort",
      url: "http://127.0.0.1:5190",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
