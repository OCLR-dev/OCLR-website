import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bundledSeasonThemes } from "../fixtures/theme-assets";
import { seasonArtwork, seasonArtworkPair } from "../../src/lib/season-artwork";
import {
  seasonAppearances,
  type SeasonAppearance,
} from "../../src/lib/preferences";

describe("season page-heading artwork", () => {
  it("covers every registered season theme", () => {
    expect(
      new Set(bundledSeasonThemes.map((theme) => theme.appearance)),
    ).toEqual(new Set(seasonAppearances));
  });

  it("only uses images the matching theme stylesheet ships", () => {
    for (const theme of bundledSeasonThemes) {
      const declared = new Set(theme.assets);
      const artwork = seasonArtwork[theme.appearance as SeasonAppearance];
      for (const url of [artwork.light, artwork.dark])
        expect(declared, `${theme.appearance} ${url}`).toContain(url);
    }
  });

  it("has no artwork for a season without a registered theme", () => {
    expect(seasonArtworkPair(null)).toBeNull();
    expect(seasonArtworkPair(undefined)).toBeNull();
    expect(seasonArtworkPair("skyline-pop")).toEqual({
      light: "/themes/skyline-pop/coast.webp",
      dark: "/themes/skyline-pop/coast.webp",
    });
  });

  it("includes the original spectrum in both self-contained S6 backgrounds", () => {
    const spectrum = readFileSync(
      new URL(
        "../../public/themes/orbital-pulse/music-spectrum.svg",
        import.meta.url,
      ),
      "utf8",
    )
      .replace(/^<svg\b[^>]*>\s*/, "")
      .replace(/\s*<\/svg>\s*$/, "");
    for (const url of Object.values(seasonArtwork["orbital-pulse"])) {
      const field = readFileSync(
        new URL(`../../public${url}`, import.meta.url),
        "utf8",
      );
      expect(field).toContain(spectrum);
      expect(field).toContain('viewBox="0 0 640 240"');
      expect(field).not.toMatch(/<script\b|<image\b|(?:href|src)=/);
    }
  });
});
