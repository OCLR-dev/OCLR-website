import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { archiveBracket } from "../../src/lib/archive-bracket";
import {
  approveArchiveMatches,
  historicalArchiveSchema,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";

function approvedS4() {
  const source = historicalArchiveSchema.parse(
    JSON.parse(readFileSync("docs/imports/s4-archive.json", "utf8")),
  );
  // Reproduce the approved-draw state in memory; never alter the import package.
  const pending = source.matches.filter((m) => m.review?.status === "pending");
  for (const match of pending)
    match.review!.workingScore = match.review!.rawScore;
  return approveArchiveMatches(
    source,
    pending.map((m) => m.id),
    {
      approvedOn: "2026-10-28",
      source: "Synthetic test approval of the five recorded draws",
    },
  );
}

it.each(["", "/edit"])(
  "keeps all 24 S4 group games and ten knockout games separate for source suffix %s",
  (suffix) => {
    const approved = approvedS4();
    approved.sourceUrl += suffix;
    approved.editionSlug = "renamed-edition";
    for (const archive of [approved, publicHistoricalArchive(approved)]) {
      const before = structuredClone(archive);
      const bracket = archiveBracket(archive, (id) => `/matches/${id}`)!;
      const groups = bracket.groups.filter((g) => g.layout === "grid");
      expect(groups.map((g) => g.label)).toEqual([
        "小组赛第1轮",
        "小组赛第2轮",
        "小组赛第3轮",
        "小组赛第4轮",
      ]);
      expect(groups.map((g) => g.rounds[0].matches.length)).toEqual([
        6, 6, 6, 6,
      ]);
      const groupGames = groups.flatMap((g) =>
        g.rounds.flatMap((r) => r.matches),
      );
      expect(groupGames.every((m) => m.id.startsWith("a"))).toBe(true);
      expect(
        groupGames.every((m) => m.slots.every((s) => s.sourceMatchId === null)),
      ).toBe(true);
      const knockout = bracket.groups
        .filter((g) => g.layout !== "grid")
        .flatMap((g) => g.rounds.flatMap((r) => r.matches));
      expect(knockout).toHaveLength(10);
      expect(knockout.every((m) => m.id.startsWith("k"))).toBe(true);
      expect(
        knockout.every((m) =>
          m.slots.every(
            (s) => !s.sourceMatchId || s.sourceMatchId.startsWith("k"),
          ),
        ),
      ).toBe(true);
      const all = [...groupGames, ...knockout];
      expect(new Set(all.map((m) => m.id)).size).toBe(34);
      for (const match of archive.matches) {
        expect(all.find((m) => m.id === match.id)?.scores).toEqual(
          match.score ?? [null, null],
        );
      }
      expect(groupGames.find((m) => m.id === "a22")).toMatchObject({
        scores: [null, null],
        winnerSlot: 1,
      });
      const draws = groupGames.filter(
        (m) => m.scores[0] === 5 && m.scores[1] === 5,
      );
      expect(draws.map((m) => m.id).sort()).toEqual([
        "a10",
        "a11",
        "a17",
        "a20",
        "a5",
      ]);
      expect(draws.every((m) => m.winnerSlot === null)).toBe(true);
      expect(archive).toEqual(before);
      expect(archive.standings).toEqual([]);
    }
  },
);

it("requires the evidenced workbook and stage label, rather than an editable S4 slug", () => {
  const archive = approvedS4();
  archive.editionSlug = "s4";
  for (const sourceUrl of [
    archive.sourceUrl + "-other",
    "https://example.com/s4",
  ]) {
    expect(
      archiveBracket({ ...archive, sourceUrl }, (id) => id)!.groups.every(
        (g) => g.layout !== "grid",
      ),
    ).toBe(true);
  }
  const changed = {
    ...archive,
    matches: archive.matches.map((m) => ({ ...m, stage: "Unknown phase" })),
  };
  expect(
    archiveBracket(changed, (id) => id)!.groups.every(
      (g) => g.layout !== "grid",
    ),
  ).toBe(true);
});
