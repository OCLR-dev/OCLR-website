import { assertTestDatabase } from "./tests/database";
import { existsSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { announcements } from "./tests/fixtures/announcements";
import { englishStorage } from "./tests/fixtures/preferences";
const announcementsPath = join(
  tmpdir(),
  `oclr-e2e-announcements-${process.pid}.json`,
);
const bracketsPath =
  process.env.OCLR_TEST_BRACKETS_FILE ||
  join(tmpdir(), `oclr-e2e-brackets-${process.pid}.json`);
if (process.env.TEST_DATABASE_URL) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  // Provision only the explicit isolated test environment; both server and workers
  // use the canonical path so private storage works on macOS and Linux.
  const testMedia =
    process.env.OCLR_MEDIA_DIR ||
    join(realpathSync(tmpdir()), `oclr-browser-test-media-${process.pid}`);
  mkdirSync(testMedia, { recursive: true, mode: 0o700 });
  process.env.OCLR_MEDIA_DIR = realpathSync(testMedia);
  process.env.OCLR_TEST_BRACKETS_FILE = bracketsPath;
  process.env.OCLR_BRACKETS_FILE = bracketsPath;
  if (!existsSync(bracketsPath)) writeFileSync(bracketsPath, "[]");
  writeFileSync(announcementsPath, JSON.stringify(announcements));
}
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    storageState: englishStorage,
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10000,
  },
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
    {
      name: "firefox-header",
      testMatch: "header-overlap.spec.ts",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: process.env.TEST_DATABASE_URL
      ? "node --import tsx --import ./tests/fixtures/osu-provider.ts node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100"
      : "npm start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: process.env.TEST_DATABASE_URL
      ? {
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          OCLR_MEDIA_DIR:
            process.env.OCLR_MEDIA_DIR ||
            join(tmpdir(), `oclr-browser-test-media-${process.pid}`),
          ADMIN_OSU_IDS: "60001,70001,110001,120001",
          TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
          OSU_CLIENT_ID: "123",
          OSU_CLIENT_SECRET: "synthetic-browser-provider-secret",
          APP_URL: "http://127.0.0.1:3100",
          OCLR_DEVELOPER_ORIGINS:
            "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:31468",
          OCLR_BRACKETS_FILE: bracketsPath,
          OCLR_ANNOUNCEMENTS_FILE: announcementsPath,
          PRIVACY_CONTACT_OSU_ID: "60001",
        }
      : {},
  },
});
