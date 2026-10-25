import { describe, expect, it } from "vitest";
import { beatmapLinks } from "../../src/lib/beatmap-links";

describe("official beatmap actions", () => {
  it("keeps difficulty and set destinations distinct", () => {
    expect(beatmapLinks(3786810, 1843515)).toEqual({
      web: "https://osu.ppy.sh/beatmaps/3786810",
      direct: "osu://b/3786810",
    });
  });
  it("never treats a known difficulty as an unknown set ID", () => {
    expect(beatmapLinks(3786810, null)).toEqual({
      web: "https://osu.ppy.sh/beatmaps/3786810",
      direct: "osu://b/3786810",
    });
  });
  it("can use a verified set without a difficulty", () => {
    expect(beatmapLinks(null, 1843515)).toEqual({
      web: "https://osu.ppy.sh/beatmapsets/1843515",
      direct: "osu://s/1843515",
    });
  });
  it.each([
    undefined,
    null,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("omits invalid destinations for %s", (id) => {
    expect(beatmapLinks(id, id)).toEqual({
      web: null,
      direct: null,
    });
  });
});
