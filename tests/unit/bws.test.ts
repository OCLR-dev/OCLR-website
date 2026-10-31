import { describe, expect, it } from "vitest";
import {
  calculateBadgeWeightedPp,
  calculateBws,
  summarizeBws,
} from "../../src/lib/bws-model";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
const badge = {
  description: "Synthetic tournament",
  awarded_at: "2026-01-01T00:00:00Z",
  url: "https://osu.ppy.sh/wiki/en/Tournaments",
};
const profile = (badges: unknown, rank: unknown = 10000) =>
  normalizeOsuProfile(
    { id: 1, username: "Synthetic", badges, statistics: { global_rank: rank } },
    1,
    "osu",
  );
describe("badge-weighted seeding", () => {
  it("uses the official formula without rounding the numeric result", () => {
    expect(calculateBws(10000, 0)).toBe(10000);
    expect(calculateBws(10000, 1)).toBe(10000 ** 0.9937);
    for (let i = 0; i < 100; i++) {
      expect(calculateBws(10000, i)!).toBeLessThanOrEqual(10000);
      expect(calculateBws(10000, i + 1)!).toBeLessThanOrEqual(
        calculateBws(10000, i)!,
      );
      expect(calculateBws(1, i)).toBe(1);
    }
    expect(calculateBws(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(
      1,
    );
  });
  it("rejects unranked, fractional, unsafe and nonfinite inputs", () => {
    for (const rank of [
      null,
      undefined,
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "10000",
    ])
      expect(calculateBws(rank, 0)).toBeNull();
    for (const count of [
      null,
      undefined,
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "0",
    ])
      expect(calculateBws(10000, count)).toBeNull();
  });
  it("never equates missing/partial API badge data with zero eligible badges", () => {
    for (const badges of [
      undefined,
      null,
      {},
      [{}],
      [{ ...badge, awarded_at: "invalid" }],
      Array(101).fill(badge),
    ]) {
      const p = profile(badges);
      expect(p.badges).toBeNull();
      expect(
        summarizeBws({ profile: p, stale: false, notice: null }, null),
      ).toMatchObject({ status: "pending", value: null, badgeCount: null });
    }
    expect(
      summarizeBws({ profile: profile([]), stale: false, notice: null }, null),
    ).toMatchObject({ status: "ready", value: 10000, badgeCount: 0 });
  });
  it("requires complete explicit mode-aware review and excludes other awards", () => {
    const snapshot = {
      profile: profile([badge, badge, badge]),
      stale: false,
      notice: null,
    };
    expect(summarizeBws(snapshot, null).value).toBeNull();
    expect(
      summarizeBws(snapshot, ["osu", "unknown", "other"]).value,
    ).toBeNull();
    expect(summarizeBws(snapshot, ["osu", "taiko", "other"])).toMatchObject({
      badgeCount: 1,
      value: 10000 ** 0.9937,
    });
    expect(
      summarizeBws({ ...snapshot, stale: true }, ["osu", "taiko", "other"])
        .status,
    ).toBe("stale");
    expect(
      profile([{ ...badge, url: "javascript:alert(1)" }]).badges![0].url,
    ).toBeNull();
    // Badge artwork is retained only from the osu! asset host; the 2x field is
    // independent and may be missing on older or partial responses.
    const badgeArt = profile([
      {
        ...badge,
        image_url: "https://assets.ppy.sh/profile-badges/synthetic.png",
        "image@2x_url": "http://assets.ppy.sh/profile-badges/synthetic@2x.png",
      },
    ]).badges![0];
    expect(badgeArt.imageUrl).toBe(
      "https://assets.ppy.sh/profile-badges/synthetic.png",
    );
    expect(badgeArt.image2xUrl).toBeNull();
    expect(
      profile([
        {
          ...badge,
          image_url: "https://evil.example/profile-badges/synthetic.png",
        },
      ]).badges![0].imageUrl,
    ).toBeNull();
    expect(
      summarizeBws(
        { profile: profile([], null), stale: false, notice: null },
        null,
      ).status,
    ).toBe("unranked");
  });
});

describe("badge-weighted pp", () => {
  it("preserves the organizer formula and fractional precision", () => {
    expect(calculateBadgeWeightedPp(1234.567, 0)).toBe(1234.567);
    expect(calculateBadgeWeightedPp(1234.567, 1)).toBe(1234.567 ** 1.0063);
    expect(calculateBadgeWeightedPp(1234.567, 4)).toBe(
      1234.567 ** (1.0063 ** 16 / 1),
    );
    expect(calculateBadgeWeightedPp(0, 3)).toBe(0);
    expect(calculateBadgeWeightedPp(0.5, 2)).toBe(0.5 ** (1.0063 ** 4));
  });
  it("rejects invalid inputs and nonfinite intermediate or final results", () => {
    for (const pp of [null, undefined, -1, NaN, Infinity, "123"])
      expect(calculateBadgeWeightedPp(pp, 0)).toBeNull();
    for (const badges of [
      null,
      undefined,
      -1,
      0.5,
      NaN,
      Infinity,
      "1",
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(calculateBadgeWeightedPp(123, badges)).toBeNull();
    expect(calculateBadgeWeightedPp(Number.MAX_VALUE, 1)).toBeNull();
    expect(calculateBadgeWeightedPp(1000, Number.MAX_SAFE_INTEGER)).toBeNull();
  });
  it("keeps pp independent of rank, review and snapshot freshness", () => {
    const p = profile([badge, badge, badge], null);
    p.statistics.pp = 1234.567;
    const snapshot = { profile: p, stale: false, notice: null };
    expect(summarizeBws(snapshot, null)).toMatchObject({
      rawPp: 1234.567,
      adjustedPp: null,
      ppStatus: "pending",
    });
    expect(
      summarizeBws(snapshot, ["osu", "unknown", "other"]).adjustedPp,
    ).toBeNull();
    expect(summarizeBws(snapshot, ["osu", "taiko", "other"])).toMatchObject({
      value: null,
      adjustedPp: 1234.567 ** 1.0063,
      ppStatus: "ready",
      badgeCount: 1,
    });
    expect(
      summarizeBws({ ...snapshot, stale: true }, ["osu", "mania", "fruits"]),
    ).toMatchObject({ ppStatus: "stale", stale: true });
    expect(
      summarizeBws({ ...snapshot, notice: "Provider unavailable" }, null).stale,
    ).toBe(true);
    p.statistics.pp = 0;
    expect(summarizeBws(snapshot, ["other", "other", "other"]).adjustedPp).toBe(
      0,
    );
    p.statistics.pp = null;
    p.statistics.globalRank = 10000;
    expect(summarizeBws(snapshot, ["osu", "other", "other"])).toMatchObject({
      value: 10000 ** 0.9937,
      adjustedPp: null,
      ppStatus: "unavailable",
    });
    p.ruleset = "taiko";
    p.statistics.pp = 123;
    expect(summarizeBws(snapshot, ["osu", "osu", "osu"]).adjustedPp).toBeNull();
  });
});
