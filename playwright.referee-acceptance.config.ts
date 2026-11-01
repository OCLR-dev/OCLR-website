import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Explicitly requested, isolated cross-process acceptance; never ordinary CI.
export default defineConfig({
  ...base,
  testMatch: "referee-acceptance.spec.ts",
  timeout: 240000,
  webServer: undefined,
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:31475",
    trace: "off",
    screenshot: "off",
  },
  projects: base.projects?.filter((p) => p.name !== "firefox-header"),
});
