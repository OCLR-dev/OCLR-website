import { expect, it } from "vitest";
import {
  defaultGroupScheduleTimes,
  planGroupSchedule,
} from "../../src/lib/group-schedule-model";
import { localDateTime } from "../../src/lib/edition-time";

const options = {
  groupRoundIds: new Set(["group", "another-group-round"]),
  roundId: "group",
  startDate: "2026-12-02",
  times: defaultGroupScheduleTimes,
  timeZone: "Asia/Taipei",
};

it("pairs every team with each group opponent once and schedules each team once per week", () => {
  const matches = planGroupSchedule({
    ...options,
    groups: [
      { name: "A", teamIds: ["a", "b", "c", "d"] },
      { name: "B", teamIds: ["e", "f", "g"] },
    ],
    existing: [],
  });
  expect(
    matches
      .map(({ homeTeamId, awayTeamId }) =>
        [homeTeamId, awayTeamId].sort().join(""),
      )
      .sort(),
  ).toEqual(["ab", "ac", "ad", "bc", "bd", "cd", "ef", "eg", "fg"]);

  const games = new Set<string>();
  const slots = matches.map(({ scheduledAt }) =>
    localDateTime(scheduledAt, options.timeZone),
  );
  expect(new Set(slots).size).toBe(matches.length);
  expect(slots.slice(0, 3)).toEqual([
    "2026-12-05T20:00",
    "2026-12-05T21:00",
    "2026-12-05T22:00",
  ]);
  matches.forEach(({ homeTeamId, awayTeamId }, index) => {
    const date = new Date(`${slots[index].slice(0, 10)}T00:00:00Z`);
    expect([0, 6]).toContain(date.getUTCDay());
    if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() - 1);
    for (const team of [homeTeamId, awayTeamId]) {
      const key = `${date.toISOString()}:${team}`;
      expect(games.has(key)).toBe(false);
      games.add(key);
    }
  });
});

it("skips covered pairings and occupied slots and defers a busy team to the next weekend", () => {
  const matches = planGroupSchedule({
    ...options,
    groups: [{ name: "A", teamIds: ["a", "b", "c"] }],
    startDate: "2026-12-06",
    existing: [
      {
        roundId: "another-group-round",
        position: 1,
        homeTeamId: "a",
        awayTeamId: "b",
        status: "scheduled",
        scheduledAt: null,
      },
      {
        roundId: "knockout",
        position: 1,
        homeTeamId: "a",
        awayTeamId: "x",
        status: "scheduled",
        scheduledAt: new Date("2026-12-06T12:00:45Z"),
      },
      {
        roundId: "group",
        position: 4,
        homeTeamId: "c",
        awayTeamId: "b",
        status: "cancelled",
        scheduledAt: new Date("2026-12-06T13:00:00Z"),
      },
    ],
  });
  expect(
    matches.map(({ homeTeamId, awayTeamId, scheduledAt, position }) => ({
      pair: [homeTeamId, awayTeamId].sort().join(""),
      scheduledAt,
      position,
    })),
  ).toEqual([
    { pair: "bc", scheduledAt: "2026-12-06T13:00:00.000Z", position: 5 },
    { pair: "ac", scheduledAt: "2026-12-12T12:00:00.000Z", position: 6 },
  ]);
});
