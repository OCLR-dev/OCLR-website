import { defineConfig, devices } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import base from "./playwright.config";
const server = Array.isArray(base.webServer)
  ? base.webServer[0]
  : base.webServer;
const inheritedAttempts = process.env.OCLR_TEST_NO_DB_ATTEMPTS;
const attempts =
  inheritedAttempts ??
  join(tmpdir(), `oclr-remote-no-local-db-${process.pid}.log`);
process.env.OCLR_TEST_NO_DB_ATTEMPTS = attempts;
// Workers inherit the server's actual monitor file; never replace/truncate it
// while loading the config in a different process.
if (!inheritedAttempts) writeFileSync(attempts, "");
export default defineConfig({
  testDir: "./tests/remote-e2e",
  globalSetup: "./tests/e2e/setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  use: { ...base.use, baseURL: "http://127.0.0.1:31470" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
  ],
  webServer: [
    {
      ...server!,
      env: {
        ...server!.env,
        OCLR_DEVELOPER_ORIGINS:
          "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:31468,http://127.0.0.1:31470",
      },
    },
    {
      command:
        "node --import tsx --import ./tests/fixtures/no-local-database.ts node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 31470",
      url: "http://127.0.0.1:31470/remote",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NODE_ENV: "development",
        OCLR_DATA_SOURCE: "remote",
        OCLR_API_BASE_URL: "http://127.0.0.1:3100",
        APP_URL: "http://127.0.0.1:31470",
        DATABASE_URL: "",
        TEST_DATABASE_URL: "",
        OCLR_MEDIA_DIR: "",
        OSU_CLIENT_ID: "",
        OSU_CLIENT_SECRET: "",
        PRIVACY_CONTACT_OSU_ID: "",
        ADMIN_OSU_IDS: "2708500,2709500",
        OCLR_TEST_NO_DB_ATTEMPTS: attempts,
      },
    },
  ],
});
