import { describe, it, expect } from "vitest";
import {
  practiceValueSchema,
  seasonAvailabilitySchema,
  normalizeSeasonAvailability,
  practiceContextValue,
} from "../../src/lib/player-workspace-model";
import {
  remoteApiSupported,
  remotePageSupported,
} from "../../src/lib/data-source";
describe("player workspace values", () => {
  it("requires bounded scores, ratings and comments", () => {
    const value = {
      score: 0,
      rating: 5,
      comment: "  Team note  ",
    };
    expect(practiceValueSchema.parse(value).comment).toBe("Team note");
    for (const extra of [
      { score: -1 },
      { score: 1.5 },
      { score: Number.MAX_SAFE_INTEGER + 1 },
      { accuracy: NaN },
      { accuracy: 101 },
      { accuracy: null },
      { rating: 0 },
      { rating: 6 },
      { comment: "x".repeat(2001) },
      { userId: 1 },
    ])
      expect(
        practiceValueSchema.safeParse({ ...value, ...extra }).success,
      ).toBe(false);
  });
  it("supports season slots, rejects reversed/offset-free times and preserves DST instants", () => {
    const slot = {
      start: "2030-11-03T01:30:00-04:00",
      end: "2030-11-03T01:30:00-05:00",
    };
    expect(
      normalizeSeasonAvailability(seasonAvailabilitySchema.parse([slot, slot])),
    ).toEqual([
      { start: "2030-11-03T05:30:00.000Z", end: "2030-11-03T06:30:00.000Z" },
    ]);
    expect(
      seasonAvailabilitySchema.safeParse(
        Array.from({ length: 200 }, () => slot),
      ).success,
    ).toBe(true);
    expect(
      seasonAvailabilitySchema.safeParse(
        Array.from({ length: 201 }, () => slot),
      ).success,
    ).toBe(false);
    expect(
      seasonAvailabilitySchema.safeParse([{ start: slot.end, end: slot.start }])
        .success,
    ).toBe(false);
    expect(
      seasonAvailabilitySchema.safeParse([
        { start: "2030-01-01T10:00:00", end: "2030-01-01T11:00:00" },
      ]).success,
    ).toBe(false);
  });
  it("does not expose personal tools through delegated route coverage", () => {
    for (const section of ["practice", "availability"]) {
      expect(remotePageSupported(`/tournaments/s11/player/${section}`)).toBe(
        false,
      );
      expect(remoteApiSupported(`/api/tournaments/s11/player/${section}`)).toBe(
        false,
      );
    }
  });
  it("binds a score to chart and mod context rather than authored labels", () => {
    const map = {
      beatmapId: 123,
      category: "NM",
      metadata: {
        setId: 1,
        artist: "A",
        title: "T",
        difficulty: "D",
        mapper: "M",
        stars: 4,
        bpm: 180,
        duration: 120,
      },
      fmMode: null,
      fmRestrictions: "",
    };
    const before = practiceContextValue(map);
    expect(
      practiceContextValue({
        ...map,
        metadata: { ...map.metadata, title: "Renamed" },
      }),
    ).toBe(before);
    for (const extra of [
      { beatmapId: 456 },
      { category: "HD" },
      { fmMode: "force_mod" },
      { fmRestrictions: "HD required" },
      { metadata: { ...map.metadata, checksum: "a" } },
    ])
      expect(practiceContextValue({ ...map, ...extra })).not.toBe(before);
  });
});
