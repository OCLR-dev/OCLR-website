import { assertTestDatabase } from "../database";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { db, closeDb } from "../../src/db";
import { users, sessions, oauthStates } from "../../src/db/schema";
import { GET as start } from "../../src/app/auth/osu/route";
import { GET as callback } from "../../src/app/auth/osu/callback/route";
import { POST as switchRole } from "../../src/app/auth/dev-role/route";
import * as previewConfig from "../../src/lib/auth/local-role-preview-config";
import { demoPlayers } from "../../src/lib/local-role-preview-model";
import { POST as logout } from "../../src/app/auth/logout/route";
import { logoutWrite } from "../../src/lib/browser-connection-write-contracts";
import {
  createSession,
  readSession,
  readSessionContext,
  revokeSession,
  switchLocalRolePreviewSession,
} from "../../src/lib/auth/sessions";
import { hashToken, randomToken } from "../../src/lib/auth/tokens";
import { eq, sql } from "drizzle-orm";
const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  "OAuth and session boundaries (real PostgreSQL; provider transport mocked)",
  () => {
    beforeAll(() => {
      assertTestDatabase(testUrl);
      vi.stubEnv("DATABASE_URL", testUrl!);
      vi.stubEnv("APP_URL", "https://oclr.example.test");
      vi.stubEnv("OSU_CLIENT_ID", "123");
      vi.stubEnv("OSU_CLIENT_SECRET", "synthetic-provider-secret");
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
    });
    beforeEach(async () => {
      await db().delete(sessions);
      await db().delete(oauthStates);
      await db().execute(sql`TRUNCATE users CASCADE`);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    async function begin() {
      const result = await start();
      const location = new URL(result.headers.get("location")!);
      const state = location.searchParams.get("state")!;
      expect(location.origin).toBe("https://osu.ppy.sh");
      expect(location.searchParams.get("scope")).toBe("identify");
      expect(result.headers.get("set-cookie")).toContain("HttpOnly");
      expect(result.headers.get("set-cookie")).toContain("Secure");
      return state;
    }
    function request(state: string, code = "synthetic-code") {
      return new NextRequest(
        `https://oclr.example.test/auth/osu/callback?state=${state}&code=${code}`,
        {
          headers: {
            cookie: `__Host-oclr_oauth=${state}; oclr-locale=zh-Hant; oclr-theme=dark`,
          },
        },
      );
    }
    it("switches existing demo accounts through the form and restores the original browser session on exit", async () => {
      const origin = "https://oclr.example.test";
      const key = randomToken();
      const [captain, player] = demoPlayers;
      await db()
        .insert(users)
        .values([captain, player, { osuId: 160300, username: "Normal" }]);
      const normal = await createSession(160300);
      const browserCookie = `__Host-oclr_session=${normal.token}`;
      const previewCookie = previewConfig.localRolePreviewCookie;
      // Exercise the real handler and session store against the isolated test database.
      // The real configuration boundary has separate coverage without touching the preview DB.
      const config = vi
        .spyOn(previewConfig, "localRolePreviewKey")
        .mockReturnValue(key);
      try {
        function post(
          path: string,
          token?: string,
          fields?: Record<string, string>,
        ) {
          return new NextRequest(`${origin}${path}`, {
            method: "POST",
            headers: {
              origin,
              host: new URL(origin).host,
              cookie: token
                ? `${browserCookie}; ${previewCookie}=${token}`
                : browserCookie,
            },
            body: fields ? new URLSearchParams(fields) : undefined,
          });
        }
        const first = await switchRole(
          post("/auth/dev-role", undefined, {
            code: key,
            account: String(captain.osuId),
          }),
        );
        expect(first.status).toBe(303);
        expect(first.headers.get("location")).toBe(`${origin}/dev/roles`);
        const firstToken = first.cookies.get(previewCookie)!.value;
        expect(await readSession(firstToken, key)).toEqual(captain);
        expect(first.cookies.has("__Host-oclr_session")).toBe(false);

        const second = await switchRole(
          post("/auth/dev-role", firstToken, { account: String(player.osuId) }),
        );
        expect(second.status).toBe(303);
        const secondToken = second.cookies.get(previewCookie)!.value;
        expect(await readSession(secondToken, key)).toEqual(player);
        expect(await readSession(firstToken, key)).toBeNull();

        const exit = await logout(post("/auth/logout", secondToken));
        expect(exit.headers.get("location")).toBe(`${origin}/dev/roles`);
        expect(exit.cookies.get(previewCookie)?.maxAge).toBe(0);
        expect(exit.cookies.has("__Host-oclr_session")).toBe(false);
        expect(await readSession(secondToken, key)).toBeNull();
        expect(await readSession(normal.token)).toMatchObject({
          osuId: 160300,
        });
      } finally {
        config.mockRestore();
      }
    });
    it("isolates preview cookies and rotates only the previously selected synthetic session", async () => {
      const key = randomToken();
      await db()
        .insert(users)
        .values([
          { osuId: 160301, username: "Demo_Captain" },
          { osuId: 160302, username: "Demo_Member" },
        ]);
      const normal = await createSession(160301);
      const captain = await switchLocalRolePreviewSession(160301, key);
      expect(await readSession(captain.token)).toBeNull();
      expect(await readSession(captain.token, randomToken())).toBeNull();
      expect(await readSession(normal.token, key)).toBeNull();
      expect(await readSessionContext(captain.token, key)).toMatchObject({
        osuId: 160301,
      });
      const member = await switchLocalRolePreviewSession(160302, key, captain);
      expect(member.expiresAt).toEqual(captain.expiresAt);
      expect(await readSession(captain.token, key)).toBeNull();
      await expect(
        switchLocalRolePreviewSession(160301, key, captain),
      ).rejects.toMatchObject({ status: 409 });
      expect(await readSession(member.token, key)).toMatchObject({
        osuId: 160302,
      });
      await revokeSession(member.token, key);
      expect(await readSession(member.token, key)).toBeNull();
      expect(await readSession(normal.token)).toMatchObject({ osuId: 160301 });
    });
    it("accepts one valid callback, persists stable identity, hashes sessions and rejects replay", async () => {
      const provider = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            access_token: "synthetic-access",
            token_type: "Bearer",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ id: 10001, username: "Synthetic Player" }),
        );
      vi.stubGlobal("fetch", provider);
      const state = await begin();
      const result = await callback(request(state));
      expect(result.headers.get("location")).toBe(
        "https://oclr.example.test/dashboard",
      );
      const token = result.cookies.get("__Host-oclr_session")!.value;
      // Redirect/session issuance must not reset appearance or locale choices.
      expect(result.cookies.get("oclr-locale")).toBeUndefined();
      expect(result.cookies.get("oclr-theme")).toBeUndefined();
      expect(await readSession(token)).toEqual({
        osuId: 10001,
        username: "Synthetic Player",
      });
      expect((await db().select().from(sessions))[0].tokenHash).toBe(
        hashToken(token),
      );
      expect(JSON.stringify(await db().select().from(users))).not.toContain(
        "synthetic-access",
      );
      expect(
        (await callback(request(state))).headers.get("location"),
      ).toContain("error=failed");
      expect(provider).toHaveBeenCalledTimes(2);
    });

    it("reopens site chat on the original page after OAuth", async () => {
      const base = "https://oclr.example.test";
      const beginChat = (returnTo: string) =>
        start(
          new Request(
            base +
              "/auth/osu?" +
              new URLSearchParams({
                chat_edition: "cup-a",
                chat_return: returnTo,
              }),
          ),
        );
      const unsafe = await beginChat("//foreign.example/wiki/liru");
      expect(unsafe.cookies.get("__Host-oclr_oauth_chat")).toBeUndefined();
      const login = await beginChat("/wiki/liru?appearance=default");
      const state = new URL(login.headers.get("location")!).searchParams.get(
        "state",
      )!;
      const chatCookie = login.cookies.get("__Host-oclr_oauth_chat");
      expect(chatCookie?.httpOnly).toBe(true);
      expect(chatCookie?.secure).toBe(true);

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            Response.json({
              access_token: "synthetic-access",
              token_type: "Bearer",
            }),
          )
          .mockResolvedValueOnce(
            Response.json({ id: 10001, username: "Synthetic Player" }),
          ),
      );
      const cb = request(state);
      cb.cookies.set(chatCookie!.name, chatCookie!.value);
      const result = await callback(cb);
      expect(result.headers.get("location")).toBe(
        base + "/wiki/liru?appearance=default#ask-liru",
      );
      expect(result.cookies.get("__Host-oclr_session")).toBeDefined();
      expect(result.cookies.get(chatCookie!.name)?.maxAge).toBe(0);
    });
    it("rejects mismatched, expired and unknown state before contacting the provider", async () => {
      const provider = vi.fn();
      vi.stubGlobal("fetch", provider);
      const state = await begin();
      const mismatch = new NextRequest(
        `https://oclr.example.test/auth/osu/callback?state=${randomToken()}&code=x`,
        { headers: { cookie: `__Host-oclr_oauth=${state}` } },
      );
      expect((await callback(mismatch)).headers.get("location")).toContain(
        "error=failed",
      );
      await db()
        .update(oauthStates)
        .set({ expiresAt: new Date(0) })
        .where(eq(oauthStates.stateHash, hashToken(state)));
      expect(
        (await callback(request(state))).headers.get("location"),
      ).toContain("error=failed");
      expect(
        (await callback(request(randomToken()))).headers.get("location"),
      ).toContain("error=failed");
      expect(provider).not.toHaveBeenCalled();
    });
    it("handles declined authorization without creating identity", async () => {
      const state = await begin();
      const req = new NextRequest(
        `https://oclr.example.test/auth/osu/callback?state=${state}&error=access_denied`,
        { headers: { cookie: `__Host-oclr_oauth=${state}` } },
      );
      expect((await callback(req)).headers.get("location")).toContain(
        "error=declined",
      );
      expect(await db().select().from(users)).toHaveLength(0);
    });
    it("isolates sessions, expires them and revokes logout only for same-origin requests", async () => {
      await db()
        .insert(users)
        .values([
          { osuId: 10001, username: "Synthetic A" },
          { osuId: 10002, username: "Synthetic B" },
        ]);
      const a = await createSession(10001);
      const b = await createSession(10002);
      expect((await readSession(a.token))?.osuId).toBe(10001);
      expect((await readSession(b.token))?.osuId).toBe(10002);
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "");
      expect((await readSession(a.token))?.osuId).toBe(10001);
      expect((await readSession(b.token))?.osuId).toBe(10002);
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
      const headers = {
        cookie: `__Host-oclr_session=${a.token}`,
        origin: "https://evil.example.test",
      };
      expect(
        (
          await logout(
            new NextRequest("https://oclr.example.test/auth/logout", {
              method: "POST",
              headers,
            }),
          )
        ).status,
      ).toBe(403);
      headers.origin = "https://oclr.example.test";
      const signOut = (requestHeaders: HeadersInit) =>
        logout(new NextRequest("https://oclr.example.test" + logoutWrite.path, {
          method: "POST",
          headers: requestHeaders,
        }));
      const response = await signOut(headers);
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        "https://oclr.example.test/login?loggedOut=1",
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.cookies.get("__Host-oclr_session")).toMatchObject({
        value: "",
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      expect(await response.text()).toBe("");
      const repeated = await signOut({ origin: headers.origin });
      expect(repeated.status).toBe(303);
      expect(repeated.cookies.get("__Host-oclr_session")?.maxAge).toBe(0);
      expect(await readSession(a.token)).toBeNull();
      expect(await readSession(b.token)).not.toBeNull();
      await db()
        .update(sessions)
        .set({ expiresAt: new Date(0) })
        .where(eq(sessions.tokenHash, hashToken(b.token)));
      expect(await readSession(b.token)).toBeNull();
    });
  },
);
