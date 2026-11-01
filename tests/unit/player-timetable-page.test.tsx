import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { redirect, notFound } from "next/navigation";
import Page from "../../src/app/tournaments/[edition]/player/availability/page";
import { english } from "../../src/i18n/translate";
import { requireUser } from "../../src/lib/auth/user";
import { playerTimetableWorkspace } from "../../src/lib/player-workspace";
import { HttpError } from "../../src/lib/http";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));
vi.mock("../../src/lib/player-workspace", () => ({
  assertDirectPlayerWorkspace: vi.fn(),
  playerTimetableWorkspace: vi.fn(),
}));
const actor = { osuId: 679001, username: "Synthetic captain" };
const props = (player?: string) => ({
  params: Promise.resolve({ edition: "test-cup" }),
  searchParams: Promise.resolve(player === undefined ? {} : { player }),
});
describe("captain timetable page entry", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.resetAllMocks();
    vi.mocked(requireUser).mockResolvedValue(actor);
    vi.mocked(playerTimetableWorkspace).mockResolvedValue({
      actorId: actor.osuId,
      owner: actor,
      players: [actor],
      teamAvailability: [],
      timeZone: "Asia/Taipei",
      canEdit: true,
      intervals: [],
      version: 0,
      updatedAt: null,
    });
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("Synthetic redirect");
    });
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("Synthetic not found");
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("opens the current user's timetable without a player choice", async () => {
    expect(await Page(props())).toBeTruthy();
    expect(playerTimetableWorkspace).toHaveBeenCalledExactlyOnceWith(
      actor,
      "test-cup",
      actor.osuId,
    );
    expect(redirect).not.toHaveBeenCalled();
  });
  it("returns authorized legacy player links to the aggregate page", async () => {
    await expect(Page(props("679002"))).rejects.toThrow("Synthetic redirect");
    expect(playerTimetableWorkspace).toHaveBeenCalledExactlyOnceWith(
      actor,
      "test-cup",
      679002,
    );
    expect(redirect).toHaveBeenCalledExactlyOnceWith(
      "/tournaments/test-cup/player/availability",
    );
  });
  it("checks authorization before redirecting legacy player links", async () => {
    vi.mocked(playerTimetableWorkspace).mockRejectedValue(
      new HttpError(403, "Synthetic denied"),
    );
    await expect(Page(props("679003"))).rejects.toThrow("Synthetic not found");
    expect(notFound).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });
});
