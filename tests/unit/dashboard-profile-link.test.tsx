import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Dashboard from "../../src/app/dashboard/page";
import { currentUser } from "../../src/lib/auth/user";
import { publicPlayer } from "../../src/lib/players";
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () =>
    Object.assign((message: string) => message, { locale: "en" }),
}));
vi.mock("../../src/lib/auth/user", () => ({ currentUser: vi.fn() }));
vi.mock("../../src/lib/players", () => ({ publicPlayer: vi.fn() }));
vi.mock("../../src/lib/dashboard", () => ({
  playerApplications: async () => [],
  statusCopy: {},
}));
vi.mock("../../src/lib/osu-profiles", () => ({
  getOsuUserProfile: async () => null,
}));
vi.mock("../../src/components/avatar", () => ({ Avatar: () => null }));
describe("dashboard OCLR profile navigation", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([277001, 277002])(
    "uses authenticated ID %s even without provider statistics",
    async (osuId) => {
      vi.mocked(currentUser).mockResolvedValue({
        osuId,
        username: "Same display name",
      });
      vi.mocked(publicPlayer).mockResolvedValue([
        {
          osuId,
          username: "Same display name",
          editionSlug: "test-cup",
          editionName: "Synthetic",
          team: null,
          captain: false,
          participation: "accepted",
        },
      ]);
      const html = renderToStaticMarkup(
        await Dashboard({ searchParams: Promise.resolve({}) }),
      );
      expect(publicPlayer).toHaveBeenCalledWith(osuId);
      expect(html).toContain(`href="/players/${osuId}"`);
      expect(html).toContain(`href="https://osu.ppy.sh/users/${osuId}"`);
      expect(html).not.toContain(`href="/players/${osuId}?edition=`);
    },
  );
  it("shows an unavailable state when no participation is public instead of linking to a 404", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      osuId: 277003,
      username: "Synthetic private applicant",
    });
    vi.mocked(publicPlayer).mockResolvedValue([]);
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain('href="/players/277003"');
    expect(html).toContain(
      "Your OCLR profile is available after you have public tournament participation.",
    );
    expect(html).toContain('href="https://osu.ppy.sh/users/277003"');
  });
});

vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () =>
    Object.assign((message: string) => message, { locale: "en" }),
}));
import { EventPlayers } from "../../src/components/event-players";
it("keeps the OCLR card link and team/Captain metadata without the standalone osu! label", () => {
  const html = renderToStaticMarkup(
    <EventPlayers
      edition="test-cup"
      remote
      preview
      grouped
      players={[
        {
          id: 277001,
          name: "Synthetic Captain",
          team: "Literal team",
          captain: true,
          rank: null,
          pp: null,
          href: "/players/277001?edition=test-cup",
        },
      ]}
    />,
  );
  expect(html).toContain('href="/players/277001?edition=test-cup"');
  expect(html).toContain("Captain");
  expect(html).toContain("Literal team");
  expect(html).not.toContain(">osu!</span>");
});
