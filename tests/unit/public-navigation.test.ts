import { describe, expect, it } from "vitest";
import {
  isPublicPage,
  isBroadcastPage,
  captainWorkspaceSection,
  playerWorkspaceSection,
  publicTournamentSection,
} from "../../src/lib/public-navigation";
describe("public edition navigation", () => {
  const base = "/tournaments/season-test";
  it.each([
    ["", ""],
    ["/mappools/pool-id", "mappools"],
    ["/teams/team-id", "teams"],
    ["/matches/match-id", "schedule"],
    ["/register", ""],
    ["/rules", ""],
    ["/bracket", "bracket"],
    ["/players", "players"],
    ["/team", null],
    ["/draft/captain", null],
    ["/schedule/requests", null],
    ["/player/practice", null],
    ["/player/availability", null],
  ])("selects one destination for %s", (suffix, section) => {
    expect(publicTournamentSection(base + suffix, base)).toBe(section);
  });
  it("does not select a similarly prefixed edition", () => {
    expect(publicTournamentSection(base + "-other/mappools", base)).toBeNull();
  });
  it("selects personal player tools only within their route boundaries", () => {
    expect(playerWorkspaceSection(`${base}/player/practice`, base)).toBe(
      "player/practice",
    );
    expect(playerWorkspaceSection(`${base}/player/availability`, base)).toBe(
      "player/availability",
    );
    expect(
      playerWorkspaceSection(`${base}/player/practice-other`, base),
    ).toBeNull();
    expect(
      playerWorkspaceSection(`${base}-other/player/practice`, base),
    ).toBeNull();
  });
  it("keeps private tool destinations separate with segment boundaries", () => {
    expect(captainWorkspaceSection(`${base}/team`, base)).toBe("team");
    expect(captainWorkspaceSection(`${base}/draft/captain`, base)).toBe(
      "draft/captain",
    );
    expect(
      captainWorkspaceSection(`${base}/schedule/requests/request`, base),
    ).toBe("schedule/requests");
    for (const suffix of [
      "/teams",
      "/team-other",
      "/draft/captain-other",
      "/schedule/requests-other",
    ])
      expect(captainWorkspaceSection(base + suffix, base)).toBeNull();
    expect(captainWorkspaceSection(`${base}-other/team`, base)).toBeNull();
    expect(publicTournamentSection(`${base}/schedule`, base)).toBe("schedule");
  });
});

describe("public route context", () => {
  it.each([
    "/",
    "/news",
    "/about",
    "/privacy",
    "/tournaments",
    "/players/123",
    "/tournaments/s11/rules",
    "/tournaments/s11/draft",
  ])("identifies public page %s", (path) =>
    expect(isPublicPage(path)).toBe(true),
  );
  it.each([
    "/admin",
    "/admin/tournaments/s11",
    "/dashboard",
    "/login",
    "/tournaments/s11/team",
    "/tournaments/s11/draft/captain",
    "/tournaments/s11/draft/overlay",
    "/tournaments/s11/schedule/requests",
    "/tournaments/s11/schedule/requests/request",
    "/tournaments/s11/player/practice",
    "/tournaments/s11/player/availability",
  ])("identifies private page %s", (path) =>
    expect(isPublicPage(path)).toBe(false),
  );
  it("isolates presenter mode without changing the normal spectator board", () =>
    expect(isPublicPage("/tournaments/s11/draft", true)).toBe(false));
});

describe("broadcast appearance boundary", () => {
  it.each([
    "/",
    "/dashboard",
    "/admin",
    "/login",
    "/tournaments/s11/team",
    "/tournaments/s11/schedule/requests",
    "/tournaments/s11/draft/captain",
    "/tournaments/s11/draft",
  ])("shares site appearance for %s", (path) => {
    expect(isBroadcastPage(path)).toBe(false);
  });
  it("isolates only explicit broadcast destinations", () => {
    expect(isBroadcastPage("/tournaments/s11/draft/overlay")).toBe(true);
    expect(isBroadcastPage("/tournaments/s11/draft", true)).toBe(true);
    expect(isBroadcastPage("/tournaments/s11/draft/captain", true)).toBe(false);
    expect(isBroadcastPage("/tournaments/s11/draft/overlay-other")).toBe(false);
    expect(isBroadcastPage("/admin", true)).toBe(false);
  });
});
