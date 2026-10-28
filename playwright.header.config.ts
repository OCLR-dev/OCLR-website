import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { headerMatrix } from "./tests/fixtures/header-matrix";
headerMatrix(
  process.env.OCLR_E2E_MATRIX ?? "full",
  process.env.OCLR_HEADER_APPEARANCES,
);
export default defineConfig({
  ...base,
  testMatch: "**/header-overlap.spec.ts",
  // Case-level sharding across runners, never concurrent workers in one DB.
  fullyParallel: true,
  workers: 1,
  projects: base.projects?.map((project) => ({
    ...project,
    ...(process.env.OCLR_E2E_MATRIX === "smoke" &&
    project.name === "firefox-header"
      ? { grep: /header overlays .* default$/ }
      : process.env.OCLR_HEADER_APPEARANCES && project.name === "firefox-header"
        ? {
            grep: new RegExp(
              "header overlays .* (default|" +
                process.env.OCLR_HEADER_APPEARANCES.split(",").join("|") +
                ")$",
            ),
          }
        : {}),
  })),
});
