import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readdirSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  developerApiTokens,
  developerApiEvents,
  staffRoles,
  users,
  sessions,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import {
  createSession,
  readSession,
  readSessionContext,
  revokeSession,
} from "../../src/lib/auth/sessions";
import { hashToken, randomToken } from "../../src/lib/auth/tokens";
import {
  createDeveloperToken,
  listDeveloperTokens,
  revokeDeveloperToken,
  developerApiLimiter,
} from "../../src/lib/developer-api";
import { developerApiScopes } from "../../src/lib/developer-api-model";
import {
  createDeveloperTokenWrite,
  revokeDeveloperTokenWrite,
  type CreateDeveloperTokenInput,
} from "../../src/lib/developer-token-write-contract";
import { developerReadResponse } from "../../src/lib/developer-api-http";
import {
  GET as me,
  HEAD as head,
  OPTIONS as options,
  POST as mutate,
} from "../../src/app/api/v1/me/route";
import { GET as missing } from "../../src/app/api/v1/[...path]/route";
import {
  GET as list,
  POST as issue,
} from "../../src/app/api/developer/tokens/route";
import { DELETE as revoke } from "../../src/app/api/developer/tokens/[tokenId]/route";
import { PATCH as saveAppearance } from "../../src/app/api/admin/settings/route";
import { GET as legacyProfile } from "../../src/app/api/players/[osuId]/route";
import { auditLog } from "../../src/lib/audit";
import { requireStaff } from "../../src/lib/auth/staff-request";

const browser = vi.hoisted(() => ({ headers: new Headers(), token: "" }));
vi.mock("next/headers.js", () => ({
  headers: async () => browser.headers,
  cookies: async () => ({
    get: () => (browser.token ? { value: browser.token } : undefined),
  }),
}));
const url = process.env.TEST_DATABASE_URL;
const backend = "https://oclr.example.test";
const origin = "http://localhost:3000";
let sequence = 2680000;
let owner: Awaited<ReturnType<typeof readSessionContext>>;
let other: Awaited<ReturnType<typeof readSessionContext>>;
let ownerToken = "";
function request(
  path = "/api/v1/me",
  token?: string,
  localOrigin: string | null = origin,
  method = "GET",
) {
  const headers = new Headers();
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  if (localOrigin !== null) headers.set("Origin", localOrigin);
  return new Request(backend + path, { method, headers });
}
async function issued(scopes = [...developerApiScopes]) {
  return createDeveloperToken(owner!, { origin, scopes });
}
async function issueThroughBrowser(input: CreateDeveloperTokenInput) {
  const response = await issue(
    new Request(backend + createDeveloperTokenWrite.path, {
      method: "POST",
      headers: { Origin: backend, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const body = await response.json();
  const credential = createDeveloperTokenWrite.response.parse(body);
  expect(credential).toEqual(body);
  return credential;
}
async function businessState() {
  const tables = await db().execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  const state: unknown[] = [];
  for (const row of tables.rows) {
    const result = await db().execute(
      sql.raw(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM "${row.tablename}" t`,
      ),
    );
    state.push([row.tablename, result.rows[0].rows]);
  }
  return state;
}
describe.skipIf(!url)("Developer API credentials (isolated PostgreSQL)", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", backend);
    vi.stubEnv("ADMIN_OSU_IDS", "");
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", `${origin},http://127.0.0.1:3000`);
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_DEVELOPER_PORTS", undefined);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", origin);
    await db().execute(sql`TRUNCATE users CASCADE`);
    const first = ++sequence,
      second = ++sequence;
    await db()
      .insert(users)
      .values([
        { osuId: first, username: "Synthetic Developer" },
        { osuId: second, username: "Synthetic Other Developer" },
      ]);
    await db()
      .insert(staffRoles)
      .values(
        [first, second].map((userId) => ({
          userId,
          role: "developer" as const,
          grantedBy: first,
        })),
      );
    ownerToken = (await createSession(first)).token;
    owner = await readSessionContext(ownerToken);
    other = await readSessionContext((await createSession(second)).token);
    browser.token = ownerToken;
    browser.headers = new Headers();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("issues only hashed credentials, caps lifetime, lists metadata and audits transactionally", async () => {
    const start = Date.now();
    const credential = await issueThroughBrowser({
      origin,
      scopes: [...developerApiScopes],
    });
    expect(credential.backend).toBe(backend);
    expect(credential.access).toMatchObject({ origin, ports: [3000] });
    expect(Date.parse(credential.access.expiresAt) - start).toBeLessThanOrEqual(
      3_600_000 + 500,
    );
    const [stored] = await db().select().from(developerApiTokens);
    expect(stored.tokenHash === hashToken(credential.token)).toBe(true);
    const listing = await listDeveloperTokens(owner!);
    expect(listing.tokens).toEqual([credential.access]);
    expect(JSON.stringify(listing).includes(credential.token)).toBe(false);
    const events = await db().select().from(developerApiEvents);
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(owner!.osuId);
    expect(JSON.stringify(events).includes(credential.token)).toBe(false);
    expect(JSON.stringify(events).includes(stored.tokenHash)).toBe(false);
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 120_000) })
      .where(eq(sessions.tokenHash, owner!.tokenHash));
    const capped = await issued();
    expect(
      Date.parse(capped.access.expiresAt) - Date.now(),
    ).toBeLessThanOrEqual(120_000);
  });
  it("requires an explicit current Developer grant, including for bootstrap and mixed Admin accounts", async () => {
    vi.stubEnv("ADMIN_OSU_IDS", String(owner!.osuId));
    const credential = await issued();
    expect((await me(request(undefined, credential.token))).status).toBe(200);
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, owner!.osuId));
    expect((await me(request(undefined, credential.token))).status).toBe(403);
    await expect(issued()).rejects.toMatchObject({ status: 403 });
    await expect(listDeveloperTokens(owner!)).rejects.toMatchObject({
      status: 403,
    });
    vi.stubEnv("ADMIN_OSU_IDS", "");
  });
  it("rolls back issuance and revocation when the automatic audit write fails", async () => {
    const credential = await issued();
    await db().execute(
      sql`CREATE FUNCTION developer_api_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic audit failure''; END'`,
    );
    await db().execute(
      sql`CREATE TRIGGER developer_api_test_audit_failure BEFORE INSERT ON developer_api_events FOR EACH ROW EXECUTE FUNCTION developer_api_test_audit_failure()`,
    );
    try {
      await expect(issued()).rejects.toThrow();
      await expect(
        revokeDeveloperToken(owner!, credential.access.id),
      ).rejects.toThrow();
      const tokens = await db().select().from(developerApiTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].revokedAt).toBeNull();
      expect(await db().select().from(developerApiEvents)).toHaveLength(1);
    } finally {
      await db().execute(
        sql`DROP TRIGGER developer_api_test_audit_failure ON developer_api_events`,
      );
      await db().execute(sql`DROP FUNCTION developer_api_test_audit_failure()`);
    }
  });
  it("does not accept browser cookies/session tokens as bearer credentials or fall back from invalid Authorization", async () => {
    expect((await me(request())).status).toBe(401);
    expect((await me(request(undefined, ownerToken))).status).toBe(401);
    expect((await me(request(undefined, "invalid"))).status).toBe(401);
    const credential = await issued();
    expect(await readSession(credential.token)).toBeNull();
    const result = await (
      await me(request(undefined, credential.token))
    ).json();
    expect(result.data.user.osuId).toBe(owner!.osuId);
    expect(result.data.access.kind).toBe("developer-read");
    expect(result.data.access).not.toHaveProperty("capabilities");
  });
  it("enforces bound ports, scope and safe preflight on both successes and errors", async () => {
    const preflight = request(undefined, undefined, origin, "OPTIONS");
    preflight.headers.set("Access-Control-Request-Method", "GET");
    preflight.headers.set("Access-Control-Request-Headers", "Authorization");
    const allowed = await options(preflight);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(allowed.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    preflight.headers.set("Access-Control-Request-Method", "POST");
    expect((await options(preflight)).status).toBe(403);
    preflight.headers.set("Access-Control-Request-Method", "GET");
    preflight.headers.set("Access-Control-Request-Headers", "Cookie");
    expect((await options(preflight)).status).toBe(403);
    const credential = await issued();
    for (const bad of [
      "null",
      "http://localhost:3001",
      "http://localhost.evil:3000",
    ]) {
      const denied = await me(request(undefined, credential.token, bad));
      expect(denied.status).toBe(403);
      expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    const otherAllowed = await me(
      request(undefined, credential.token, "http://127.0.0.1:3000"),
    );
    expect(otherAllowed.status).toBe(200);
    expect(otherAllowed.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:3000",
    );
    expect((await me(request(undefined, credential.token, null))).status).toBe(
      200,
    );
    const noScope = await issued(["profiles:read"]);
    const denied = await me(request(undefined, noScope.token));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("INSUFFICIENT_SCOPE");
    const invalid = await me(request(undefined, "invalid"));
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(invalid.headers.has("WWW-Authenticate")).toBe(true);
  });
  it("persists multiple ports, reads through each loopback alias and rejects unlisted ports", async () => {
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", undefined);
    const credential = await issueThroughBrowser({
      ports: [3000, 5173],
      scopes: ["identity:read"],
    });
    expect(credential.access.ports).toEqual([3000, 5173]);
    expect((await listDeveloperTokens(owner!)).tokens[0].ports).toEqual([
      3000, 5173,
    ]);
    expect(
      (await db().select().from(developerApiEvents))[0].detail,
    ).toMatchObject({ after: { ports: [3000, 5173] } });
    for (const local of [
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "https://localhost:5173",
      "http://[::1]:5173",
    ]) {
      const preflight = request(undefined, undefined, local, "OPTIONS");
      preflight.headers.set("Access-Control-Request-Method", "GET");
      expect((await options(preflight)).status).toBe(204);
      const response = await me(request(undefined, credential.token, local));
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(local);
      expect(response.headers.get("Vary")).toContain("Origin");
    }
    const denied = await me(
      request(undefined, credential.token, "http://localhost:5174"),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    for (const origin of [
      "http://example.com:5173",
      "http://localhost.evil:5173",
      "null",
      "http://user@localhost:5173",
      "http://localhost:5173/",
    ]) {
      const response = await me(request(undefined, credential.token, origin));
      expect(response.status).toBe(403);
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    vi.stubEnv("OCLR_DEVELOPER_PORTS", "3000");
    expect(
      (await me(request(undefined, credential.token, "http://localhost:5173")))
        .status,
    ).toBe(403);
    await expect(
      createDeveloperToken(owner!, {
        ports: [3000, 5173],
        scopes: ["identity:read"],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await revokeDeveloperToken(owner!, credential.access.id);
    expect((await me(request(undefined, credential.token))).status).toBe(401);
  });
  it("derives the single port of pre-migration rows without rewriting origin or audit", async () => {
    const credential = await issued();
    await db().update(developerApiTokens).set({ ports: null });
    expect((await listDeveloperTokens(owner!)).tokens[0].ports).toEqual([3000]);
    expect(
      (await me(request(undefined, credential.token, "http://127.0.0.1:3000")))
        .status,
    ).toBe(200);
    expect((await db().select().from(developerApiTokens))[0].origin).toBe(
      origin,
    );
  });
  it("rejects invalid port lists before issuing access", async () => {
    for (const ports of [
      [],
      [0],
      [65536],
      [3000.5],
      [3000, 3000],
      ["3000"],
      [null],
      Array.from({ length: 21 }, (_, i) => 3000 + i),
    ]) {
      await expect(
        createDeveloperToken(owner!, { ports, scopes: ["identity:read"] }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      createDeveloperToken(owner!, {
        ports: [3000],
        origin,
        scopes: ["identity:read"],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(developerApiTokens)).toHaveLength(0);
  });
  it("ends access immediately on explicit revoke, parent expiry/logout and Developer withdrawal", async () => {
    const first = await issued();
    await revokeDeveloperToken(owner!, first.access.id);
    await revokeDeveloperToken(owner!, first.access.id);
    expect((await me(request(undefined, first.token))).status).toBe(401);
    expect(await db().select().from(developerApiEvents)).toHaveLength(2);
    const second = await issued();
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, owner!.tokenHash));
    expect((await me(request(undefined, second.token))).status).toBe(401);
    await revokeSession(ownerToken);
    expect(await db().select().from(developerApiTokens)).toHaveLength(0);
    expect(await db().select().from(developerApiEvents)).toHaveLength(3);
  });
  it("rejects an expired token independently of a live parent session", async () => {
    const credential = await issued();
    const now = Date.now();
    await db()
      .update(developerApiTokens)
      .set({
        createdAt: new Date(now - 7200_000),
        expiresAt: new Date(now - 3600_000),
      });
    expect((await me(request(undefined, credential.token))).status).toBe(401);
  });
  it("rejects forged ownership, unexpected fields and write scopes, and serializes active-token quotas", async () => {
    for (const input of [
      { origin, scopes: ["manage_staff"] },
      { origin, scopes: [] },
      { origin, scopes: ["identity:read", "identity:read"] },
      { origin, scopes: ["identity:read"], userId: other!.osuId },
      { origin: "http://localhost.evil:3000", scopes: ["identity:read"] },
    ])
      await expect(createDeveloperToken(owner!, input)).rejects.toMatchObject({
        status: 400,
      });
    const owned = await issued();
    await expect(
      revokeDeveloperToken(other!, owned.access.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await listDeveloperTokens(other!)).tokens).toHaveLength(0);
    const createdAt = new Date();
    await db()
      .insert(developerApiTokens)
      .values(
        Array.from({ length: 8 }, () => ({
          tokenHash: hashToken(randomToken()),
          sessionHash: owner!.tokenHash,
          userId: owner!.osuId,
          origin,
          scopes: ["identity:read" as const],
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 3_600_000),
        })),
      );
    const results = await Promise.allSettled([issued(), issued()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(developerApiTokens)).toHaveLength(10);
  });
  it("requires browser management with same-origin and bounded JSON, not a bearer/cookie combination", async () => {
    const credential = await issued();
    await expect(requireStaff()).resolves.toMatchObject({ osuId: owner!.osuId });
    browser.headers.set("Authorization", `Bearer ${credential.token}`);
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
    expect((await list()).status).toBe(403);
    const forbidden = request(
      "/api/developer/tokens",
      credential.token,
      backend,
      "POST",
    );
    expect((await issue(forbidden)).status).toBe(403);
    browser.headers = new Headers();
    const tooLarge = new Request(backend + "/api/developer/tokens", {
      method: "POST",
      headers: { Origin: backend, "Content-Type": "application/json" },
      body: JSON.stringify({ input: "x".repeat(5000) }),
    });
    expect((await issue(tooLarge)).status).toBe(413);
    expect(
      (await issue(request("/api/developer/tokens", undefined, origin, "POST")))
        .status,
    ).toBe(403);
    browser.token = "";
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
    expect((await list()).status).toBe(401);
    browser.token = ownerToken;
    const path = revokeDeveloperTokenWrite.path.replace(
      "{tokenId}",
      credential.access.id,
    );
    const deleteToken = () =>
      revoke(request(path, undefined, backend, "DELETE"), {
        params: Promise.resolve({ tokenId: credential.access.id }),
      });
    const deleted = await deleteToken();
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get("Cache-Control")).toBe("no-store");
    const body = await deleted.json();
    const metadata = revokeDeveloperTokenWrite.response.parse(body);
    expect(metadata).toEqual(body);
    expect(metadata).toEqual({
      ...credential.access,
      revokedAt: expect.any(String),
    });
    expect((await me(request(undefined, credential.token))).status).toBe(401);
    const repeated = await deleteToken();
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(metadata);
    expect(await db().select().from(developerApiEvents)).toHaveLength(2);
  });
  it("cannot borrow mixed-role Admin writes, legacy provider reads or v1 mutation methods", async () => {
    await db()
      .insert(staffRoles)
      .values({ userId: owner!.osuId, role: "admin", grantedBy: owner!.osuId });
    const credential = await issued();
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const before = await businessState();
    const write = request(
      "/api/admin/settings",
      credential.token,
      backend,
      "PATCH",
    );
    write.headers.set("Content-Type", "application/json");
    browser.headers = write.headers;
    expect((await saveAppearance(write)).status).toBe(403);
    expect(
      (
        await legacyProfile(request("/api/players/651307", credential.token), {
          params: Promise.resolve({ osuId: "651307" }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await mutate(request(undefined, credential.token, origin, "POST")))
        .status,
    ).toBe(405);
    expect((await me(request(undefined, credential.token))).status).toBe(200);
    expect(provider).not.toHaveBeenCalled();
    expect(await businessState()).toEqual(before);
    const audit = await auditLog(
      { osuId: owner!.osuId, username: owner!.username },
      { module: "developer_api" },
    );
    expect(JSON.stringify(audit).includes(credential.token)).toBe(false);
  });
  it("provides bounded no-store HEAD, 404/400/429/500 errors and stable request IDs with CORS", async () => {
    const credential = await issued();
    const result = await head(
      request(undefined, credential.token, origin, "HEAD"),
    );
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("");
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    const unknown = await missing(request("/api/v1/unknown", credential.token));
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(
      (await me(request("/api/v1/me?token=forbidden", credential.token)))
        .status,
    ).toBe(400);
    const failed = await developerReadResponse(
      request(undefined, credential.token),
      "identity:read",
      () => {
        throw new Error("private implementation detail");
      },
    );
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    const failure = await failed.json();
    expect(failure.error.requestId).toBe(failed.headers.get("X-Request-Id"));
    expect(failure.error.message).not.toContain("private implementation");
    for (let index = 0; index < 120; index++) {
      try {
        developerApiLimiter.take(`read:${hashToken(credential.token)}`, 120);
      } catch {
        break;
      }
    }
    const limited = await me(request(undefined, credential.token));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });
  it("rejects every existing business mutation route even with an independent Admin cookie", async () => {
    await db()
      .insert(staffRoles)
      .values({ userId: owner!.osuId, role: "admin", grantedBy: owner!.osuId });
    const credential = await issued();
    const before = await businessState();
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const files = (readdirSync("src/app/api", { recursive: true }) as string[])
      .filter(
        (file) =>
          file.endsWith("route.ts") &&
          !file.startsWith("v1/") &&
          !file.startsWith("developer/"),
      )
      .sort();
    let checked = 0;
    for (const file of files) {
      const route = await import(
        /* @vite-ignore */ `../../src/app/api/${file}`
      );
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        if (!route[method]) continue;
        const incoming = new Request(
          `${backend}/api/${file.replace(/\/route.ts$/, "")}`,
          {
            method,
            headers: {
              Origin: backend,
              Authorization: `Bearer ${credential.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ confirmed: true }),
          },
        );
        browser.headers = incoming.headers;
        const response = await route[method](incoming, {
          params: Promise.resolve({
            edition: "test-cup",
            id: "00000000-0000-4000-8000-000000000268",
            fixtureId: "00000000-0000-4000-8000-000000000268",
            teamId: "00000000-0000-4000-8000-000000000268",
            entryId: "00000000-0000-4000-8000-000000000268",
            replayId: "00000000-0000-4000-8000-000000000268",
            osuId: String(owner!.osuId),
          }),
        });
        expect(response.status, `${method} ${file}`).toBe(403);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(26);
    expect(provider).not.toHaveBeenCalled();
    expect(await businessState()).toEqual(before);
  });
});
