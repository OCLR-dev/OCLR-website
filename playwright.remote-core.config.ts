import { defineConfig } from "@playwright/test";
import remote from "./playwright.remote.config";
export default defineConfig({ ...remote, testIgnore: "**/full-site.spec.ts" });
