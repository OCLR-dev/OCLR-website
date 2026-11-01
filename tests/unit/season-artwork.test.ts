import { describe, expect, it } from "vitest";
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
});
