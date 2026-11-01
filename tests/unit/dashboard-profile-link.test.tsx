import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Dashboard from "../../src/app/dashboard/page";
import { currentUser } from "../../src/lib/auth/user";
import { publicPlayer } from "../../src/lib/players";
import { playerParticipationHistory } from "../../src/lib/player-history";
import { RemoteDataError } from "../../src/lib/remote-errors";
import { playerApplications } from "../../src/lib/dashboard";
import { remoteMode } from "../../src/lib/data-source";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
vi.mock("../../src/lib/player-history", () => ({
  playerParticipationHistory: vi.fn(async () => []),
}));
vi.mock("../../src/components/player-history", () => ({
  PlayerHistory: ({ history }: { history: unknown }) => (
    <div data-history={JSON.stringify(history)} />
  ),
}));
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () =>
    Object.assign((message: string) => message, { locale: "en" }),
}));
vi.mock("../../src/lib/auth/user", () => ({ currentUser: vi.fn() }));
vi.mock("../../src/lib/players", () => ({ publicPlayer: vi.fn() }));
vi.mock("../../src/lib/dashboard", () => ({
  playerApplications: vi.fn(),
  statusCopy: {},
}));
vi.mock("../../src/lib/data-source", () => ({ remoteMode: vi.fn() }));
vi.mock("../../src/lib/osu-profiles", () => ({
  getOsuUserProfile: async () => null,
}));
vi.mock("../../src/components/avatar", () => ({ Avatar: () => null }));

function application(): Awaited<ReturnType<typeof playerApplications>>[number] {
  return {
    registration: {
      id: "69000000-0000-4000-8000-000000000001",
      editionSlug: edition.slug,
      userId: 277003,
      status: "accepted",
      source: "player",
      rulesVersion: "test-v1",
      eligibilityAcknowledged: true,
      eligibilityVerification: null,
      configurationVersion: 1,
      answers: {},
      attempt: 1,
      statusReason: null,
      draftUnavailableReason: null,
      createdAt: new Date("2026-11-01T10:00:00Z"),
      updatedAt: new Date("2026-11-01T10:00:00Z"),
    },
    edition,
    lastOperation: null,
    acknowledgedConfiguration: null,
    captainAssigned: false,
    withdrawable: false,
    reapplyAvailable: false,
  };
}

describe("dashboard OCLR profile navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(playerParticipationHistory).mockResolvedValue([]);
    vi.mocked(playerApplications).mockResolvedValue([]);
    vi.mocked(remoteMode).mockReturnValue(false);
    vi.mocked(currentUser).mockResolvedValue({
      osuId: 277003,
      username: "Synthetic account",
    });
  });
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
      expect(publicPlayer).not.toHaveBeenCalled();
      expect(playerParticipationHistory).toHaveBeenCalledWith(osuId);
      expect(html).toContain(`href="/players/${osuId}"`);
      expect(html).toContain(`href="https://osu.ppy.sh/users/${osuId}"`);
      expect(html).not.toContain(`href="/players/${osuId}?edition=`);
    },
  );
  it("links a login-only account without requiring public participation", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      osuId: 277003,
      username: "Synthetic private applicant",
    });
    vi.mocked(publicPlayer).mockResolvedValue([]);
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('href="/players/277003"');
    expect(publicPlayer).not.toHaveBeenCalled();
    expect(html).not.toContain(
      "Your OCLR profile is available after you have public tournament participation.",
    );
    expect(html).toContain('href="https://osu.ppy.sh/users/277003"');
  });
  it("keeps registration/account controls available when history fails, without claiming it is empty", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      osuId: 277003,
      username: "Synthetic account",
    });
    vi.mocked(playerParticipationHistory).mockRejectedValue(
      new Error("Synthetic DB interruption"),
    );
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('data-history="null"');
    expect(html).toContain("My registrations");
    expect(html).toContain('action="/auth/logout"');
  });
  it("does not turn remote authorization failures into an empty history", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      osuId: 277003,
      username: "Synthetic account",
    });
    vi.mocked(playerParticipationHistory).mockRejectedValue(
      new RemoteDataError("REMOTE_FORBIDDEN", 403),
    );
    const content = await Dashboard({ searchParams: Promise.resolve({}) });
    expect(content).toMatchObject({ props: { code: "REMOTE_FORBIDDEN" } });
  });
  it.each([
    ["accepted", false],
    ["accepted", true],
    ["pending", true],
  ] as const)(
    "opens the edition's player workspace for %s registrations with captain=%s",
    async (status, captainAssigned) => {
      const row = application();
      row.registration.status = status;
      row.captainAssigned = captainAssigned;
      vi.mocked(playerApplications).mockResolvedValue([row]);
      const html = renderToStaticMarkup(
        await Dashboard({ searchParams: Promise.resolve({}) }),
      );
      expect(html).toContain('href="/tournaments/test-cup/player/practice"');
      expect(html).toContain("PLAYER WORKSPACE");
      if (captainAssigned) {
        expect(html).toContain('href="/tournaments/test-cup/team"');
        expect(html).toContain('href="/tournaments/test-cup/draft/captain"');
      }
    },
  );
  it.each(["pending", "deferred", "rejected", "withdrawn"] as const)(
    "does not advertise a workspace for an unappointed %s applicant",
    async (status) => {
      const row = application();
      row.registration.status = status;
      vi.mocked(playerApplications).mockResolvedValue([row]);
      const html = renderToStaticMarkup(
        await Dashboard({ searchParams: Promise.resolve({}) }),
      );
      expect(html).not.toContain("/player/practice");
      expect(html).toContain('href="/tournaments/test-cup"');
    },
  );
  it.each(["archive", "unpublished", "missing", "remote"] as const)(
    "omits the direct-session workspace in %s context",
    async (context) => {
      const row = application();
      if (context === "archive")
        row.edition = { ...edition, archive: historicalArchive };
      if (context === "unpublished")
        row.edition = { ...edition, published: false };
      if (context === "missing") row.edition = undefined;
      if (context === "remote") vi.mocked(remoteMode).mockReturnValue(true);
      vi.mocked(playerApplications).mockResolvedValue([row]);
      const html = renderToStaticMarkup(
        await Dashboard({ searchParams: Promise.resolve({}) }),
      );
      expect(html).not.toContain("/player/practice");
    },
  );
  it("keeps each workspace link in its registration's edition", async () => {
    const first = application(),
      second = application();
    second.registration.id = "69000000-0000-4000-8000-000000000002";
    second.registration.editionSlug = "other-cup";
    second.edition = { ...edition, slug: "other-cup" };
    vi.mocked(playerApplications).mockResolvedValue([first, second]);
    const html = renderToStaticMarkup(
      await Dashboard({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('href="/tournaments/test-cup/player/practice"');
    expect(html).toContain('href="/tournaments/other-cup/player/practice"');
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
