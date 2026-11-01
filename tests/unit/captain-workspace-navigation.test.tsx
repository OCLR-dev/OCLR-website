import React, { type ComponentProps, type ReactElement } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import EditionLayout from "../../src/app/tournaments/[edition]/layout";
import type { TournamentShell } from "../../src/components/tournament-navigation";
import { currentUser } from "../../src/lib/auth/user";
import { captainAppointment } from "../../src/lib/captains";
import { getPublicEdition } from "../../src/lib/content";
import { remoteMode } from "../../src/lib/data-source";
import { publicDraft } from "../../src/lib/draft";
import { frontendTournament } from "../../src/lib/frontend-data";
import { edition } from "../fixtures/edition";
import { english } from "../../src/i18n/translate";

vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("../../src/lib/auth/user", () => ({ currentUser: vi.fn() }));
vi.mock("../../src/lib/captains", () => ({ captainAppointment: vi.fn() }));
vi.mock("../../src/lib/content", () => ({ getPublicEdition: vi.fn() }));
vi.mock("../../src/lib/data-source", () => ({ remoteMode: vi.fn() }));
vi.mock("../../src/lib/draft", () => ({ publicDraft: vi.fn() }));
vi.mock("../../src/lib/frontend-data", () => ({ frontendTournament: vi.fn() }));
vi.mock("../../src/lib/tournament-information", () => ({
  informationPreview: () => null,
}));
vi.mock("../../src/lib/remote-page", () => ({
  remotePage: (render: () => unknown) => render(),
}));

const actor = { osuId: 9690001, username: "Synthetic Viewer" };
const appointment = {
  userId: actor.osuId,
  editionSlug: edition.slug,
} as NonNullable<Awaited<ReturnType<typeof captainAppointment>>>;
async function props() {
  const result = await EditionLayout({
    params: Promise.resolve({ edition: edition.slug }),
    children: "Synthetic content",
  });
  return (result as ReactElement<ComponentProps<typeof TournamentShell>>).props;
}

describe("edition-scoped captain navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    vi.mocked(remoteMode).mockReturnValue(false);
    vi.mocked(currentUser).mockResolvedValue(actor);
    // The saved query explicitly returns null when no appointment exists.
    vi.mocked(captainAppointment).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof captainAppointment>>,
    );
    vi.mocked(getPublicEdition).mockResolvedValue(edition);
    vi.mocked(publicDraft).mockResolvedValue(null);
    vi.mocked(frontendTournament).mockResolvedValue({
      name: edition.name,
      source: { kind: "database" },
      overview: { kind: "database", draft: null },
    } as Awaited<ReturnType<typeof frontendTournament>>);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("does not request or expose captain tools for an anonymous viewer", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    expect((await props()).captainWorkspace).toBeUndefined();
    expect(captainAppointment).not.toHaveBeenCalled();
  });
  it("requires an actual appointment rather than an authenticated account", async () => {
    expect((await props()).captainWorkspace).toBeUndefined();
    expect(captainAppointment).toHaveBeenCalledExactlyOnceWith(
      actor.osuId,
      edition.slug,
    );
  });
  it("shows the saved captain's tools within the selected edition", async () => {
    vi.mocked(captainAppointment).mockResolvedValue(appointment);
    expect((await props()).captainWorkspace).toEqual({
      scheduleRequests: true,
    });
    expect(captainAppointment).toHaveBeenCalledExactlyOnceWith(
      actor.osuId,
      edition.slug,
    );
  });
  it("keeps public tournament content available when optional identity lookup fails", async () => {
    vi.mocked(currentUser).mockRejectedValue(
      Error("Synthetic session failure"),
    );
    expect((await props()).captainWorkspace).toBeUndefined();
    expect(captainAppointment).not.toHaveBeenCalled();
  });
  it("fails closed for navigation when appointment lookup fails", async () => {
    vi.mocked(captainAppointment).mockRejectedValue(
      Error("Synthetic appointment failure"),
    );
    expect((await props()).captainWorkspace).toBeUndefined();
  });
  it("does not advertise direct-session scheduling in delegated remote mode", async () => {
    vi.mocked(remoteMode).mockReturnValue(true);
    vi.mocked(captainAppointment).mockResolvedValue(appointment);
    expect((await props()).captainWorkspace).toEqual({
      scheduleRequests: false,
    });
  });
});
