import { describe, expect, it } from "vitest";
import {
  overviewTournaments,
  overviewTournamentHref,
  overviewPageSize,
} from "../../src/lib/admin-overview-tournaments";

const rows = Array.from({ length: 29 }, (_, index) => ({
  slug: `event-${index + 1}`,
  season: String(index + 1),
  name: `${index < 17 ? "Legacy" : "Current"} Cup ${index + 1}`,
  status: (["completed", "live", "upcoming"] as const)[index % 3],
  published: index % 2 === 0,
}));
describe("authorized admin overview selection", () => {
  it("reaches every authorized row exactly once in the existing season order, with a partial tail", () => {
    const original = structuredClone(rows);
    const pages = [1, 2, 3].map((page) =>
      overviewTournaments(rows, { tournamentPage: String(page) }),
    );
    expect(pages.map((page) => page.rows.length)).toEqual([
      overviewPageSize,
      overviewPageSize,
      5,
    ]);
    expect(pages[0]).toMatchObject({ total: 29, pages: 3, page: 1 });
    const slugs = pages.flatMap((page) => page.rows.map((row) => row.slug));
    expect(slugs).toEqual([...rows].reverse().map((row) => row.slug));
    expect(new Set(slugs).size).toBe(29);
    expect(rows).toEqual(original);
  });
  it("searches the full authorized collection by name, combines tournament status and paginates the filtered result", () => {
    const query = { tournamentQuery: "  lEgAcY  " };
    const first = overviewTournaments(rows, query);
    const tail = overviewTournaments(rows, { ...query, tournamentPage: "2" });
    expect(first).toMatchObject({ query: "lEgAcY", total: 17, pages: 2 });
    expect(tail.rows.map((row) => row.slug)).toEqual([
      "event-5",
      "event-4",
      "event-3",
      "event-2",
      "event-1",
    ]);
    expect(
      overviewTournaments(rows, { ...query, tournamentStatus: "completed" }),
    ).toMatchObject({ total: 6, pages: 1 });
    expect(
      overviewTournaments(rows, { tournamentQuery: "event-1" }).total,
    ).toBe(0);
    expect(overviewTournaments(rows, { tournamentQuery: "   " }).total).toBe(
      29,
    );
    expect(
      overviewTournaments(rows, { tournamentStatus: "live" }).rows.every(
        (row) => row.status === "live",
      ),
    ).toBe(true);
  });
  it("never adds excluded identities or their counts and normalizes a page after access changes", () => {
    const assigned = rows.slice(0, 15);
    const second = overviewTournaments(assigned, { tournamentPage: "2" });
    expect(second).toMatchObject({ total: 15, page: 2, pages: 2 });
    expect(second.rows).toHaveLength(3);
    expect(
      overviewTournaments(assigned, { tournamentQuery: "Current" }).total,
    ).toBe(0);
    expect(
      overviewTournaments(assigned.slice(0, 1), { tournamentPage: "2" }),
    ).toMatchObject({ total: 1, page: 1, pages: 1 });
  });
  it("keeps deterministic ties, historical/draft rows and empty/no-match states", () => {
    const tied = rows.slice(0, 2).map((row) => ({ ...row, season: "1" }));
    expect(
      overviewTournaments(tied.reverse(), {}).rows.map((row) => row.slug),
    ).toEqual(["event-1", "event-2"]);
    expect(overviewTournaments([], {})).toMatchObject({
      total: 0,
      page: 1,
      pages: 1,
      rows: [],
    });
    expect(
      overviewTournaments(rows, { tournamentQuery: "No match" }),
    ).toMatchObject({ total: 0, page: 1, pages: 1, rows: [] });
    expect(
      overviewTournaments(rows, { tournamentQuery: "Legacy Cup 1" }).rows.some(
        (row) => !row.published,
      ),
    ).toBe(true);
  });
  for (const page of [
    "0",
    "-1",
    "2x",
    "1.5",
    "Infinity",
    "999999999999999999999",
    ["2", "3"],
  ])
    it(`handles invalid page ${JSON.stringify(page)} without an empty/unsafe page`, () => {
      expect(overviewTournaments(rows, { tournamentPage: page }).page).toBe(1);
    });
  it("clamps out-of-range pages and ignores invalid status/array filters", () => {
    expect(overviewTournaments(rows, { tournamentPage: "9999" })).toMatchObject(
      { page: 3 },
    );
    expect(
      overviewTournaments(rows, {
        tournamentStatus: "pending",
        tournamentQuery: ["Legacy"],
      }).total,
    ).toBe(29);
  });
  it("uses independent URL keys, preserves encoded filters, and resets/clears page state", () => {
    const filters = { query: "Legacy & 中文 + #", status: "completed" };
    const url = new URL(
      overviewTournamentHref(filters, 2),
      "https://oclr.example.test",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tournamentQuery: filters.query,
      tournamentStatus: "completed",
      tournamentPage: "2",
    });
    expect(url.hash).toBe("#accessible-tournaments");
    expect(overviewTournamentHref(filters)).not.toContain("tournamentPage");
    expect(overviewTournamentHref({ query: "", status: "" })).toBe(
      "/admin#accessible-tournaments",
    );
  });
});
