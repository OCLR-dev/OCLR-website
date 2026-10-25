import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { english } from "../../src/i18n/translate";
import { edition } from "../fixtures/edition";
import Overview from "../../src/app/tournaments/[edition]/page";
import { getPublicEdition } from "../../src/lib/content";
import { publicCompetition } from "../../src/lib/public-competition";
import { publicMappools } from "../../src/lib/mappools";
import { publishedTeams } from "../../src/lib/teams";
import { publicStaff } from "../../src/lib/public-staff";
import { publicDraft } from "../../src/lib/draft";
import { formatDate } from "../../src/lib/editions";
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
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
vi.mock("../../src/lib/registrations", () => ({
  registrationAvailability: async () => "unavailable",
}));
vi.mock("../../src/lib/public-competition", () => ({
  publicCompetition: vi.fn(),
}));
vi.mock("../../src/lib/mappools", () => ({ publicMappools: vi.fn() }));
vi.mock("../../src/lib/teams", () => ({ publishedTeams: vi.fn() }));
vi.mock("../../src/lib/public-staff", () => ({ publicStaff: vi.fn() }));
vi.mock("../../src/lib/draft", () => ({ publicDraft: vi.fn() }));
// The server composition test isolates client timer behavior (covered by browser tests).
vi.mock("../../src/components/season-countdown", () => ({
  SeasonCountdown: () => null,
}));
describe("overview partial data failures", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubEnv("DATABASE_URL", "postgresql://synthetic@localhost/unit_test");
    vi.mocked(getPublicEdition).mockResolvedValue(edition);
    vi.mocked(publicCompetition).mockResolvedValue({
      fixtures: [],
      groups: [],
      databaseAuthority: true,
    });
    vi.mocked(publicMappools).mockResolvedValue([]);
    vi.mocked(publishedTeams).mockResolvedValue([]);
    vi.mocked(publicStaff).mockResolvedValue([]);
    vi.mocked(publicDraft).mockResolvedValue(null);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const render = async () => {
    const stream = await renderToReadableStream(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {await Overview({ params: Promise.resolve({ edition: edition.slug }) })}
      </NextIntlClientProvider>,
    );
    return new Response(stream).text();
  };
  it.each([
    publicCompetition,
    publicMappools,
    publishedTeams,
    publicStaff,
    publicDraft,
  ])(
    "keeps configured dates and disclosure available when a secondary query fails",
    async (query) => {
      vi.mocked(query).mockRejectedValue(new Error("PRIVATE_DATABASE_DETAILS"));
      const html = await render();
      expect(html).toContain(
        "Some competition information is temporarily unavailable",
      );
      expect(html).toContain(
        formatDate(
          edition.registration!.opensAt,
          edition.timeZone,
          english.locale,
        ),
      );
      expect(html).toContain(edition.eligibility!);
      expect(html).not.toContain("PRIVATE_DATABASE_DETAILS");
      expect(html).not.toContain('class="event-overview-main"');
      expect(html).toContain('class="information-document document-typeset"');
    },
  );
});
