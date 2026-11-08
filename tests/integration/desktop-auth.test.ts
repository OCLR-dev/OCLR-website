import { randomBytes, createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { fixtureReferees, staffRoles } from "../../src/db/schema";
import {
  desktopAuthorizations,
  desktopSessions,
} from "../../src/db/desktop-auth-schema";
import {
  createDesktopAuthorization,
  getDesktopAuthorization,
  approveDesktopAuthorization,
  exchangeDesktopAuthorization,
  requireDesktopUser,
  desktopResponse,
  listDesktopSessions,
  desktopScopes,
} from "../../src/lib/desktop-auth";
import { desktopFixtures, desktopPanel } from "../../src/lib/desktop-referee";
import {
  seedRefereeFixture,
  refereeTestUser,
  refereeTestAdmin,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
import { POST as relay } from "../../src/app/api/referee/v1/fixtures/[fixtureId]/relay/route";
import { refereeRelayWrite } from "../../src/lib/referee-relay-contract";
import { desktopErrorSchema, desktopContractVersion } from "../../src/lib/desktop-wire";
import { refereeIrcBrowserCommand } from "../../src/lib/referee-irc";
import { POST as requestRoute } from "../../src/app/api/desktop/v1/auth/requests/route";
import { POST as decisionRoute } from "../../src/app/api/desktop/v1/auth/decision/route";
import { POST as exchangeRoute } from "../../src/app/api/desktop/v1/auth/exchange/route";
import { POST as refreshRoute } from "../../src/app/api/desktop/v1/auth/refresh/route";
import { POST as revokeRoute } from "../../src/app/api/desktop/v1/auth/revoke/route";
import { DELETE as sessionRoute } from "../../src/app/api/desktop/v1/auth/sessions/[id]/route";
import {
  requestDesktopAuthWrite,
  decideDesktopAuthWrite,
  exchangeDesktopAuthWrite,
  refreshDesktopAuthWrite,
  revokeDesktopAuthWrite,
  deleteDesktopSessionWrite,
} from "../../src/lib/desktop-auth-write-contracts";
import { requireUser } from "../../src/lib/auth/user";

vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: vi.fn(),
}));
const origin = "http://127.0.0.1:3001";
function post(path: string, input: unknown, authorization?: string) {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(input),
  });
}
async function envelope<T extends { meta: { requestId: string } }>(
  response: Response,
  schema: z.ZodType<T>,
  status: number,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("X-OCLR-Desktop-Contract")).toBe(desktopContractVersion);
  const body = await response.json();
  const parsed = schema.parse(body);
  expect(parsed).toEqual(body);
  expect(response.headers.get("X-Request-Id")).toBe(parsed.meta.requestId);
  return parsed;
}
async function desktopFailure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const parsed = desktopErrorSchema.parse(await response.json());
  expect(parsed.error.code).toBe(code);
  expect(response.headers.get("X-Request-Id")).toBe(parsed.error.requestId);
}
async function emptyRevoke(response: Response) {
  expect(response.status).toBe(204);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).toBe("");
}
function decide(body: URLSearchParams) {
  return decisionRoute(
    new Request(origin + decideDesktopAuthWrite.path, {
      method: "POST",
      headers: { Origin: origin },
      body,
    }),
  );
}
async function callback(id: string, decision: "approve" | "deny") {
  const response = await decide(new URLSearchParams({ request_id: id, decision }));
  expect(response.status).toBe(303);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(await response.text()).toBe("");
  return new URL(response.headers.get("Location")!);
}
const enabled = !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)(
  "desktop PKCE authorization and private read boundary",
  () => {
    let seeded: Awaited<ReturnType<typeof seedRefereeFixture>>;
    beforeEach(async () => {
      assertTestDatabase(process.env.TEST_DATABASE_URL);
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.APP_URL = origin;
      vi.mocked(requireUser).mockResolvedValue(refereeTestUser);
      seeded = await seedRefereeFixture();
      await db().execute(
        sql`TRUNCATE desktop_authorizations, desktop_sessions, desktop_tokens, desktop_security_events CASCADE`,
      );
    });
    afterAll(closeDb);
    async function request() {
      const verifier = randomBytes(32).toString("base64url");
      const body = {
        client_id: "oclr-ref-tools",
        client_version: "0.8.0",
        platform: "linux",
        device_name: "OCLR ref tools",
        redirect_uri: "http://127.0.0.1:49152/oclr/callback",
        scope: [...desktopScopes],
        state: randomBytes(32).toString("base64url"),
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      };
      const { data: info } = await envelope(
        await requestRoute(post(requestDesktopAuthWrite.path, body)),
        requestDesktopAuthWrite.response,
        201,
      );
      return { body, info, verifier };
    }
    async function approved() {
      const r = await request();
      const url = await callback(r.info.authorization_request_id, "approve");
      expect(url.origin + url.pathname).toBe(r.body.redirect_uri);
      expect(url.searchParams.get("state")).toBe(r.body.state);
      return {
        ...r,
        exchange: {
          client_id: "oclr-ref-tools",
          authorization_request_id: r.info.authorization_request_id,
          code: url.searchParams.get("code")!,
          code_verifier: r.verifier,
          redirect_uri: r.body.redirect_uri,
        },
      };
    }
    async function login() {
      const r = await approved();
      const { data: token } = await envelope(
        await exchangeRoute(post(exchangeDesktopAuthWrite.path, r.exchange)),
        exchangeDesktopAuthWrite.response,
        200,
      );
      return { ...r, token };
    }
    const bearer = (
      token: string,
      path = "/api/referee/v1/me/fixtures?view=active&limit=50",
    ) =>
      new Request("http://127.0.0.1:3001" + path, {
        headers: { Authorization: `Bearer ${token}` },
      });
    it("requires loopback S256, rejects unsupported scope and has no GET approval side effects", async () => {
      const r = await request();
      for (const patch of [
        { redirect_uri: "https://evil.example/oclr/callback" },
        { redirect_uri: "http://127.0.0.1:80/oclr/callback" },
        { code_challenge_method: "plain" },
        { scope: ["admin:write"] },
      ])
        await expect(
          createDesktopAuthorization({ ...r.body, ...patch }),
        ).rejects.toMatchObject({ status: 400 });
      const view = await getDesktopAuthorization(
        refereeTestUser,
        r.info.authorization_request_id,
      );
      expect(view.verificationCode).toBe(r.info.verification_code);
      expect(await db().select().from(desktopSessions)).toHaveLength(0);
      await desktopFailure(
        await requestRoute(post(requestDesktopAuthWrite.path, r.body, "Bearer synthetic-only")),
        403,
        "INSUFFICIENT_SCOPE",
      );
      const form = new URLSearchParams({
        request_id: r.info.authorization_request_id,
        decision: "approve",
      });
      form.append("decision", "deny");
      await desktopFailure(await decide(form), 400, "INVALID_REQUEST");
      const url = await callback(r.info.authorization_request_id, "deny");
      expect(url.searchParams.get("error")).toBe("access_denied");
      expect(url.searchParams.get("state")).toBe(r.body.state);
      await expect(
        approveDesktopAuthorization(
          refereeTestUser,
          r.info.authorization_request_id,
          true,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("binds verifier and redirect without consuming valid code; exchange is one-time under concurrency", async () => {
      const r = await approved();
      await expect(
        exchangeDesktopAuthorization({
          ...r.exchange,
          code_verifier: "A".repeat(43),
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        exchangeDesktopAuthorization({
          ...r.exchange,
          redirect_uri: "http://127.0.0.1:49153/oclr/callback",
        }),
      ).rejects.toMatchObject({ status: 400 });
      const replies = await Promise.allSettled([
        exchangeDesktopAuthorization(r.exchange),
        exchangeDesktopAuthorization(r.exchange),
      ]);
      expect(replies.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(await db().select().from(desktopSessions)).toHaveLength(1);
    });
    it("terminates after five invalid attempts and rejects expired authorizations", async () => {
      const r = await approved();
      for (let i = 0; i < 5; i++)
        await expect(
          exchangeDesktopAuthorization({
            ...r.exchange,
            code_verifier: "A".repeat(43),
          }),
        ).rejects.toMatchObject({ status: 400 });
      await expect(
        exchangeDesktopAuthorization(r.exchange),
      ).rejects.toMatchObject({ status: 400 });
      const a = await request();
      await db()
        .update(desktopAuthorizations)
        .set({ expiresAt: new Date(0) })
        .where(eq(desktopAuthorizations.id, a.info.authorization_request_id));
      await expect(
        approveDesktopAuthorization(
          refereeTestUser,
          a.info.authorization_request_id,
          true,
        ),
      ).rejects.toMatchObject({ status: 410 });
    });
    it("expires approved exchange codes within 60 seconds and never extends request expiry", async () => {
      const startedAt = Date.now();
      const r = await approved();
      const [row] = await db()
        .select()
        .from(desktopAuthorizations)
        .where(eq(desktopAuthorizations.id, r.info.authorization_request_id));
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + 60000);
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60000);
      await db()
        .update(desktopAuthorizations)
        .set({ expiresAt: new Date(0) })
        .where(eq(desktopAuthorizations.id, row.id));
      await expect(
        exchangeDesktopAuthorization(r.exchange),
      ).rejects.toMatchObject({
        code: "INVALID_GRANT",
      });
      expect(await db().select().from(desktopSessions)).toHaveLength(0);

      const ending = await request();
      const originalExpiry = new Date(Date.now() + 30000);
      await db()
        .update(desktopAuthorizations)
        .set({ expiresAt: originalExpiry })
        .where(
          eq(desktopAuthorizations.id, ending.info.authorization_request_id),
        );
      await approveDesktopAuthorization(
        refereeTestUser,
        ending.info.authorization_request_id,
        true,
      );
      const [clipped] = await db()
        .select()
        .from(desktopAuthorizations)
        .where(
          eq(desktopAuthorizations.id, ending.info.authorization_request_id),
        );
      expect(clipped.expiresAt).toEqual(originalExpiry);
    });
    it("rotates refresh family and revokes old and new access on refresh reuse", async () => {
      const { token } = await login();
      const input = {
        client_id: "oclr-ref-tools",
        refresh_token: token.refresh_token,
      };
      const refresh = () => refreshRoute(post(refreshDesktopAuthWrite.path, input));
      const { data: refreshed } = await envelope(
        await refresh(),
        refreshDesktopAuthWrite.response,
        200,
      );
      expect(refreshed.session_id).toBe(token.session_id);
      expect(refreshed.session_expires_at).toBe(token.session_expires_at);
      expect(refreshed.refresh_token).not.toBe(token.refresh_token);
      expect(
        (await requireDesktopUser(bearer(token.access_token), "referee:relay"))
          .osuId,
      ).toBe(refereeTestUser.osuId);
      await desktopFailure(await refresh(), 401, "INVALID_REFRESH_TOKEN");
      await expect(
        requireDesktopUser(bearer(refreshed.access_token)),
      ).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    });
    it("enforces subject session revoke and current referee grants", async () => {
      const { token } = await login();
      const deleteSession = (id: string) =>
        sessionRoute(new Request(origin + deleteDesktopSessionWrite.path.replace("{id}", id), {
          method: "DELETE",
          headers: { Origin: origin },
        }), { params: Promise.resolve({ id }) });
      vi.mocked(requireUser).mockResolvedValue(refereeTestAdmin);
      await emptyRevoke(await deleteSession(token.session_id));
      await requireDesktopUser(bearer(token.access_token));
      const revoke = (refresh_token: string) =>
        revokeRoute(post(revokeDesktopAuthWrite.path, { client_id: "oclr-ref-tools", refresh_token }));
      await emptyRevoke(await revoke("invalid"));
      await requireDesktopUser(bearer(token.access_token));
      await emptyRevoke(await revoke(token.refresh_token));
      await expect(
        requireDesktopUser(bearer(token.access_token)),
      ).rejects.toMatchObject({ status: 401 });
      vi.mocked(requireUser).mockResolvedValue(refereeTestUser);
      const owned = await login();
      await emptyRevoke(await deleteSession(owned.token.session_id));
      await expect(requireDesktopUser(bearer(owned.token.access_token))).rejects.toMatchObject({
        code: "SESSION_REVOKED",
      });
      const b = await login();
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, refereeTestUser.osuId));
      await expect(
        requireDesktopUser(bearer(b.token.access_token)),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        JSON.stringify(await listDesktopSessions(refereeTestUser)),
      ).not.toContain("oclr_desk_");
    });
    it("serves the v1 relay receipt for legacy sync, command dispatch and disconnect", async () => {
      const { token } = await login();
      const send = (body: unknown, credential = token.access_token) =>
        relay(
          new Request(
            `http://127.0.0.1:3001${refereeRelayWrite.path.replace("{fixtureId}", seeded.fixtureId)}`,
            {
              method: refereeRelayWrite.method,
              headers: {
                Authorization: `Bearer ${credential}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            },
          ),
          { params: Promise.resolve({ fixtureId: seeded.fixtureId }) },
        );
      const bind = {
        action: "bind",
        roomId: 123,
        ircUsername: refereeTestUser.username,
      };
      const denied = await send(bind, "oclr_dev_" + "a".repeat(43));
      expect(denied.status).toBe(403);
      expect(desktopErrorSchema.parse(await denied.json()).error).toMatchObject(
        {
          code: "INSUFFICIENT_SCOPE",
          requestId: denied.headers.get("X-Request-Id"),
        },
      );
      async function readReceipt(body: unknown) {
        const response = await send(body);
        expect(response.status).toBe(200);
        const receipt = refereeRelayWrite.response.parse(await response.json());
        expect(receipt.meta.requestId).toBe(
          response.headers.get("X-Request-Id"),
        );
        expect(response.headers.get("X-OCLR-Referee-Contract")).toBe(
          receipt.meta.contractVersion,
        );
        return receipt.data;
      }
      const bound = await readReceipt(bind);
      expect(bound).toMatchObject({
        sequence: 0,
        command: null,
        receiptReasons: true,
        bpSync: true,
      });
      const sync = {
        action: "sync",
        connectionId: bound.connectionId,
        sequence: 1,
        projection: { status: "connected", messages: [] },
        receipts: [],
      };
      expect((await readReceipt(sync)).command).toBeNull();
      await refereeIrcBrowserCommand(
        refereeTestUser,
        "test-cup",
        seeded.fixtureId,
        { action: "queue", requestKey: randomUUID(), text: "!mp aborttimer" },
      );
      const next = { ...sync, sequence: 2 };
      expect((await readReceipt(next)).command).toMatchObject({
        text: "!mp aborttimer",
        target: "#mp_123",
      });
      expect(await readReceipt(next)).toEqual({
        connectionId: bound.connectionId,
        sequence: 2,
        command: null,
      });
      expect(
        await readReceipt({
          action: "disconnect",
          connectionId: bound.connectionId,
        }),
      ).toMatchObject({ sequence: 2, command: null });
    });
    it("serves client-shaped snapshots only for assigned fixtures and never initializes on GET", async () => {
      const r = await login();
      const list = await desktopFixtures(bearer(r.token.access_token));
      expect(list.items.map((f) => f.fixtureId)).toContain(seeded.fixtureId);
      const panel = await desktopPanel(
        bearer(
          r.token.access_token,
          `/api/referee/v1/fixtures/${seeded.fixtureId}/panel`,
        ),
        seeded.fixtureId,
      );
      expect(panel.viewer.osuId).toBe(refereeTestUser.osuId);
      expect(panel.workspace.session?.revision).toBe(
        seeded.workspace.session?.revision,
      );
      expect(JSON.stringify(panel)).not.toContain("oclr_desk_");
      // Cross-repository schema validation consumes only fictional fixtures and unusable tokens.
      for (const [name, data] of Object.entries({
        fixtures: list,
        panel,
        request: r.info,
        token: {
          ...r.token,
          access_token: "oclr_desk_at_" + "A".repeat(43),
          refresh_token: "oclr_desk_rt_" + "B".repeat(43),
        },
      }))
        writeFileSync(
          `/tmp/oclr-desktop-contract-${name}.json`,
          await desktopResponse(data).text(),
        );
      await db()
        .delete(fixtureReferees)
        .where(
          and(
            eq(fixtureReferees.fixtureId, seeded.fixtureId),
            eq(fixtureReferees.userId, refereeTestUser.osuId),
          ),
        );
      await expect(
        desktopPanel(
          bearer(
            r.token.access_token,
            `/api/referee/v1/fixtures/${seeded.fixtureId}/panel`,
          ),
          seeded.fixtureId,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await desktopFixtures(bearer(r.token.access_token))).items,
      ).toHaveLength(0);
      // Admin desktop tokens do not inherit the browser's all-fixtures exception.
      await db()
        .insert(staffRoles)
        .values({
          userId: refereeTestAdmin.osuId,
          editionSlug: "test-cup",
          role: "admin",
          grantedBy: refereeTestAdmin.osuId,
        })
        .onConflictDoNothing();
      const a = await request();
      const uri = new URL(
        await approveDesktopAuthorization(
          refereeTestAdmin,
          a.info.authorization_request_id,
          true,
        ),
      );
      const t = await exchangeDesktopAuthorization({
        client_id: "oclr-ref-tools",
        authorization_request_id: a.info.authorization_request_id,
        code: uri.searchParams.get("code"),
        code_verifier: a.verifier,
        redirect_uri: a.body.redirect_uri,
      });
      await expect(
        desktopPanel(
          bearer(
            t.access_token,
            `/api/referee/v1/fixtures/${seeded.fixtureId}/panel`,
          ),
          seeded.fixtureId,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  },
);
