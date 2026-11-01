import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { archiveTeamPlacement } from "../../src/lib/archive-placement";
import {
  proposedPlacements,
  proposeMetadata,
  matchMetadata,
  addVerifiedRoomDates,
  competitionPeriods,
} from "../../scripts/prepare-remaining-archive-metadata";
const source = (season: string) =>
  historicalArchiveSchema.parse(
    JSON.parse(readFileSync(`docs/imports/${season}-archive.json`, "utf8")),
  );

it.each(["s7", "s8", "s9", "s10"])(
  "prepares %s metadata without changing source or invalidating statistics",
  (season) => {
    const before = source(season);
    const original = structuredClone(before);
    const after = proposeMetadata(before);
    expect(before).toEqual(original);
    expect(after.players).toEqual(before.players);
    expect(after.pools).toEqual(before.pools);
    expect(after.finalPlacements).toHaveLength(before.teams.length);
    expect(new Set(after.finalPlacements!.map((r) => r.teamId)).size).toBe(
      before.teams.length,
    );
    for (const [i, m] of after.matches.entries()) {
      expect(m.score).toEqual(before.matches[i].score);
      expect(m.review).toEqual(before.matches[i].review);
      expect(m.scheduledAt).toEqual(before.matches[i].scheduledAt);
      expect(m.round).toBeDefined();
      if (!m.score && m.forfeitWinner === undefined)
        expect(m.adjudication?.kind).toBe("not-played");
    }
  },
);

it("separates S8's lower final from its deciding final and reconstructs every elimination band", () => {
  const after = proposeMetadata(source("s8"));
  expect(after.matches.find((m) => m.id === "match-37")!.round).toEqual({
    phase: "knockout",
    index: 5,
  });
  expect(after.matches.find((m) => m.id === "match-38")!.round).toEqual({
    phase: "final",
    index: 1,
  });
  const counts = new Map<string, number>();
  for (const p of after.finalPlacements!) {
    const key = `${p.placement.start}-${p.placement.end}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  expect(Object.fromEntries(counts)).toEqual({
    "1-1": 1,
    "2-2": 1,
    "3-3": 1,
    "4-4": 1,
    "5-6": 2,
    "7-8": 2,
    "9-12": 4,
    "13-16": 4,
  });
  const groupA = after.standings.filter((r) => r.group === "A");
  expect(groupA.every((r) => r.scope === "group" && r.official === false)).toBe(
    true,
  );
  const winner = after.teams.find((t) => t.name === "好幸福队")!;
  expect(archiveTeamPlacement(after, winner.id)).toMatchObject({
    start: 1,
    end: 1,
    official: false,
  });
  expect(groupA.find((r) => r.teamId === winner.id)!.placement?.start).toBe(1);
});

it("fails closed when an elimination source is removed or contradicts the played path", () => {
  const missing = source("s8");
  missing.matches = missing.matches.filter((m) => m.id !== "match-36");
  expect(() => proposedPlacements(missing)).toThrow();
  const wrong = source("s8");
  const final = wrong.matches.find((m) => m.id === "match-38")!;
  final.score = [5, 7];
  const preceding = wrong.matches.find((m) => m.id === "match-37")!;
  preceding.score = [3, 7];
  expect(() => proposedPlacements(wrong)).toThrow();
});

it("requires a complete S6 path and never creates a missing scheduled instant", () => {
  const before = source("s8");
  expect(() => proposedPlacements({ ...before, editionSlug: "s6" })).toThrow();
  const match = { ...before.matches[0], id: "gs-a1", scheduledAt: null };
  expect(matchMetadata("s2", match).format).toEqual({
    maxGames: 8,
    winsRequired: 5,
  });
  expect(match.scheduledAt).toBeNull();
  expect(() => matchMetadata("s8", { ...match, id: "unrecognized" })).toThrow(
    "Unreviewed round",
  );
});

it("uses actual UTC+8 competition days and preserves an unknown final date", () => {
  const archive = proposeMetadata(source("s10"));
  const actual = competitionPeriods(archive);
  expect(actual.season).toEqual({
    startsAt: "2025-03-14T00:00:00+08:00",
    endsAt: "2025-05-10T23:59:59+08:00",
    timeZone: "Asia/Shanghai",
    precision: "day",
  });
  archive.capturedOn = "2030-01-01";
  expect(competitionPeriods(archive)).toEqual(actual);
  const final = archive.matches.find((m) => m.id === "match-30")!;
  final.scheduledAt = null;
  delete final.roomOpenedAt;
  delete final.review;
  const unknown = competitionPeriods(archive);
  expect(unknown.season?.endsAt).toBeNull();
  expect(unknown.schedule.at(-1)).toMatchObject({ at: null, endAt: null });
});

it("adds only independently matched room facts and preserves missing scheduled time", () => {
  const archive = source("s8");
  archive.formatVersion = 2;
  const m = archive.matches[0];
  m.scheduledAt = null;
  const mpId = Number(m.mpUrls[0].split("/").at(-1));
  const reference = { season: "s8", fixtureId: m.id };
  const after = addVerifiedRoomDates(archive, [
    { mpId, roomOpenedAt: "2023-02-25T13:44:00Z", references: [reference] },
    {
      mpId: mpId + 1,
      roomOpenedAt: "2000-01-01T00:00:00Z",
      references: [reference],
    },
    {
      mpId,
      roomOpenedAt: "2000-01-01T00:00:00Z",
      references: [{ ...reference, season: "s9" }],
    },
  ]);
  expect(after.matches[0].roomOpenedAt).toBe("2023-02-25T13:44:00Z");
  expect(after.matches[0].scheduledAt).toBeNull();
  expect(archive.matches[0].roomOpenedAt).toBeUndefined();
  expect(
    addVerifiedRoomDates(after, [
      { mpId, roomOpenedAt: "2000-01-01T00:00:00Z", references: [reference] },
    ]),
  ).toEqual(after);
});
