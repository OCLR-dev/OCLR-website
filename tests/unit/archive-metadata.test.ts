import { describe, expect, it } from "vitest";
import {
  historicalArchiveSchema,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";
import { archiveTeamPlacement } from "../../src/lib/archive-placement";
import { historicalArchive } from "../fixtures/historical-archive";

const metadata = () => ({
  ...structuredClone(historicalArchive),
  formatVersion: 2,
  season: {
    startsAt: "2020-11-21T00:00:00+08:00",
    endsAt: "2021-01-04T00:00:00+08:00",
    timeZone: "Asia/Shanghai",
  },
  finalPlacements: [
    {
      teamId: "alpha",
      placement: { start: 1, end: 1 },
      official: true,
      scope: "final",
      source: "Synthetic organizer approval",
    },
  ],
});
describe("structured archive metadata", () => {
  it("retains unknown boundaries and explicit day precision", () => {
    const a = metadata();
    const parsed = historicalArchiveSchema.parse({
      ...a,
      season: { ...a.season, endsAt: null, precision: "day" },
    });
    expect(publicHistoricalArchive(parsed).season).toEqual({
      ...a.season,
      endsAt: null,
      precision: "day",
    });
    expect(
      historicalArchiveSchema.safeParse({
        ...a,
        season: { ...a.season, startsAt: null, endsAt: null },
      }).success,
    ).toBe(false);
  });
  it("retains provenance dates separately and survives public projection", () => {
    const a = historicalArchiveSchema.parse(metadata());
    expect(a.capturedOn).toBe(historicalArchive.capturedOn);
    expect(publicHistoricalArchive(a).season).toEqual(a.season);
    expect(archiveTeamPlacement(a, "alpha")).toEqual({
      start: 1,
      end: 1,
      official: true,
      tied: false,
    });
  });
  it("rejects reversed/equal instants and invalid zones", () => {
    for (const endsAt of ["2020-11-20T00:00:00Z", "2020-11-20T16:00:00Z"]) {
      const a = metadata();
      a.season.endsAt = endsAt;
      expect(historicalArchiveSchema.safeParse(a).success).toBe(false);
    }
    const a = metadata();
    a.season.timeZone = "not/a-zone";
    expect(historicalArchiveSchema.safeParse(a).success).toBe(false);
  });
  it("validates references, uniqueness, required bounds and format version", () => {
    const a = metadata();
    for (const finalPlacements of [
      [...a.finalPlacements, ...a.finalPlacements],
      [{ ...a.finalPlacements[0], teamId: "unknown" }],
      [{ ...a.finalPlacements[0], placement: { start: 2, end: 1 } }],
      [{ ...a.finalPlacements[0], placement: { start: 1, end: 3 } }],
      [{ ...a.finalPlacements[0], placement: undefined }],
      [{ ...a.finalPlacements[0], scope: "group" }],
    ])
      expect(
        historicalArchiveSchema.safeParse({ ...a, finalPlacements }).success,
      ).toBe(false);
    expect(
      historicalArchiveSchema.safeParse({ ...a, formatVersion: 1 }).success,
    ).toBe(false);
  });
  it("never promotes legacy/group ranks or guesses from Chinese text", () => {
    const a = historicalArchiveSchema.parse(historicalArchive);
    expect(archiveTeamPlacement(a, "alpha")).toBeNull();
    const b = historicalArchiveSchema.parse(metadata());
    b.finalPlacements![0].placement = { start: 1, end: 2 };
    b.finalPlacements![0].tied = true;
    expect(archiveTeamPlacement(b, "alpha")).toMatchObject({
      start: 1,
      end: 2,
      tied: true,
    });
    expect(archiveTeamPlacement(b, null)).toBeNull();
  });
});

it("prepares S5 review material without selecting or publishing raw games", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (name: string) =>
    JSON.parse(readFileSync(`docs/imports/${name}.json`, "utf8"));
  const review = read("s5-metadata-review");
  expect(review.kind).toBe("historical-metadata-review-not-importable");
  expect(review.matches).toHaveLength(34);
  expect(
    review.matches.flatMap((m: { games: unknown[] }) => m.games),
  ).toHaveLength(332);
  expect(
    review.matches
      .flatMap((m: { games: { reviewStatus: string }[] }) => m.games)
      .every((g: { reviewStatus: string }) => g.reviewStatus === "pending"),
  ).toBe(true);
  const archive = historicalArchiveSchema.parse({
    ...read("s5-reviewed-import"),
    standings: review.standings,
    finalPlacements: review.finalPlacements,
  });
  expect(archiveTeamPlacement(archive, "a")).toEqual({
    start: 5,
    end: 6,
    tied: true,
    official: false,
  });
  expect(archiveTeamPlacement(archive, "d")).toEqual({
    start: 9,
    end: 12,
    tied: false,
    official: false,
  });
  expect(archiveTeamPlacement(archive, "g")).toMatchObject({
    start: 1,
    end: 1,
  });
  expect(
    archive.matches.every(
      (m) =>
        m.scheduledAt === null &&
        m.score === null &&
        m.review?.status === "pending",
    ),
  ).toBe(true);
  expect(archive.unresolvedPlayers).toHaveLength(15);
});

it("classifies structured phases independently of authored stage labels", async () => {
  const { competitionStage } =
    await import("../../src/lib/player-competition-model");
  expect(competitionStage("總決賽", { phase: "group" })).toBe("group");
  expect(competitionStage("小组赛", { phase: "final" })).toBe("knockout");
  expect(competitionStage(null, { phase: "qualifier" })).toBe("unknown");
  expect(competitionStage(null, { phase: "swiss" })).toBe("group");
});

it("keeps approval provenance private and validates typed match metadata", async () => {
  const { historicalSourceDetails } =
    await import("../fixtures/historical-source-details");
  const a = historicalSourceDetails();
  a.matches[0].review!.approval = {
    approvedOn: "2026-10-31",
    source: "Synthetic evidence",
    approvedBy: "Synthetic reviewer",
    evidenceUrl: "https://example.com/evidence",
  };
  a.matches[0].review!.status = "approved";
  a.matches[0].score = a.matches[0].review!.workingScore;
  a.matches[0].round = { phase: "knockout", index: 1 };
  a.matches[0].format = { bestOf: 11 };
  a.matches[0].timeZone = "Asia/Shanghai";
  const valid = historicalArchiveSchema.parse(a);
  expect(publicHistoricalArchive(valid).matches[0].review).toBeUndefined();
  expect(publicHistoricalArchive(valid).matches[0].round).toEqual({
    phase: "knockout",
    index: 1,
  });
  a.matches[0].format = { bestOf: 10 };
  expect(historicalArchiveSchema.safeParse(a).success).toBe(false);
});

it("records capped early-season formats without inventing an odd best-of", () => {
  for (const format of [
    { maxGames: 8, winsRequired: 5 },
    { maxGames: 10, winsRequired: 6 },
  ]) {
    const a = {
      ...structuredClone(historicalArchive),
      formatVersion: 2,
    };
    Object.assign(a.matches[0], { format });
    const parsed = historicalArchiveSchema.parse(a);
    expect(publicHistoricalArchive(parsed).matches[0].format).toEqual(format);
  }
  for (const format of [
    { maxGames: 8, winsRequired: 4 },
    { maxGames: 8, winsRequired: 9 },
    { maxGames: 0, winsRequired: 1 },
    { bestOf: 11, maxGames: 10, winsRequired: 6 },
  ])
    expect(
      historicalArchiveSchema.safeParse({
        ...historicalArchive,
        formatVersion: 2,
        matches: [{ ...historicalArchive.matches[0], format }],
      }).success,
    ).toBe(false);
});
