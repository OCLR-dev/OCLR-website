import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { RemoteDataError } from "../../src/lib/remote-errors";
import { RemotePublicCache } from "../../src/lib/remote-public-cache";
import { frontendProfile } from "../../src/lib/frontend-data";
import { remoteRead } from "../../src/lib/remote-transport";
import { cachedOsuUserProfile } from "../../src/lib/osu-profiles";
import { edition } from "../fixtures/edition";
const state = vi.hoisted(() => ({
  version: "1.2.0",
  viewer: null as null | { osuId: number; username: string },
}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers.js", () => ({
  cookies: async () => ({ get: () => ({ value: "synthetic" }) }),
}));
vi.mock("../../src/lib/remote-sessions", () => ({
  remoteCookie: "synthetic",
  disconnectRemote: vi.fn(),
  verifiedConnection: async () => ({
    token: state.viewer ? "synthetic" : undefined,
    contractVersion: state.version,
    identity: state.viewer
      ? {
          user: state.viewer,
          access: { scopes: ["identity:read", "tournaments:read"] },
        }
      : null,
    publicCache: new RemotePublicCache(),
  }),
}));
vi.mock("../../src/lib/remote-transport", async (original) => ({
  ...(await original<typeof import("../../src/lib/remote-transport")>()),
  remoteRead: vi.fn(),
}));
vi.mock("../../src/lib/osu-profiles", () => ({
  cachedOsuUserProfile: vi.fn(async () => null),
}));
const source = {
  kind: "historical_archive",
  revision: null,
  updatedAt: null,
  capturedOn: "2023-12-01",
};
const summaries = ["first-cup", "second-cup"].map((slug) => ({
  source,
  slug,
  name: slug,
  season: null,
  summary: "Synthetic",
  status: "completed",
  timeZone: "UTC",
  branding: edition.branding,
  defaultAppearance: null,
  registration: null,
}));
function response(data: unknown, collection = false) {
  return {
    data,
    contractVersion: state.version,
    meta: {
      apiVersion: "1" as const,
      requestId: "11111111-1111-4111-8111-111111111111",
      ...(collection
        ? {
            pagination: {
              page: 1,
              pageSize: 100,
              total: 2,
              totalPages: 1,
              nextPage: null,
              collectionVersion: "a".repeat(64),
            },
          }
        : {}),
    },
  };
}
function player(slug: string) {
  return {
    player: {
      source,
      osuId: 360001,
      username: slug === "first-cup" ? "Old name" : "Later name",
      editionSlug: slug,
      editionName: slug,
      team: null,
      captain: false,
      role: "player",
      participation: "historical",
      coachedTeams: [],
      tier: null,
      tierLabel: null,
      bio: null,
      statistics: {
        globalRank: null,
        pp: null,
        fetchedAt: null,
        state: "not_recorded",
      },
    },
    requestedMode: "osu",
    snapshot: null,
    bws: null,
  };
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OCLR_DATA_SOURCE", "remote");
  vi.stubEnv("APP_URL", "http://localhost:4000");
  vi.stubEnv("OCLR_API_BASE_URL", "https://oclr.example.test");
  state.version = "1.2.0";
  state.viewer = null;
  vi.mocked(remoteRead).mockReset();
  vi.mocked(cachedOsuUserProfile).mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
it("aggregates every legacy season by UID without probing newer endpoints or stopping at the first hit", async () => {
  vi.mocked(remoteRead).mockImplementation(async (path) => {
    if (path === "/tournaments") return response(summaries, true);
    const match = /^\/tournaments\/([^/]+)\/players\/360001$/.exec(path);
    if (match) return response(player(match[1]));
    throw Error("Unexpected resource " + path);
  });
  const data = await frontendProfile("360001");
  expect(data.participation.map((p) => p.editionSlug).sort()).toEqual([
    "first-cup",
    "second-cup",
  ]);
  expect(data.identity.names.map((n) => n.username)).toEqual(
    expect.arrayContaining(["Old name", "Later name"]),
  );
  expect(data.identity.names.every((n) => !n.evidence.length)).toBe(true);
});
it("opens the actual legacy subject with no participation and no saved statistics", async () => {
  state.viewer = { osuId: 360001, username: "Login only" };
  vi.mocked(remoteRead).mockImplementation(async (path) => {
    if (path === "/tournaments") return response(summaries, true);
    throw new RemoteDataError("NOT_FOUND", 404);
  });
  expect(await frontendProfile("360001")).toMatchObject({
    identity: { osuId: 360001, username: "Login only" },
    participation: [],
    snapshot: null,
  });
  await expect(frontendProfile("360002")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("keeps standard snapshot aliases for the legacy subject without participation", async () => {
  state.viewer = { osuId: 360001, username: "Login only" };
  vi.mocked(remoteRead).mockImplementation(async (path) => {
    if (path === "/tournaments") return response(summaries, true);
    throw new RemoteDataError("NOT_FOUND", 404);
  });
  vi.mocked(cachedOsuUserProfile).mockImplementation(async (_osuId, mode) =>
    mode === "osu"
      ? ({
          profile: {
            username: "Current osu! name",
            previousUsernames: ["Verified osu! alias"],
          },
          stale: false,
          notice: null,
        } as never)
      : null,
  );

  const data = await frontendProfile("360001");
  expect(data.identity.mode).toBe("osu");
  expect(data.identity.names.map((name) => name.username)).toContain(
    "Verified osu! alias",
  );
  expect(cachedOsuUserProfile).toHaveBeenCalledWith(360001, "osu");
});
it("uses the negotiated v1.3 subject resource and never downgrades auth failures", async () => {
  state.version = "1.3.0";
  state.viewer = { osuId: 360001, username: "Self" };
  const dto = {
    identity: {
      osuId: 360001,
      username: "Self",
      currentUsername: "Self",
      mode: "osu",
      canonicalUrl: "https://osu.ppy.sh/users/360001/osu",
      names: [],
    },
    participation: [],
    snapshot: null,
    bws: null,
    error: null,
  };
  vi.mocked(remoteRead).mockResolvedValue(response(dto));
  expect(await frontendProfile("360001")).toEqual(dto);
  expect(remoteRead).toHaveBeenCalledWith(
    "/me/oclr-profile",
    expect.any(URLSearchParams),
    "synthetic",
  );
  vi.mocked(remoteRead)
    .mockReset()
    .mockRejectedValue(new RemoteDataError("REMOTE_FORBIDDEN", 403));
  await expect(frontendProfile("360001")).rejects.toMatchObject({
    code: "REMOTE_FORBIDDEN",
  });
  expect(remoteRead).toHaveBeenCalledTimes(1);
});
