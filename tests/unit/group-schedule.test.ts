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
  endDate: "2026-12-12",
  times: defaultGroupScheduleTimes,
  timeZone: "Asia/Taipei",
};

it("pairs every team with each group opponent once in the inclusive weekend range", () => {
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

  const slots = matches.map(({ scheduledAt }) =>
    localDateTime(scheduledAt, options.timeZone),
  );
  expect(new Set(slots).size).toBe(matches.length);
  expect(slots).toEqual([
    "2026-12-05T20:00",
    "2026-12-05T21:00",
    "2026-12-05T22:00",
    "2026-12-06T20:00",
    "2026-12-06T21:00",
    "2026-12-06T22:00",
    "2026-12-12T20:00",
    "2026-12-12T21:00",
    "2026-12-12T22:00",
  ]);
  const teamDates = new Set<string>();
  for (const [index, { homeTeamId, awayTeamId }] of matches.entries()) {
    const date = slots[index].slice(0, 10);
    for (const teamId of [homeTeamId, awayTeamId]) {
      const key = `${teamId}:${date}`;
      expect(teamDates.has(key)).toBe(false);
      teamDates.add(key);
    }
  }
  expect(teamDates.has("a:2026-12-05")).toBe(true);
  expect(teamDates.has("a:2026-12-06")).toBe(true);
});

it("skips covered pairings and occupied slots and counts existing matches on the local day", () => {
  const matches = planGroupSchedule({
    ...options,
    groups: [{ name: "A", teamIds: ["a", "b", "c"] }],
    startDate: "2026-12-06",
    endDate: "2026-12-12",
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
        scheduledAt: new Date("2026-12-05T17:00:00Z"),
      },
      {
        roundId: "knockout",
        position: 2,
        homeTeamId: "x",
        awayTeamId: "y",
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

it("rejects reversed dates and a range with enough slots but too few distinct days", () => {
  const request = {
    ...options,
    groups: [{ name: "A", teamIds: ["a", "b", "c"] }],
    existing: [],
    startDate: "2026-12-05",
  };
  expect(() =>
    planGroupSchedule({ ...request, endDate: "2026-12-04" }),
  ).toThrow("The end date must be on or after the start date.");
  expect(() =>
    planGroupSchedule({ ...request, endDate: "2026-12-06" }),
  ).toThrow("Could not fit all matches with one match per team per day.");
});
