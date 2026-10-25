import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { english } from "../../src/i18n/translate";
import { edition } from "../fixtures/edition";
import Home from "../../src/app/page";
import { frontendTournaments } from "../../src/lib/frontend-data";
import type { PublicTournamentSummary } from "../../src/lib/read-api-contract";
import { formatDate } from "../../src/lib/editions";
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("../../src/lib/frontend-data", () => ({
  frontendTournaments: vi.fn(),
}));
function summary(
  state: NonNullable<PublicTournamentSummary["registration"]>["state"],
): PublicTournamentSummary {
  return {
    ...edition,
    source: {
      kind: "database",
      revision: 1,
      updatedAt: null,
      capturedOn: null,
    },
    defaultAppearance: null,
    registration: {
      ...edition.registration!,
      withdrawUntil: edition.registration!.withdrawUntil ?? null,
      state,
    },
  };
}
vi.mock("../../src/components/edition-card", () => ({
  EditionCard: ({ edition: item }: { edition: { name: string } }) => (
    <article>{item.name}</article>
  ),
}));
async function render() {
  return new Response(await renderToReadableStream(await Home())).text();
}
describe("homepage registration banner", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.mocked(frontendTournaments).mockReset();
    vi.mocked(frontendTournaments).mockResolvedValue([summary("open")]);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("uses the featured edition's configured closing time and registration URL when open", async () => {
    vi.mocked(frontendTournaments).mockResolvedValue([summary("open")]);
    const html = await render();
    expect(frontendTournaments).toHaveBeenCalledOnce();
    expect(html).toContain(`href="/tournaments/${edition.slug}/register"`);
    expect(html).toContain("Registration phase");
    expect(html).toContain(
      formatDate(
        edition.registration!.closesAt,
        edition.timeZone,
        english.locale,
      ),
    );
    expect(html).not.toContain("11.23");
  });
  it.each([
    ["closed", "Registration closed"],
    ["paused", "Registration paused"],
    ["unavailable", "Registration temporarily unavailable"],
    ["unannounced", "Registration not announced"],
  ] as const)(
    "keeps %s registration out of the active enrollment link",
    async (state, message) => {
      vi.mocked(frontendTournaments).mockResolvedValue([summary(state)]);
      const html = await render();
      expect(html).toContain(message);
      expect(html).not.toContain("Registration phase");
      expect(html).not.toContain(
        `href="/tournaments/${edition.slug}/register"`,
      );
      expect(html).not.toContain("Deadline ");
    },
  );
  it("shows the configured opening time before registration opens", async () => {
    vi.mocked(frontendTournaments).mockResolvedValue([summary("upcoming")]);
    const html = await render();
    expect(html).toContain("Registration opens ");
    expect(html).toContain(
      formatDate(
        edition.registration!.opensAt,
        edition.timeZone,
        english.locale,
      ),
    );
    expect(html).not.toContain(`href="/tournaments/${edition.slug}/register"`);
  });
  it("does not advertise registration when there is no current edition", async () => {
    vi.mocked(frontendTournaments).mockResolvedValue([
      { ...summary("closed"), status: "completed" },
    ]);
    const html = await render();
    expect(frontendTournaments).toHaveBeenCalledOnce();
    expect(html).toContain("The next edition has not been announced yet.");
    expect(html).not.toContain("Registration phase");
    expect(html).not.toContain("Deadline ");
  });
});
