import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/components",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:31449", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node --import tsx tests/components/server.ts",
    url: "http://127.0.0.1:31449",
    reuseExistingServer: false,
  },
});
