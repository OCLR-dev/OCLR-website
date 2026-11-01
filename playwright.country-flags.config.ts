import { defineConfig, devices } from "@playwright/test";
import components from "./playwright.components.config";

/** Focused opt-in verification for #694; ordinary CI/browser scope is unchanged. */
export default defineConfig({
  ...components,
  testMatch: "country-flags.spec.ts",
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
