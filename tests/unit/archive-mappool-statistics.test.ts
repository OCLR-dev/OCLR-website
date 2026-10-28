import { describe, expect, it } from "vitest";
import {
  archivePoolFixtures,
  eventMappoolRows,
} from "../../src/lib/archive-mappool-statistics";
import type { HistoricalArchive } from "../../src/lib/historical-archive";
import type { StatisticsSnapshot } from "../../src/lib/archive-statistics-model";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import s10 from "../../docs/imports/s10-archive.json";
import evidence from "../../src/content/s10-match-pools.json";

function snapshot(poolId = "final", ids = [10001]): StatisticsSnapshot {
  const source = statisticsSource();
  source.games = ids.map((beatmapId, i) => ({
    ...source.games[0],
    id: i + 1,
    beatmapId,
  }));
  return {
    archiveKey: "a".repeat(64),
    poolId,
    source,
    included: source.games.map((g) => g.id),
  };
}
const archive = s10 as HistoricalArchive;
// The committed public pool evidence supplies identities only. These synthetic
// snapshots test projection; they are not claims of production publication.
const published = evidence.matches.map((m) => ({
  fixtureId: m.matchId,
  snapshot: snapshot(
    m.poolId,
    m.games.map((g) => g.beatmapId),
  ),
}));
const row = (round: string, mapId: number) =>
  eventMappoolRows([], archivePoolFixtures(archive, published), round).find(
    (r) => r.map.mapId === mapId,
  )!;

describe("historical pool eligibility and bans (#405, #406)", () => {
  it("uses five applicable Group A matches for the first HR2", () => {
    expect(row("Group A", 2708875)).toMatchObject({
      picks: 4,
      applicable: 5,
      unknown: 0,
      pickRate: 0.8,
      pickCoverage: "5 / 5",
    });
    expect(row("Group B", 2708875)).toMatchObject({
      applicable: 5,
      unknown: 0,
    });
  });
  it("unions fixtures when the same slot and beatmap survive both pools", () => {
    const rows = eventMappoolRows(
      [],
      archivePoolFixtures(archive, published),
      "Group A",
    );
    const shared = rows.filter((r) => r.map.mapId === 5015365);
    expect(shared).toHaveLength(1);
    expect(shared[0].applicable).toBe(10);
    expect(rows.filter((r) => r.map.slot === "HR2")).toHaveLength(2);
  });
  it("projects SF HD3 bans even without a single score row", () => {
    const sf = [21, 22, 23, 24].map((id) => ({
      fixtureId: `match-${id}`,
      snapshot: snapshot("sf", [
        id === 21
          ? 2572520
          : archive.pools.find((p) => p.id === "sf")!.maps[0].beatmapId!,
      ]),
    }));
    expect(
      eventMappoolRows([], archivePoolFixtures(archive, sf), "SF").find(
        (r) => r.map.mapId === 2572520,
      ),
    ).toMatchObject({
      picks: 1,
      pickRate: 0.25,
      bans: 2,
      banRate: 0.5,
      applicable: 4,
      banCoverage: "4 / 4",
    });
  });
  it("keeps missing score coverage separate from public, known ban coverage", () => {
    const a = structuredClone(statisticsArchive);
    Object.assign(a.matches[0], {
      poolId: "final",
      bansA: "NM1",
      bansB: "NM1",
    });
    const fixtures = archivePoolFixtures(a, []);
    expect(
      eventMappoolRows([], fixtures).find((r) => r.map.slot === "NM2"),
    ).toMatchObject({
      picks: null,
      pickRate: null,
      bans: 0,
      banRate: 0,
      pickCoverage: "0 / 1",
      banCoverage: "1 / 1",
    });
    expect(
      eventMappoolRows([], fixtures).find((r) => r.map.slot === "NM1"),
    ).toMatchObject({ bans: 2 });
  });
  it("retains missing/unparseable bans as unknown and known zero separately", () => {
    for (const raw of [null, "—", "NM9", "NM1 invalid", "NM1 NM1"]) {
      const a = structuredClone(statisticsArchive);
      Object.assign(a.matches[0], { poolId: "final", bansA: raw, bansB: null });
      expect(
        eventMappoolRows([], archivePoolFixtures(a, [])).find(
          (r) => r.map.slot === "NM2",
        ),
      ).toMatchObject({ bans: null, banRate: null, banCoverage: "0 / 1" });
    }
  });
  it("does not infer a missing pool from stage, bans, or a score's beatmap", () => {
    const a = structuredClone(statisticsArchive);
    a.matches.push({ ...a.matches[0], id: "unknown", poolId: null });
    const fixtures = archivePoolFixtures(a, [
      { fixtureId: "one", snapshot: snapshot() },
    ]);
    expect(fixtures[1].maps).toBeNull();
    expect(eventMappoolRows([], fixtures)[0]).toMatchObject({
      applicable: 1,
      unknown: 1,
      pickRate: null,
      banRate: null,
    });
  });
  it("shows known counts with partial coverage but withholds incomplete rates", () => {
    const a = structuredClone(statisticsArchive);
    Object.assign(a.matches[0], {
      poolId: "final",
      bansA: "NM1",
      bansB: "NM2",
    });
    a.matches.push({ ...a.matches[0], id: "uncovered", bansA: null });
    const fixtures = archivePoolFixtures(a, [
      { fixtureId: "one", snapshot: snapshot() },
    ]);
    expect(
      eventMappoolRows([], fixtures).find((r) => r.map.slot === "NM1"),
    ).toMatchObject({
      picks: 1,
      pickRate: null,
      bans: 1,
      banRate: null,
      applicable: 2,
      pickCoverage: "1 / 2",
      banCoverage: "1 / 2",
    });
  });
  it("rejects conflicting archive/published pools and ambiguous multi-pool bans", () => {
    const a = structuredClone(statisticsArchive);
    a.pools.push({
      ...a.pools[0],
      id: "second",
      maps: a.pools[0].maps.map((m) => ({
        ...m,
        beatmapId: m.beatmapId! + 10,
      })),
    });
    a.matches[0].bansA = "NM1";
    a.matches[0].bansB = "NM2";
    const p = [
      { fixtureId: "one", snapshot: snapshot() },
      { fixtureId: "one", snapshot: snapshot("second", [10011]) },
    ];
    expect(
      archivePoolFixtures(a, p)[0].bans.every((b) => b.maps === null),
    ).toBe(true);
    a.matches[0].poolId = "final";
    expect(archivePoolFixtures(a, p)[0].maps).toBeNull();
  });
  it("filters by team participation, counts that team's bans, and deduplicates replays", () => {
    const a = structuredClone(statisticsArchive);
    Object.assign(a.matches[0], { bansA: "NM1", bansB: "NM2" });
    const fixtures = archivePoolFixtures(a, [
      { fixtureId: "one", snapshot: snapshot("final", [10001, 10001]) },
    ]);
    const team = a.teams.find((t) => t.id === a.matches[0].teamA)!.name;
    const rows = eventMappoolRows([], fixtures, "", team);
    expect(rows.find((r) => r.map.slot === "NM1")).toMatchObject({
      picks: 1,
      pickRate: 1,
      bans: 1,
    });
    expect(rows.find((r) => r.map.slot === "NM2")).toMatchObject({
      picks: 0,
      bans: 0,
    });
    expect(eventMappoolRows([], fixtures, "", "Not a participant")).toEqual([]);
  });
  it("does not mutate historical text, scores or snapshots", () => {
    const before = JSON.stringify([archive, published]);
    eventMappoolRows([], archivePoolFixtures(archive, published));
    expect(JSON.stringify([archive, published])).toBe(before);
  });
});
