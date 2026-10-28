import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerHistory } from "../../src/components/player-history";
import { playerHistoryModel } from "../../src/lib/player-history-model";
import type { PublishedPlayer } from "../../src/lib/players";
vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () => (message: string) => message,
}));
const uid = 361001;
const tournaments = [
  { slug: "beta", name: "Literal β", season: "5", status: "completed" },
  { slug: "s10", name: "Literal S10", season: "10", status: "completed" },
  { slug: "unknown", name: "Unknown order", season: null, status: "completed" },
  { slug: "s3", name: "Literal S3", season: "3", status: "completed" },
  { slug: "current", name: "Upcoming", season: "11", status: "upcoming" },
];
function fact(overrides: Partial<PublishedPlayer> = {}): PublishedPlayer {
  return {
    osuId: uid,
    username: "Old literal name",
    editionSlug: "s3",
    editionName: "S3",
    team: { id: "alpha", name: "Literal Alpha" },
    captain: false,
    participation: "historical",
    role: "player",
    ...overrides,
  };
}
describe("dashboard historical participation", () => {
  it("sorts by saved season, puts unknown seasons last and does not match names", () => {
    const records = playerHistoryModel(
      uid,
      [
        fact({ editionSlug: "beta" }),
        fact({ editionSlug: "s10", username: "Later name" }),
        fact(),
        fact({ editionSlug: "unknown" }),
        fact({ osuId: uid + 1, username: "Same display name" }),
        fact({ editionSlug: "unpublished" }),
        fact({ editionSlug: "current", participation: "accepted" }),
      ],
      tournaments,
    );
    expect(records.map((r) => r.editionSlug)).toEqual([
      "s10",
      "beta",
      "s3",
      "unknown",
    ]);
    expect(records[0].experiences[0].username).toBe("Later name");
    expect(JSON.stringify(records)).not.toContain("Same display name");
  });
  it("deduplicates identical facts, keeps different teams and roles, and prefers archive facts to imported registrations", () => {
    const records = playerHistoryModel(
      uid,
      [
        fact(),
        fact(),
        fact({ team: { id: "beta", name: "Literal Beta" } }),
        fact({ role: "coach" }),
        fact({ participation: "accepted", username: "Current native name" }),
      ],
      tournaments,
    );
    expect(records).toHaveLength(1);
    expect(records[0].experiences).toHaveLength(3);
    expect(JSON.stringify(records)).not.toContain("Current native name");
  });
  it("retains native captain plus multiple coaching roles in a completed edition", () => {
    const records = playerHistoryModel(
      uid,
      [
        fact({
          participation: "finalized_roster",
          role: undefined,
          captain: true,
          coachedTeams: [
            { id: "alpha", name: "Literal Alpha" },
            { id: "beta", name: "Literal Beta" },
          ],
        }),
      ],
      tournaments,
    );
    expect(records[0].experiences.map((p) => p.role)).toEqual([
      "captain",
      "coach",
      "coach",
    ]);
  });
  it("does not invent missing roles/teams and distinguishes failure from empty data", () => {
    const records = playerHistoryModel(
      uid,
      [fact({ role: undefined, participation: "accepted", team: null })],
      tournaments,
    );
    expect(records[0].experiences[0]).toMatchObject({ role: null, team: null });
    const html = renderToStaticMarkup(<PlayerHistory history={records} />);
    expect(html).toContain("Role not recorded");
    expect(html).toContain("Team not recorded");
    const failed = renderToStaticMarkup(<PlayerHistory history={null} />);
    expect(failed).toContain("temporarily unavailable");
    expect(failed).not.toContain("No historical participation");
    expect(renderToStaticMarkup(<PlayerHistory history={[]} />)).toContain(
      "No historical participation",
    );
  });
  it("keeps edition/team links scoped and never renders source or private metadata", () => {
    const records = playerHistoryModel(
      uid,
      [fact({ sourceReference: "PRIVATE_SOURCE_APPENDIX" })],
      tournaments,
    );
    const html = renderToStaticMarkup(<PlayerHistory history={records} />);
    expect(html).toContain('href="/tournaments/s3"');
    expect(html).toContain('href="/tournaments/s3/teams/alpha"');
    expect(html).not.toContain("PRIVATE_SOURCE_APPENDIX");
  });
});
