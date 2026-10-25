import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Players from "../../src/app/tournaments/[edition]/players/page";
import { publicPlayers } from "../../src/lib/players";
import { getPublicEdition } from "../../src/lib/content";
import {
  cachedDirectoryStatistics,
  refreshDirectoryStatistics,
} from "../../src/lib/osu-profiles";
import { english } from "../../src/i18n/translate";
import messages from "../../messages/en.json";
import { edition } from "../fixtures/edition";
const callbacks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => callbacks.push(callback),
}));
vi.mock("next/navigation", () => ({
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
vi.mock("../../src/lib/players", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/players")>()),
  publicPlayers: vi.fn(),
}));
vi.mock("../../src/lib/draft", () => ({ publicDraft: async () => null }));
vi.mock("../../src/lib/content", () => ({ getPublicEdition: vi.fn() }));
vi.mock("../../src/db", () => ({ db: () => ({}) }));
vi.mock("../../src/lib/tournaments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/tournaments")>()),
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
async function html(query = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {await Players({
        params: Promise.resolve({ edition: edition.slug }),
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
    expect(cachedDirectoryStatistics).toHaveBeenCalledExactlyOnceWith([
      1220001,
    ]);
    expect(refreshDirectoryStatistics).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    await callbacks[0]();
    expect(refreshDirectoryStatistics).toHaveBeenCalledExactlyOnceWith([
      1220001,
    ]);
  });
  it("rechecks publication after rendering before requesting refresh", async () => {
    await html();
    vi.mocked(publicPlayers).mockResolvedValue({
      ...result(),
      rows: [],
      total: 0,
    });
    await callbacks[0]();
    expect(refreshDirectoryStatistics).toHaveBeenCalledExactlyOnceWith([]);
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
    await expect(html()).rejects.toThrow("NOT_FOUND");
    expect(cachedDirectoryStatistics).not.toHaveBeenCalled();
    expect(await html({ unsupported: "private" })).toContain("Clear filters");
    expect(cachedDirectoryStatistics).not.toHaveBeenCalled();
  });
});
