import { describe, expect, it } from "vitest";
import {
  eventMapKey,
  eventPlacementRows,
  groupEventMaps,
} from "../../src/lib/event-statistics-model";
import type { EventScore } from "../../src/lib/event-statistics";
const score: EventScore = {
  player: "Synthetic Player",
  team: "Synthetic Team",
  round: "gs1",
  slot: "NM1",
  title: "Synthetic Map A",
  mapId: 1001,
  score: 800000,
  accuracy: 0.98,
  combo: 100,
  mods: "NM",
  mp: 1,
  game: "1",
  fixture: "one",
};
describe("event beatmap identity", () => {
  it("separates reused slots across maps and rounds while grouping the same map's plays", () => {
    const maps = groupEventMaps([
      score,
      { ...score, player: "Second Player", score: 700000 },
      { ...score, round: "gs2", mapId: 1002, title: "Synthetic Map B" },
      { ...score, mapId: 1003, title: "Synthetic Map C" },
      { ...score, round: "gs2" },
    ]);
    expect(maps.map((map) => map.plays.length)).toEqual([2, 1, 1, 1]);
    expect(new Set(maps.map((map) => map.key)).size).toBe(4);
    expect(new Set(maps.map((map) => map.label)).size).toBe(4);
  });
  it("keeps preview titles distinct when stable numeric IDs are unavailable", () => {
    const maps = groupEventMaps([
      { ...score, mapId: null },
      { ...score, mapId: null, title: "Synthetic Map B" },
    ]);
    expect(maps).toHaveLength(2);
    expect(eventMapKey({ ...score, title: "Changed display text" })).toBe(
      eventMapKey(score),
    );
  });
});

describe("event placement display filters (#342)", () => {
  const plays: EventScore[] = [
    { ...score, player: "A1", team: "A", score: 90 },
    { ...score, player: "A2", team: "A", score: 60 },
    { ...score, player: "B1", team: "B", score: 100 },
    { ...score, player: "B2", team: "B", score: 80 },
    {
      ...score,
      player: "A1",
      team: "A",
      slot: "HD1",
      mapId: 1002,
      game: "2",
      score: 120,
    },
    {
      ...score,
      player: "A2",
      team: "A",
      slot: "HD1",
      mapId: 1002,
      game: "2",
      score: 50,
    },
    {
      ...score,
      player: "B1",
      team: "B",
      slot: "HD1",
      mapId: 1002,
      game: "2",
      score: 110,
    },
    {
      ...score,
      player: "B1",
      team: "B",
      slot: "HR1",
      mapId: 1003,
      game: "3",
      score: 0,
    },
  ];
  const nm = eventMapKey(plays[0]);
  const hd = eventMapKey(plays[4]);
  const hr = eventMapKey(plays[7]);

  it.each(["team", "player"] as const)(
    "preserves every %s row when either team is selected",
    (by) => {
      const column = by === "team" ? "Team" : "Player";
      const all = eventPlacementRows(plays, by);
      for (const team of ["A", "B"]) {
        const selected = eventPlacementRows(plays, by, team);
        const names = new Set(
          plays.filter((play) => play.team === team).map((play) => play[by]),
        );
        expect(selected).toEqual(
          all.filter((row) => names.has(row[column] as string)),
        );
      }
      expect(eventPlacementRows(plays, by, "Unknown team")).toEqual([]);
      expect(eventPlacementRows([], by, "A")).toEqual([]);
    },
  );

  it("keeps team placements against opponents and missing maps unrecorded", () => {
    expect(eventPlacementRows(plays, "team", "A")).toEqual([
      {
        Team: "A",
        "Average placement": 1.5,
        "Average score": 160,
        [`${nm}:rank`]: 2,
        [`${nm}:score`]: 150,
        [`${hd}:rank`]: 1,
        [`${hd}:score`]: 170,
        [`${hr}:rank`]: null,
        [`${hr}:score`]: null,
      },
    ]);
    const b = eventPlacementRows(plays, "team", "B")[0];
    expect(b[`${hr}:score`]).toBe(0);
    expect(b[`${hr}:rank`]).toBe(1);
  });

  it("keeps individual placements global instead of ranking only teammates", () => {
    const a = eventPlacementRows(plays, "player", "A");
    expect(a[0]).toMatchObject({
      Player: "A1",
      "Average placement": 1.5,
      [`${nm}:rank`]: 2,
      [`${hd}:rank`]: 1,
    });
    expect(a[1]).toMatchObject({
      Player: "A2",
      "Average placement": 3.5,
      [`${nm}:rank`]: 4,
      [`${hd}:rank`]: 3,
    });
    const b2 = eventPlacementRows(plays, "player", "B").find(
      (row) => row.Player === "B2",
    )!;
    expect(b2["Average placement"]).toBe(3);
    expect(b2[`${hd}:rank`]).toBeNull();
    expect(b2[`${hd}:score`]).toBeNull();
  });

  it.each(["team", "player"] as const)(
    "respects round and map scope without shrinking the %s comparison to one team",
    (by) => {
      const later = [
        { ...plays[0], round: "final", mapId: 2001, game: "4", score: 200 },
        { ...plays[2], round: "final", mapId: 2001, game: "4", score: 50 },
      ];
      const scores = [...plays, ...later];
      const firstMap = scores.filter((play) => eventMapKey(play) === nm);
      const laterRound = scores.filter((play) => play.round === "final");
      expect(
        eventPlacementRows(firstMap, by, "A")[0]["Average placement"],
      ).toBe(2);
      const finalRow = eventPlacementRows(laterRound, by, "A")[0];
      expect(finalRow["Average placement"]).toBe(1);
      expect(finalRow[`${eventMapKey(later[0])}:rank`]).toBe(1);
      expect(finalRow).not.toHaveProperty(`${nm}:rank`);
    },
  );

  it("preserves best-attempt placement and per-game team averages", () => {
    const repeated = [
      ...plays,
      { ...plays[0], game: "replay", score: 110 },
      { ...plays[1], game: "replay", score: 50 },
    ];
    const a = eventPlacementRows(repeated, "team", "A")[0];
    expect(a[`${nm}:score`]).toBe(160);
    expect(a[`${nm}:rank`]).toBe(2);
    expect(a["Average score"]).toBe(160);
    expect(eventPlacementRows(repeated, "player", "A")[0][`${nm}:score`]).toBe(
      110,
    );
  });
});
