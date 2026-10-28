import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  assertBrowserExecutables,
  selectBrowsers,
} from "../../scripts/check-ci-browser";
import { addTiming, type FileTiming } from "../fixtures/ci-timing-reporter";

describe("preinstalled CI browsers", () => {
  it("pins official images to the installed Playwright version", () => {
    const workflow = readFileSync(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    const version = createRequire(import.meta.url)(
      "@playwright/test/package.json",
    ).version;
    const images = [
      ...workflow.matchAll(
        /image: mcr\.microsoft\.com\/playwright:v([0-9.]+)-noble@sha256:([a-f0-9]{64})/g,
      ),
    ];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image[1]).toBe(version);
  });
  it("fails before tests if the image lacks a browser executable", () => {
    const executables = [
      { name: "chromium", path: "/chromium" },
      { name: "firefox", path: "/firefox" },
    ];
    expect(() =>
      assertBrowserExecutables(executables, () => true),
    ).not.toThrow();
    expect(() =>
      assertBrowserExecutables(executables, (path) => path !== "/firefox"),
    ).toThrow(/firefox/);
  });
});
describe("CI timing evidence", () => {
  it("aggregates durations per project and spec without retaining result contents", () => {
    const rows: FileTiming[] = [];
    addTiming(rows, "draft.spec.ts", "desktop", {
      duration: 1000,
      status: "failed",
    });
    addTiming(rows, "draft.spec.ts", "desktop", {
      duration: 2000,
      status: "passed",
    });
    addTiming(rows, "draft.spec.ts", "mobile", {
      duration: 500,
      status: "skipped",
    });
    expect(rows).toEqual([
      {
        file: "draft.spec.ts",
        project: "desktop",
        attempts: 2,
        durationMs: 3000,
        failed: 1,
        skipped: 0,
      },
      {
        file: "draft.spec.ts",
        project: "mobile",
        attempts: 1,
        durationMs: 500,
        failed: 0,
        skipped: 1,
      },
    ]);
  });
});

describe("CI engine selection", () => {
  it("smoke-checks only Chromium for core and all engines for full", () => {
    expect(selectBrowsers(["chromium"]).map((engine) => engine.name())).toEqual(
      ["chromium"],
    );
    expect(selectBrowsers([]).map((engine) => engine.name())).toEqual([
      "chromium",
      "firefox",
      "webkit",
    ]);
    expect(() => selectBrowsers(["unknown"])).toThrow();
  });
});
