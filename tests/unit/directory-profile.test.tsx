import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Players from "../../src/app/tournaments/[edition]/players/page";
import { publicPlayers, publicPlayersForEditions } from "../../src/lib/players";
import { getPublicEdition } from "../../src/lib/content";
import {
  cachedDirectoryStatistics,
  refreshDirectoryStatistics,
} from "../../src/lib/osu-profiles";
import { getDirectoryOtrRatings } from "../../src/lib/otr-rating";
import { english } from "../../src/i18n/translate";
import messages from "../../messages/en.json";
import { edition } from "../fixtures/edition";
const callbacks = vi.hoisted(() => [] as (() => Promise<void>)[]);
const importedRows = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => callbacks.push(callback),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw Error("NOT_FOUND");
  },
}));
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("../../src/lib/auth/user", () => ({ currentUser: async () => null }));
vi.mock("../../src/lib/player-messages", () => ({
  publicPlayerIntroductions: async () => new Map(),
}));
vi.mock("../../src/lib/player-identity", () => ({
  visiblePlayerNames: async () => [],
}));
vi.mock("../../src/lib/players", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/players")>()),
  publicPlayers: vi.fn(),
  publicPlayersForEditions: vi.fn(),
}));
vi.mock("../../src/lib/draft-reads", () => ({
  releasedDraftData: async () => null,
}));
vi.mock("../../src/lib/content", () => ({ getPublicEdition: vi.fn() }));
vi.mock("../../src/db", () => ({
  db: () => ({
    transaction: (read: () => unknown) => read(),
    select: () => ({ from: () => ({ where: importedRows }) }),
  }),
  readOnlyData: (read: () => unknown) => read(),
}));
vi.mock("../../src/lib/tournament-reads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/tournament-reads")>()),
  readTournament: vi.fn(async () => {
    const current = await getPublicEdition(edition.slug);
    return current
      ? {
          edition: current,
          revision: 1,
          updatedAt: new Date("2026-10-23T00:00:00Z"),
        }
      : undefined;
  }),
}));
vi.mock("../../src/lib/osu-profiles", () => ({
  cachedDirectoryStatistics: vi.fn(),
  refreshDirectoryStatistics: vi.fn(),
}));
vi.mock("../../src/lib/otr-rating", () => ({
  getDirectoryOtrRatings: vi.fn(),
}));
function result() {
  return {
    rows: [
      {
        osuId: 1220001,
        username: "Synthetic Player",
        editionSlug: edition.slug,
        editionName: edition.name,
        team: null,
        captain: false,
        participation: "accepted" as const,
      },
    ],
    total: 1,
    filters: { edition: edition.slug, q: "", page: 1 },
  };
}
async function html(query = {}, slug = edition.slug) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {await Players({
        params: Promise.resolve({ edition: slug }),
        searchParams: Promise.resolve(query),
      })}
    </NextIntlClientProvider>,
  );
}
describe("cache-first edition player cards", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubEnv("DATABASE_URL", "postgresql://synthetic@localhost/unit_test");
    callbacks.length = 0;
    vi.mocked(getPublicEdition).mockResolvedValue(edition);
    vi.mocked(publicPlayers).mockResolvedValue(result());
    vi.mocked(publicPlayersForEditions).mockResolvedValue(result());
    vi.mocked(cachedDirectoryStatistics).mockResolvedValue({
      statistics: new Map([
        [
          1220001,
          {
            globalRank: 12345,
            pp: 7890.45,
            fetchedAt: "2026-10-23T00:00:00Z",
            stale: true,
          },
        ],
      ]),
      refreshIds: [1220001],
      art: new Map(),
    });
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("renders minimal cached stats and separate canonical links before any refresh", async () => {
    const page = await html();
    expect(page).toContain("#12,345");
    expect(page).toContain("7,890.45");
    expect(page).not.toContain("osu!standard");
    expect(page).not.toContain("SAVED SNAPSHOT");
    expect(page).toContain('dateTime="2026-10-23T00:00:00Z"');
    expect(page).toContain('href="https://osu.ppy.sh/users/1220001"');
    expect(page).toContain('href="/players/1220001?edition=test-cup"');
    expect(page).not.toContain("Player profile &amp; statistics");
    expect(cachedDirectoryStatistics).toHaveBeenCalledExactlyOnceWith(
      [1220001],
      undefined,
    );
    expect(refreshDirectoryStatistics).not.toHaveBeenCalled();
    expect(getDirectoryOtrRatings).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    await callbacks[0]();
    expect(refreshDirectoryStatistics).toHaveBeenCalledExactlyOnceWith(
      [1220001],
      expect.any(Function),
    );
  });
  it("rechecks publication after rendering before requesting refresh", async () => {
    await html();
    vi.mocked(publicPlayers).mockResolvedValue({
      ...result(),
      rows: [],
      total: 0,
    });
    await callbacks[0]();
    const [, readVisibleIds] = vi.mocked(refreshDirectoryStatistics).mock
      .calls[0];
    expect(await readVisibleIds()).toEqual(new Set());
    expect(publicPlayers).toHaveBeenCalledExactlyOnceWith({
      edition: edition.slug,
    });
  });
  it("keeps identity/navigation available when the cache fails and does not start upstream work", async () => {
    vi.mocked(cachedDirectoryStatistics).mockRejectedValue(
      Error("PRIVATE_DATABASE_ERROR"),
    );
    const page = await html();
    expect(page).toContain("Synthetic Player");
    expect(page.match(/<dd>—<\/dd>/g)).toHaveLength(2);
    expect(page).not.toContain("PRIVATE_DATABASE_ERROR");
    expect(callbacks).toHaveLength(0);
  });
  it("never queries stats for a private edition or malformed filters", async () => {
    vi.mocked(getPublicEdition).mockResolvedValueOnce(undefined);
    await expect(html({}, "s11")).rejects.toThrow("NOT_FOUND");
    expect(cachedDirectoryStatistics).not.toHaveBeenCalled();
    expect(await html({ unsupported: "private" }, "s11")).toContain(
      "Clear filters",
    );
    expect(cachedDirectoryStatistics).not.toHaveBeenCalled();
    expect(getDirectoryOtrRatings).not.toHaveBeenCalled();
  });
  it("loads o!TR and displays saved SIP and ETX for the public S11 directory", async () => {
    vi.mocked(getPublicEdition).mockResolvedValue({ ...edition, slug: "s11" });
    vi.mocked(getDirectoryOtrRatings).mockResolvedValue({ 1220001: 1572.48 });
    importedRows.mockResolvedValue([
      { userId: 1220001, source: "sip", value: -2563 },
      {
        userId: 1220001,
        source: "etx",
        value: 6.15,
        provisional: true,
        outdated: false,
      },
    ]);

    const page = await html({}, "s11");
    expect(page).toContain("<dt>o!TR</dt>");
    expect(page).toContain("Synthetic Player");
    expect(page).toContain("<dt>SIP</dt><dd>-2,563</dd>");
    expect(page).toContain("<dt>ETX</dt><dd>6.15");
    expect(page).toContain("Provisional rating");
    expect(getDirectoryOtrRatings).toHaveBeenCalledExactlyOnceWith([1220001]);
  });
});
