import { describe, expect, it } from "vitest";
import {
  cellState,
  daySlots,
  paintAvailability,
  weekStart,
} from "../../src/lib/player-timetable-model";
import {
  seasonAvailabilitySchema,
  normalizeSeasonAvailability,
} from "../../src/lib/player-workspace-model";
const at = (hour: string) => `2026-11-02T${hour}:00.000Z`;
const range = (start: string, end: string) => ({
  start: at(start),
  end: at(end),
});
describe("dated availability painting", () => {
  it("splits, overwrites and merges states without losing ranges outside the stroke", () => {
    const original = [range("08:15", "12:45")];
    const next = paintAvailability(
      original,
      at("09:00"),
      at("10:00"),
      "unsure",
    );
    expect(next).toEqual([
      range("08:15", "09:00"),
      { ...range("09:00", "10:00"), status: "unsure" },
      range("10:00", "12:45"),
    ]);
    expect(
      paintAvailability(next, at("09:00"), at("10:00"), "available"),
    ).toEqual(original);
    expect(
      paintAvailability(next, at("08:30"), at("11:00"), "unavailable"),
    ).toEqual([
      range("08:15", "08:30"),
      { ...range("08:30", "11:00"), status: "unavailable" },
      range("11:00", "12:45"),
    ]);
    expect(
      paintAvailability(next, at("09:30"), at("10:00"), "unfilled"),
    ).toEqual([
      range("08:15", "09:00"),
      { ...range("09:00", "09:30"), status: "unsure" },
      range("10:00", "12:45"),
    ]);
    expect(original).toEqual([range("08:15", "12:45")]);
  });
  it("keeps absence, explicit unavailable and partial legacy slots distinct", () => {
    expect(cellState([], at("08:00"), at("08:30"))).toBe("unfilled");
    expect(cellState([range("08:15", "09:00")], at("08:00"), at("08:30"))).toBe(
      "mixed",
    );
    expect(
      cellState(
        [range("08:00", "08:15"), range("08:15", "08:30")],
        at("08:00"),
        at("08:30"),
      ),
    ).toBe("available");
    expect(
      cellState(
        [{ ...range("08:00", "09:00"), status: "unavailable" }],
        at("08:00"),
        at("08:30"),
      ),
    ).toBe("unavailable");
  });
  it("validates disjoint explicit states and preserves legacy normalized payloads", () => {
    const old = [range("08:00", "09:00")];
    expect(
      normalizeSeasonAvailability(seasonAvailabilitySchema.parse(old)),
    ).toEqual(old);
    expect(
      seasonAvailabilitySchema.safeParse([{ ...old[0], status: "invalid" }])
        .success,
    ).toBe(false);
    expect(
      seasonAvailabilitySchema.safeParse([
        ...old,
        { ...range("08:30", "10:00"), status: "unsure" },
      ]).success,
    ).toBe(false);
    expect(
      seasonAvailabilitySchema.safeParse([
        ...old,
        { ...range("09:00", "10:00"), status: "unsure" },
      ]).success,
    ).toBe(true);
  });
});
describe("local dates and real half-hour columns", () => {
  it("converts midnight and week boundaries without changing instants", () => {
    const local = daySlots("2026-11-02", "Asia/Taipei");
    const utc = daySlots("2026-11-01", "UTC");
    expect(local).toHaveLength(48);
    expect(local[0]).toMatchObject({
      start: "2026-11-01T16:00:00.000Z",
      time: "00:00",
      offset: "UTC+8",
    });
    expect(utc.find((slot) => slot.start === local[0].start)?.time).toBe(
      "16:00",
    );
    expect(weekStart(local[0].start, "Asia/Taipei")).toBe("2026-11-02");
    expect(weekStart(local[0].start, "UTC")).toBe("2026-10-26");
  });
  it("includes both fall-back hours and skips spring-forward hours", () => {
    const fall = daySlots("2026-11-01", "America/New_York");
    expect(fall).toHaveLength(50);
    expect(
      fall.filter((slot) => slot.time === "01:30").map((slot) => slot.offset),
    ).toEqual(["UTC-4", "UTC-5"]);
    expect(new Set(fall.map((slot) => slot.start)).size).toBe(50);
    expect(daySlots("2026-03-08", "America/New_York")).toHaveLength(46);
    expect(
      daySlots("2026-03-08", "America/New_York").some((slot) =>
        slot.time.startsWith("02:"),
      ),
    ).toBe(false);
  });
  it("supports quarter-hour zones and half-hour clock changes", () => {
    expect(daySlots("2026-11-02", "Asia/Kathmandu")[0]).toMatchObject({
      time: "00:00",
      start: "2026-11-01T18:15:00.000Z",
    });
    expect(daySlots("2026-10-04", "Australia/Lord_Howe")).toHaveLength(47);
    expect(daySlots("2026-04-05", "Australia/Lord_Howe")).toHaveLength(49);
  });
});
