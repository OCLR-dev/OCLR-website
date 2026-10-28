import { defineConfig } from "@playwright/test";
import remote from "./playwright.remote.config";
export default defineConfig({
  ...remote,
  testIgnore: "**/full-site.spec.ts",
  metadata: {
    ...remote.metadata,
    remoteCore: process.env.OCLR_REMOTE_E2E_FULL !== "true",
  },
});
