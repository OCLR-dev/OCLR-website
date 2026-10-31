import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledSeasonThemes } from "../fixtures/theme-assets";
import { seasonAccentPair, seasonAccents } from "../../src/lib/season-accent";
import {
  seasonAppearances,
  type SeasonAppearance,
} from "../../src/lib/preferences";

function declaredAccents(css: string) {
  const light: string[] = [];
  const dark: string[] = [];
  for (const match of css.matchAll(/--site-accent:\s*([^;]+);/g)) {
    const before = css.slice(0, match.index ?? 0);
    const open = before.lastIndexOf("{");
    const previous = Math.max(
      before.lastIndexOf("}"),
      before.lastIndexOf("{", open - 1),
    );
    const selector = before.slice(previous + 1, open).trim();
    const value = match[1].trim().toLowerCase();
    if (/\[data-theme="dark"\]/.test(selector)) dark.push(value);
    else light.push(value);
  }
  return { light, dark };
}

describe("season accents", () => {
  it("covers every registered season theme", () => {
    expect(new Set(bundledSeasonThemes.map((theme) => theme.appearance))).toEqual(
      new Set(seasonAppearances),
    );
  });

  it("matches the accent each theme actually declares", () => {
    for (const theme of bundledSeasonThemes) {
      const css = readFileSync(
        new URL(`../../src/app/${theme.stylesheet}`, import.meta.url),
        "utf8",
      );
      const declared = declaredAccents(css);
      const expected =
        seasonAccents[theme.appearance as SeasonAppearance];
      // One declaration for the light block, one for `[data-theme="dark"]`.
      expect(declared.light, theme.appearance).toEqual([expected.light]);
      expect(declared.dark, theme.appearance).toEqual([expected.dark]);
    }
  });

  it("has no accent for a season without a registered theme", () => {
    expect(seasonAccentPair(null)).toBeNull();
    expect(seasonAccentPair(undefined)).toBeNull();
    expect(seasonAccentPair("skyline-pop")).toEqual({
      light: "#006395",
      dark: "#83e7ff",
    });
  });
});
