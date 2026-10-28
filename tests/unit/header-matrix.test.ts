import { describe, expect, it } from "vitest";
import { appearances } from "../../src/lib/preferences";
import { locales } from "../../src/i18n/config";
import {
  headerMatrix,
  headerWidths,
  compactHeaderWidths,
} from "../fixtures/header-matrix";

describe("header regression coverage", () => {
  it("retains the full cross product by default", () => {
    const cases = headerMatrix();
    expect(cases).toHaveLength(appearances.length * locales.length * 2);
    expect(new Set(cases.map((c) => JSON.stringify(c))).size).toBe(
      cases.length,
    );
  });
  it("checks every appearance in both themes and all default languages in core", () => {
    const core = headerMatrix("smoke");
    for (const appearance of appearances)
      for (const theme of ["light", "dark"])
        expect(
          core.some((c) => c.appearance === appearance && c.theme === theme),
        ).toBe(true);
    for (const locale of locales)
      for (const theme of ["light", "dark"])
        expect(core).toContainEqual({ appearance: "default", locale, theme });
    expect(core.length).toBeLessThan(headerMatrix().length);
    expect(headerMatrix("smoke", "", true)).toHaveLength(locales.length * 2);
  });
  it("expands a changed appearance while preserving the rest of core", () => {
    const target = headerMatrix("full", "manga-halftone");
    for (const c of headerMatrix("smoke")) expect(target).toContainEqual(c);
    expect(
      target.filter((c) => c.appearance === "manga-halftone"),
    ).toHaveLength(locales.length * 2);
    expect(
      headerMatrix("full", "manga-halftone", true).every((c) =>
        ["default", "manga-halftone"].includes(c.appearance),
      ),
    ).toBe(true);
  });
  it("retains narrow screens and both sides of navigation breakpoints in core", () => {
    for (const width of [320, 390, 760, 950, 951, 1100, 1101, 1440])
      expect(headerWidths("smoke")).toContain(width);
    expect(compactHeaderWidths("smoke")).toContain(320);
    for (const width of headerWidths("smoke"))
      expect(headerWidths()).toContain(width);
  });
  it("rejects configuration that could silently produce no coverage", () => {
    expect(() => headerMatrix("other")).toThrow();
    expect(() => headerMatrix("full", "unknown")).toThrow();
    expect(() => headerMatrix("smoke", "manga-halftone")).toThrow();
    expect(() => headerWidths("other")).toThrow();
  });
});
