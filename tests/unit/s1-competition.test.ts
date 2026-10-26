import { expect, it } from "vitest";
import { syntheticS1Archive } from "../fixtures/s1-presentation";
import { archiveBracket } from "../../src/lib/archive-bracket";
import { hasS1FinalStandings, isS1Archive } from "../../src/lib/s1-archive";
import { publicHistoricalArchive } from "../../src/lib/historical-archive";

it("separates S1's 30 round-robin games from its ten knockout games and final ranks", () => {
  for (const suffix of ["", "/edit"]) {
    const source = syntheticS1Archive("renamed-edition");
    source.sourceUrl += suffix;
    const snapshot = structuredClone(source);
    const projected = publicHistoricalArchive(source);
    expect(projected.sourceFacts).toBeUndefined();
    expect(hasS1FinalStandings(projected)).toBe(true);
    const bracket = archiveBracket(
      projected,
      (id) => `/private-preview?id=${id}`,
    )!;
    const groups = bracket.groups.filter((g) => g.layout === "grid");
    expect(groups.map((g) => g.label)).toEqual(["小组赛 A组", "小组赛 B组"]);
    expect(
      groups.map((g) => g.rounds.flatMap((r) => r.matches).length),
    ).toEqual([15, 15]);
    const groupGames = groups.flatMap((g) =>
      g.rounds.flatMap((r) => r.matches),
    );
    expect(
      groupGames.every((game) =>
        game.slots.every((slot) => slot.sourceMatchId === null),
      ),
    ).toBe(true);
    const knockout = bracket.groups
      .filter((g) => g.layout !== "grid")
      .flatMap((g) => g.rounds.flatMap((r) => r.matches));
    expect(knockout).toHaveLength(10);
    expect(knockout.every((m) => m.id.startsWith("es-"))).toBe(true);
    expect(
      knockout.every((m) =>
        m.slots.every(
          (s) => !s.sourceMatchId || s.sourceMatchId.startsWith("es-"),
        ),
      ),
    ).toBe(true);
    expect(source).toEqual(snapshot);
  }
});

it("does not classify by an editable slug, a similar URL or arbitrary standings", () => {
  const a = syntheticS1Archive("s1");
  expect(isS1Archive({ ...a, sourceUrl: a.sourceUrl + "-other" })).toBe(false);
  expect(
    hasS1FinalStandings({ ...a, sourceUrl: "https://example.com/s1" }),
  ).toBe(false);
  expect(hasS1FinalStandings({ ...a, standings: [] })).toBe(false);
  a.standings = a.standings.map((s) => ({ ...s, group: "A" }));
  expect(hasS1FinalStandings(a)).toBe(false);
  expect(isS1Archive(a)).toBe(true);
});
