import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { remoteRead } from "../../src/lib/remote-transport";
import {
  connectRemote,
  verifiedConnection,
  disconnectRemote,
  remoteConnection,
} from "../../src/lib/remote-sessions";
import {
  frontendTournaments,
  frontendPlayers,
  frontendSite,
  frontendProfile,
} from "../../src/lib/frontend-data";
import { collectionPage } from "../../src/lib/read-api";
import { edition } from "../fixtures/edition";
import { publicPlayerSchema } from "../../src/lib/read-api-contract";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
  }),
}));
const tokenA = "oclr_dev_" + "a".repeat(43),
  tokenB = "oclr_dev_" + "b".repeat(43);
const source = {
  kind: "database",
  revision: 1,
  updatedAt: "2026-10-25T00:00:00Z",
  capturedOn: null,
};
const summary = {
  source,
  slug: edition.slug,
  name: edition.name,
  season: null,
  summary: edition.summary,
  status: edition.status,
  timeZone: edition.timeZone,
  branding: edition.branding,
  defaultAppearance: null,
  registration: null,
};
const players = Array.from({ length: 137 }, (_, index) =>
  publicPlayerSchema.parse({
    source,
    osuId: 2700000 + index,
    username: `Synthetic ${index}`,
    editionSlug: edition.slug,
    editionName: edition.name,
    team: null,
    captain: false,
    role: "player",
    participation: "accepted",
    coachedTeams: [],
    tier: null,
    tierLabel: null,
    bio: null,
    statistics: {
      globalRank: index ? 1000 + index : null,
      pp: index ? 2000 + index : 0,
      fetchedAt: source.updatedAt,
      state: "fresh",
    },
  }),
);
let upstream = "",
  mode = "healthy",
  revoked = false,
  redirected = 0,
  changed = false;
const seen: {
  path: string;
  authorization?: string;
  cookie?: string;
  origin?: string;
}[] = [];
const server = createServer((request, response) => {
  const url = new URL(request.url!, "http://localhost");
  seen.push({
    path: url.pathname,
    authorization: request.headers.authorization,
    cookie: request.headers.cookie,
    origin: request.headers.origin,
  });
  const send = (data: unknown, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };
  if (mode === "redirect") {
    response.writeHead(302, { Location: upstream + "/capture" });
    response.end();
    return;
  }
  if (url.pathname === "/capture") {
    redirected++;
    send({});
    return;
  }
  if (mode === "throttled") {
    send({ error: { code: "RATE_LIMITED" } }, 429);
    return;
  }
  if (mode === "unavailable") {
    send({ error: { code: "UNAVAILABLE", message: "SECRET_SENTINEL" } }, 503);
    return;
  }
  if (mode === "malformed") {
    send({ data: { token: "SECRET_SENTINEL" }, meta: { apiVersion: "1" } });
    return;
  }
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (url.pathname === "/api/v1/me") {
    if (revoked || ![tokenA, tokenB].includes(token!)) {
      send({ error: { code: "INVALID_TOKEN" } }, 401);
      return;
    }
    send({
      data: {
        user: {
          osuId: token === tokenA ? 27001 : 27002,
          username: token === tokenA ? "Synthetic A" : "Synthetic B",
        },
        access: {
          kind: "developer-read",
          scopes: ["identity:read", "tournaments:read", "profiles:read"],
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      },
      meta: { apiVersion: "1", requestId: randomUUID() },
    });
    return;
  }
  let payload: { data: unknown; meta?: unknown };
  if (url.pathname === "/api/v1/tournaments")
    payload = collectionPage([summary], url.searchParams);
  else if (url.pathname.endsWith("/players")) {
    if (mode === "change" && url.searchParams.get("page") === "2" && !changed) {
      changed = true;
      send({ error: { code: "COLLECTION_CHANGED" } }, 409);
      return;
    }
    payload = collectionPage(players, url.searchParams);
  } else if (url.pathname.endsWith("/players/2700000"))
    payload = {
      data: {
        player: players[0],
        requestedMode: "osu",
        snapshot: null,
        bws: null,
      },
    };
  else if (url.pathname === "/api/v1/site")
    payload = {
      data: {
        name: "osu! Chinese League Rookie (OCLR)",
        defaultAppearance: "cute-pastel",
        defaultLocale: "zh-Hans",
        locales: ["zh-Hans", "zh-Hant", "en"],
        privacyContact: null,
      },
    };
  else {
    send({ error: { code: "NOT_FOUND" } }, 404);
    return;
  }
  send({
    ...payload,
    meta: { apiVersion: "1", requestId: randomUUID(), ...(payload.meta ?? {}) },
  });
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Test listener missing");
  upstream = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OCLR_DATA_SOURCE", "remote");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("OCLR_API_BASE_URL", upstream);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("OSU_CLIENT_SECRET", "");
  seen.length = 0;
  jar.clear();
  mode = "healthy";
  revoked = false;
  redirected = 0;
  changed = false;
  (
    globalThis as unknown as { oclrRemoteConnections?: Map<string, unknown> }
  ).oclrRemoteConnections?.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("remote frontend transport with no local DB", () => {
  it("binds independent browser sessions to real upstream identities, supports explicit anonymous mode and rechecks revocation", async () => {
    const a = await connectRemote({ mode: "developer", token: tokenA }),
      b = await connectRemote({ mode: "developer", token: tokenB });
    expect(a.id).not.toBe(b.id);
    expect((await verifiedConnection(a.id)).identity!.user.osuId).toBe(27001);
    expect((await verifiedConnection(b.id)).identity!.user.osuId).toBe(27002);
    const anonymous = await connectRemote({ mode: "anonymous" });
    expect((await verifiedConnection(anonymous.id)).identity).toBeNull();
    revoked = true;
    await expect(verifiedConnection(a.id)).rejects.toMatchObject({
      code: "REMOTE_EXPIRED",
    });
    expect(() => remoteConnection(a.id)).toThrow();
    disconnectRemote(b.id);
    expect(() => remoteConnection(b.id)).toThrow();
    expect(() => remoteConnection()).toThrow();
  });
  it("completes all 137 rows, preserves null/PP zero, shares data with profile, and retries a changed collection without mixing", async () => {
    const session = await connectRemote({ mode: "anonymous" });
    jar.set("oclr_remote_session", session.id);
    expect(await frontendSite()).toMatchObject({
      defaultAppearance: "cute-pastel",
    });
    expect(await frontendTournaments()).toHaveLength(1);
    const result = await frontendPlayers(edition.slug);
    expect(result.rows).toEqual(players);
    expect(result.refreshIds).toEqual([]);
    expect(result.rows[0].statistics).toMatchObject({
      pp: 0,
      globalRank: null,
    });
    mode = "change";
    expect((await frontendPlayers(edition.slug)).rows).toEqual(players);
    expect(changed).toBe(true);
    const profile = await frontendProfile("2700000", "osu", edition.slug);
    expect(profile.participation[0]).toEqual(players[0]);
    expect(profile.snapshot).toBeNull();
    expect(seen.filter((r) => r.path.endsWith("/players")).length).toBe(6);
  });
  it("sends only the fixed origin and selected bearer; never follows redirects or echoes upstream errors", async () => {
    await remoteRead("/site", undefined, tokenA);
    expect(seen[0]).toMatchObject({
      authorization: `Bearer ${tokenA}`,
      origin: "http://localhost:3000",
      cookie: undefined,
    });
    mode = "redirect";
    await expect(remoteRead("/me", undefined, tokenA)).rejects.toMatchObject({
      code: "REMOTE_UNAVAILABLE",
    });
    expect(redirected).toBe(0);
    expect(seen).toHaveLength(2);
    mode = "unavailable";
    await expect(remoteRead("/site")).rejects.not.toThrow("SECRET_SENTINEL");
    mode = "throttled";
    await expect(remoteRead("/site")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    mode = "malformed";
    await expect(remoteRead("/site")).rejects.toMatchObject({
      code: "REMOTE_UNAVAILABLE",
    });
  });
  it("bounds sessions, rotates connection IDs and expires memory access without persisting credentials", async () => {
    let session = await connectRemote({ mode: "anonymous" });
    const old = session.id;
    session = await connectRemote({ mode: "developer", token: tokenA }, old);
    expect(() => remoteConnection(old)).toThrow();
    for (let i = 1; i < 50; i++) await connectRemote({ mode: "anonymous" });
    await expect(connectRemote({ mode: "anonymous" })).rejects.toMatchObject({
      status: 503,
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3600001);
    expect(() => remoteConnection(session.id)).toThrow();
    vi.useRealTimers();
  });
});
