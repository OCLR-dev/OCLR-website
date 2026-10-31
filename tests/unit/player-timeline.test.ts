import { describe, expect, it } from "vitest";
import { appearanceLabel } from "../../src/i18n/appearance";
import {
  axisFraction,
  buildPlayerTimeline,
  logAxisFraction,
  readSeasonWindows,
  seasonNumber,
  timelineOrigin,
  type SeasonWindow,
  type TimelineEdition,
} from "../../src/lib/player-timeline";
import content from "../../src/content/season-timeline.json" with { type: "json" };

const now = new Date("2024-01-01T00:00:00.000Z");

function edition(
  editionName: string,
  season: string | null,
  matches: string[],
): TimelineEdition {
  return {
    editionSlug: editionName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    editionName,
    season,
    matches: matches.map((at) => ({ at })),
  };
}

describe("seasonNumber", () => {
  it("normalizes every stored season form", () => {
    expect(seasonNumber("10")).toBe(10);
    expect(seasonNumber("S9")).toBe(9);
    expect(seasonNumber("s03")).toBe(3);
    expect(seasonNumber("Season 10")).toBe(10);
    expect(seasonNumber(" 3 ")).toBe(3);
    expect(seasonNumber(7)).toBe(7);
  });

  it("rejects values that are not a season", () => {
    expect(seasonNumber(null)).toBeNull();
    expect(seasonNumber(undefined)).toBeNull();
    expect(seasonNumber("")).toBeNull();
    expect(seasonNumber("0")).toBeNull();
    expect(seasonNumber(0)).toBeNull();
    expect(seasonNumber("final")).toBeNull();
  });
});

describe("axis scales", () => {
  // 2007-07-01, the osu! release the axis starts at.
  const start = timelineOrigin;
  const end = Date.UTC(2026, 9, 31);

  it("places a linear axis between its two bounds", () => {
    expect(axisFraction(start, start, end)).toBe(0);
    expect(axisFraction(end, start, end)).toBe(1);
    expect(axisFraction((start + end) / 2, start, end)).toBeCloseTo(0.5, 6);
    expect(axisFraction(start - 1, start, end)).toBe(0);
    expect(axisFraction(end + 1, start, end)).toBe(1);
    expect(axisFraction((start + end) / 2, end, start)).toBe(0);
  });

  it("anchors the log axis at the right edge", () => {
    expect(logAxisFraction(start, start, end)).toBe(0);
    expect(logAxisFraction(end, start, end)).toBe(1);
    expect(logAxisFraction(end + 30 * 86_400_000, start, end)).toBe(1);
    // The early years give their space back; only the right edge is fixed.
    const middle = (start + end) / 2;
    expect(logAxisFraction(middle, start, end)).toBeLessThan(
      axisFraction(middle, start, end),
    );
  });

  it("keeps the log axis monotonic", () => {
    let previous = -1;
    for (let year = 2007; year <= 2026; year += 1) {
      const value = logAxisFraction(Date.UTC(year, 0, 1), start, end);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("gives recent seasons more room than a linear axis", () => {
    const march = Date.UTC(2025, 2, 9);
    const april = Date.UTC(2025, 3, 27);
    const linear =
      axisFraction(april, start, end) - axisFraction(march, start, end);
    const log =
      logAxisFraction(april, start, end) - logAxisFraction(march, start, end);
    expect(log).toBeGreaterThan(linear * 2);
  });
});

describe("readSeasonWindows", () => {
  it("expands date-only bounds to whole UTC days", () => {
    const [window] = readSeasonWindows({
      seasons: [
        {
          season: 10,
          appearance: "skyline-pop",
          start: "2025-03-14",
          end: "2025-05-10",
        },
      ],
    });
    expect(window.start).toBe("2025-03-14T00:00:00.000Z");
    expect(window.end).toBe("2025-05-10T23:59:59.999Z");
  });

  it("keeps instants that carry a zone and rejects ambiguous ones", () => {
    const [window] = readSeasonWindows({
      seasons: [
        {
          season: 1,
          start: "2025-03-14T08:00:00+08:00",
          end: "2025-05-10T00:00",
        },
      ],
    });
    expect(window.start).toBe("2025-03-14T00:00:00.000Z");
    expect(window.end).toBeNull();
  });

  it("drops one bad row without hiding the rest", () => {
    const windows = readSeasonWindows({
      seasons: [
        { season: 2, appearance: "not-a-theme", start: "nope", end: null },
        { season: "3" },
        { season: 2, appearance: "verdant-prelude" },
        { season: 4, start: 12 },
      ],
    });
    expect(windows.map((window) => window.season)).toEqual([2, 4]);
    expect(windows[0]).toMatchObject({
      appearance: null,
      start: null,
      end: null,
    });
    expect(windows[1]).toMatchObject({ appearance: null, end: null });
  });

  it("tolerates a file that is not a season list", () => {
    expect(readSeasonWindows(null)).toEqual([]);
    expect(readSeasonWindows({ seasons: "10" })).toEqual([]);
    expect(readSeasonWindows({})).toEqual([]);
  });
});

describe("buildPlayerTimeline", () => {
  const windows: SeasonWindow[] = [
    {
      season: 9,
      appearance: "glacier-blue",
      start: "2023-11-04T00:00:00.000Z",
      end: "2023-12-10T00:00:00.000Z",
    },
    { season: 10, appearance: "skyline-pop", start: null, end: null },
    { season: 11, appearance: null, start: null, end: null },
  ];

  it("places a fixed season window and a recorded one", () => {
    const timeline = buildPlayerTimeline({
      editions: [
        edition("OCLR S9", "S9", ["2023-11-05T00:00:00.000Z"]),
        edition("OCLR S10", "10", [
          "2025-03-20T00:00:00.000Z",
          "2025-05-01T00:00:00.000Z",
        ]),
      ],
      now,
      windows,
    });
    expect(timeline.start).toBe(new Date(timelineOrigin).toISOString());
    expect(timeline.end).toBe(now.toISOString());
    expect(timeline.spans).toEqual([
      {
        key: "season-9",
        season: 9,
        appearance: "glacier-blue",
        editionName: "OCLR S9",
        editionSlug: "oclr-s9",
        start: "2023-11-04T00:00:00.000Z",
        end: "2023-12-10T00:00:00.000Z",
        point: false,
        provisional: false,
        participated: true,
      },
      {
        key: "season-10",
        season: 10,
        appearance: "skyline-pop",
        editionName: "OCLR S10",
        editionSlug: "oclr-s10",
        start: "2025-03-20T00:00:00.000Z",
        end: "2025-05-01T00:00:00.000Z",
        point: false,
        provisional: true,
        participated: true,
      },
    ]);
  });

  it("shows a season window the player skipped as an unplayed span", () => {
    const timeline = buildPlayerTimeline({ editions: [], now, windows });
    expect(timeline.spans).toEqual([
      {
        key: "season-9",
        season: 9,
        appearance: "glacier-blue",
        editionName: null,
        editionSlug: null,
        start: "2023-11-04T00:00:00.000Z",
        end: "2023-12-10T00:00:00.000Z",
        point: false,
        provisional: false,
        participated: false,
      },
    ]);
    expect(timeline.marks).toEqual([]);
  });

  it("ignores a played season whose matches have no date", () => {
    const timeline = buildPlayerTimeline({
      editions: [edition("OCLR S10", "S10", ["Soon"])],
      now,
      windows: [],
    });
    expect(timeline.spans).toEqual([]);
  });

  it("falls back to a recorded span for a season missing from the file", () => {
    const timeline = buildPlayerTimeline({
      editions: [
        edition("OCLR S8", "8", [
          "2023-02-25T00:00:00.000Z",
          "2023-04-09T00:00:00.000Z",
        ]),
      ],
      now,
      windows: [],
    });
    expect(timeline.spans).toHaveLength(1);
    expect(timeline.spans[0]).toMatchObject({
      key: "season-8",
      appearance: null,
      editionSlug: "oclr-s8",
      point: false,
      provisional: true,
      participated: true,
      start: "2023-02-25T00:00:00.000Z",
      end: "2023-04-09T00:00:00.000Z",
    });
  });

  it("draws a season with one confirmed bound as a dated point", () => {
    const timeline = buildPlayerTimeline({
      editions: [],
      editionPool: [{ season: "11", slug: "oclr-s11" }],
      now,
      windows: [
        {
          season: 11,
          appearance: null,
          start: "2026-11-26T00:00:00.000Z",
          end: null,
        },
      ],
    });
    expect(timeline.spans).toEqual([
      {
        key: "season-11",
        season: 11,
        appearance: null,
        editionName: null,
        editionSlug: "oclr-s11",
        start: "2026-11-26T00:00:00.000Z",
        end: "2026-11-26T00:00:00.000Z",
        point: true,
        provisional: false,
        participated: false,
      },
    ]);
  });

  it("links a skipped season to its published edition", () => {
    const timeline = buildPlayerTimeline({
      editions: [],
      editionPool: [{ season: "S4", slug: "s4-azure-brush" }],
      now,
      windows: [
        {
          season: 4,
          appearance: "azure-brush",
          start: "2020-06-06T00:00:00.000Z",
          end: "2020-07-20T00:00:00.000Z",
        },
      ],
    });
    expect(timeline.spans[0].editionSlug).toBe("s4-azure-brush");
  });

  it("prefers the joined edition over the published pool", () => {
    const timeline = buildPlayerTimeline({
      editions: [edition("OCLR S9", "9", [])],
      editionPool: [{ season: 9, slug: "s9-from-pool" }],
      now,
      windows,
    });
    expect(timeline.spans[0].editionSlug).toBe("oclr-s9");
  });

  it("orders marks joined, last seen and updated, dropping unknown dates", () => {
    const timeline = buildPlayerTimeline({
      editions: [],
      joinedAt: "2016-05-12T10:20:30.000Z",
      lastSeenAt: "not a date",
      updatedAt: "2026-10-31T06:00:00.000Z",
      now,
      windows: [],
    });
    expect(timeline.marks).toEqual([
      { kind: "joined", at: "2016-05-12T10:20:30.000Z" },
      { kind: "updated", at: "2026-10-31T06:00:00.000Z" },
    ]);
  });

  it("never ends the axis before it starts", () => {
    const timeline = buildPlayerTimeline({
      editions: [],
      now: new Date("2007-07-02T00:00:00.000Z"),
      windows: [],
    });
    expect(timeline.end).toBe("2007-07-02T00:00:00.000Z");
  });
});

describe("shipped season timeline file", () => {
  const windows = readSeasonWindows(content);

  it("parses every registered season", () => {
    expect(windows).toHaveLength(11);
    expect(windows.map((window) => window.season)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("names the theme the season label belongs to", () => {
    for (const window of windows) {
      if (window.appearance === null) continue;
      expect(appearanceLabel(window.appearance, (message) => message)).toMatch(
        new RegExp(`^S${window.season} · `),
      );
    }
  });
});
