import { beforeEach, describe, expect, it, vi } from "vitest";
import { edition } from "../fixtures/edition";
import { announcements } from "../fixtures/announcements";

const mocks = vi.hoisted(() => ({
  readTournaments: vi.fn(),
  db: vi.fn(),
  publicCompetition: vi.fn(),
  getAnnouncements: vi.fn(),
}));
vi.mock("../../src/lib/tournaments", () => ({
  readTournaments: mocks.readTournaments,
}));
vi.mock("../../src/db", () => ({ db: mocks.db }));
vi.mock("../../src/lib/public-competition", () => ({
  publicCompetition: mocks.publicCompetition,
}));
vi.mock("../../src/lib/announcements", () => ({
  getAnnouncements: mocks.getAnnouncements,
}));
vi.mock("../../src/lib/auth/config", () => ({ privacyReady: () => true }));

import { publicNewsContext, publicNewsItem } from "../../src/lib/public-news";

const now = new Date("2026-11-02T00:00:00Z");

describe("News retention in the shared page/API source", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAnnouncements.mockReturnValue([]);
    mocks.publicCompetition.mockResolvedValue(null);
    mocks.db.mockReturnValue({
      select: () => ({
        from: () => ({ innerJoin: () => ({ where: async () => [] }) }),
      }),
    });
  });

  it("avoids querying old competition sources while preserving public edition metadata and editorial news", async () => {
    const old = { ...edition, slug: "s10", season: "10" };
    mocks.readTournaments.mockResolvedValue([
      { edition: old, registrationPaused: false },
    ]);
    mocks.getAnnouncements.mockReturnValue(announcements);
    const result = await publicNewsContext(now);
    expect(result.editions).toEqual([old]);
    expect(result.items.map((item) => item.slug)).toEqual([
      "synthetic-announcement",
    ]);
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.publicCompetition).not.toHaveBeenCalled();
  });

  it("removes old detail URLs as well as list items and keeps S11 events on the same URLs", async () => {
    const current = { ...edition, season: "11" };
    mocks.readTournaments.mockResolvedValue([
      { edition: current, registrationPaused: false },
    ]);
    const before = await publicNewsContext(now);
    const item = before.items[0];
    expect(item).toBeDefined();
    mocks.readTournaments.mockResolvedValue([
      { edition: { ...current, season: "10" }, registrationPaused: false },
    ]);
    expect((await publicNewsContext(now)).items).toEqual([]);
    expect(await publicNewsItem(item.slug, now)).toBeUndefined();
    mocks.readTournaments.mockResolvedValue([
      { edition: current, registrationPaused: false },
    ]);
    expect(await publicNewsItem(item.slug, now)).toEqual(item);
  });

  it("loads competition updates only for eligible editions in a mixed directory", async () => {
    mocks.readTournaments.mockResolvedValue([
      {
        edition: { ...edition, slug: "s10", season: "10" },
        registrationPaused: false,
      },
      {
        edition: { ...edition, slug: "s11", season: "11" },
        registrationPaused: false,
      },
    ]);
    const result = await publicNewsContext(now);
    expect(result.editions).toHaveLength(2);
    expect(mocks.publicCompetition).toHaveBeenCalledExactlyOnceWith("s11");
    expect(
      result.items.every((item) =>
        item.source?.url.startsWith("/tournaments/s11/"),
      ),
    ).toBe(true);
  });
});
