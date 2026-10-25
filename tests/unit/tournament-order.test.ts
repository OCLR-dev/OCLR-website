import { describe, expect, it } from "vitest";
import { compareTournamentSeasons } from "../../src/lib/tournament-order";
describe("numeric descending tournament seasons", () => {
  it("orders single/double digits and future seasons using the stored value", () => {
    const rows = ["10", "11", "7", "8", "9", "100", "12"].map((season, i) => ({
      season,
      slug: `unrelated-${i}`,
    }));
    expect(
      rows.sort(compareTournamentSeasons).map((row) => row.season),
    ).toEqual(["100", "12", "11", "10", "9", "8", "7"]);
  });
  it("puts nonnumeric/missing seasons last, keeps ties deterministic and preserves large numbers", () => {
    const rows = [
      { season: null, slug: "s999" },
      { season: "11", slug: "b" },
      { season: "011", slug: "a" },
      { season: "special", slug: "annual" },
      { season: "9999999999999999999999", slug: "large" },
      { season: "10000000000000000000000", slug: "larger" },
    ];
    expect(rows.sort(compareTournamentSeasons).map((row) => row.slug)).toEqual([
      "larger",
      "large",
      "a",
      "b",
      "annual",
      "s999",
    ]);
  });
});
