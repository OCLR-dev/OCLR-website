import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: "**/header-overlap.spec.ts",
  projects: base.projects?.filter(
    (project) => project.name !== "firefox-header",
  ),
});
