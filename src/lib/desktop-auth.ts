import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, inArray, sql, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffRoles, users } from "@/db/schema";
import {
  desktopAuthorizations as auth,
  desktopSessions as sessions,
  desktopTokens as tokens,
  desktopSecurityEvents as audit,
} from "@/db/desktop-auth-schema";
import { appUrl, HttpError } from "./http";
import type { User } from "./auth/sessions";
import {
  desktopApiVersion,
  desktopContractVersion,
  desktopPollAfterSeconds,
} from "./desktop-wire";
export class DesktopError extends HttpError {
  constructor(
    status: number,
    public code: string,
  ) {
    super(status, code);
  }
}
export const desktopScopes = [
  "referee:fixtures:read",
  "referee:context:read",
  "referee:panel:read",
  "referee:relay",
] as const;
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const client = z.literal("oclr-ref-tools");
const redirect = z.string().refine((s) => {
  try {
    const u = new URL(s);
    return (
      u.protocol === "http:" &&
      u.hostname === "127.0.0.1" &&
      Number(u.port) >= 1024 &&
      Number(u.port) <= 65535 &&
      u.pathname === "/oclr/callback" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
});
const requestSchema = z
  .object({
    client_id: client,
    client_version: z
      .string()
      .max(64)
      .regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/),
    platform: z.enum(["linux", "darwin", "win32"]),
    device_name: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[^\p{Cc}\p{Cf}]+$/u),
    redirect_uri: redirect,
    scope: z
      .array(z.enum(desktopScopes))
      .min(1)
      .max(4)
      .refine((a) => new Set(a).size === a.length),
    state: secret,
    code_challenge: secret,
    code_challenge_method: z.literal("S256"),
  })
  .strict();
type Reader = Pick<ReturnType<typeof db>, "select" | "insert" | "update">;
async function eligible(reader: Reader, id: number) {
  const rows = await reader
    .select({ id: staffRoles.id })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.userId, id),
        isNull(staffRoles.revokedAt),
        inArray(staffRoles.role, ["referee", "admin"]),
      ),
    )
    .limit(1);
  if (!rows.length) throw new DesktopError(403, "REFEREE_ACCESS_REVOKED");
}
export async function createDesktopAuthorization(input: unknown) {
  const p = requestSchema.safeParse(input);
  if (!p.success) throw new DesktopError(400, "INVALID_REQUEST");
  const v = p.data;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(409001)`);
    await tx.delete(auth).where(lt(auth.expiresAt, new Date()));
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(auth);
    if (count >= 500) throw new DesktopError(429, "RATE_LIMITED");
    const [row] = await tx
      .insert(auth)
      .values({
        deviceName: v.device_name,
        platform: v.platform,
        redirectUri: v.redirect_uri,
        state: v.state,
        challenge: v.code_challenge,
        scopes: v.scope,
        verificationCode: randomBytes(4)
          .toString("hex")
          .toUpperCase()
          .replace(/(.{4})/, "$1-"),
        expiresAt: new Date(Date.now() + 600000),
      })
      .returning();
    return {
      authorization_request_id: row.id,
      authorization_url: `${appUrl()}/desktop/authorize?request_id=${row.id}`,
      verification_code: row.verificationCode,
      expires_at: row.expiresAt.toISOString(),
    };
  });
}
export async function getDesktopAuthorization(actor: User, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new DesktopError(400, "INVALID_REQUEST");
  const [row] = await db().select().from(auth).where(eq(auth.id, id));
  if (!row || row.expiresAt <= new Date())
    throw new DesktopError(410, "AUTH_REQUEST_EXPIRED");
  if (row.status !== "pending")
    throw new DesktopError(409, "AUTH_REQUEST_ALREADY_HANDLED");
  await eligible(db(), actor.osuId);
  return {
    id: row.id,
    deviceName: row.deviceName,
    verificationCode: row.verificationCode,
    scopes: row.scopes,
    expiresAt: row.expiresAt.toISOString(),
  };
}
export async function approveDesktopAuthorization(
  actor: User,
  id: string,
  allow: boolean,
) {
  if (!z.uuid().safeParse(id).success)
    throw new DesktopError(400, "INVALID_REQUEST");
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(auth)
      .where(eq(auth.id, id))
      .for("update");
    if (!row || row.expiresAt <= new Date())
      throw new DesktopError(410, "AUTH_REQUEST_EXPIRED");
    if (row.status !== "pending")
      throw new DesktopError(409, "AUTH_REQUEST_ALREADY_HANDLED");
    if (allow) await eligible(tx, actor.osuId);
    const code = opaque();
    await tx
      .update(auth)
      .set({
        status: allow ? "approved" : "denied",
        userId: actor.osuId,
        codeHash: allow ? digest(code) : null,
        expiresAt: allow
          ? new Date(Math.min(row.expiresAt.getTime(), Date.now() + 60000))
          : row.expiresAt,
      })
      .where(eq(auth.id, id));
    await tx.insert(audit).values({
      userId: actor.osuId,
      action: allow ? "authorization_approved" : "authorization_denied",
    });
    const url = new URL(row.redirectUri);
    url.searchParams.set("state", row.state);
    url.searchParams.set(
      allow ? "code" : "error",
      allow ? code : "access_denied",
    );
    return url.toString();
  });
}
type Session = typeof sessions.$inferSelect;
async function issue(reader: Reader, s: Session, user: User) {
  const now = Date.now();
  const access = "oclr_desk_at_" + opaque(),
    refresh = "oclr_desk_rt_" + opaque();
  const at = new Date(Math.min(now + 600000, s.expiresAt.getTime())),
    rt = new Date(Math.min(now + 7200000, s.expiresAt.getTime()));
  await reader.insert(tokens).values([
    { hash: digest(access), sessionId: s.id, kind: "access", expiresAt: at },
    { hash: digest(refresh), sessionId: s.id, kind: "refresh", expiresAt: rt },
  ]);
  await reader
    .update(sessions)
    .set({ refreshedAt: new Date(now), refreshExpiresAt: rt })
    .where(eq(sessions.id, s.id));
  return {
    token_type: "Bearer",
    access_token: access,
    expires_in: Math.floor((at.getTime() - now) / 1000),
    access_expires_at: at.toISOString(),
    refresh_token: refresh,
    refresh_expires_at: rt.toISOString(),
    session_expires_at: s.expiresAt.toISOString(),
    session_id: s.id,
    scope: s.scopes,
    subject: user,
  };
}
export async function exchangeDesktopAuthorization(input: unknown) {
  const p = z
    .object({
      authorization_request_id: z.uuid(),
      client_id: client,
      code: secret,
      code_verifier: secret,
      redirect_uri: redirect,
    })
    .strict()
    .safeParse(input);
  if (!p.success) throw new DesktopError(400, "INVALID_GRANT");
  const v = p.data;
  const result = await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(auth)
      .where(eq(auth.id, v.authorization_request_id))
      .for("update");
    if (
      !row ||
      row.status !== "approved" ||
      row.expiresAt <= new Date() ||
      row.failures >= 5
    )
      return null;
    if (
      row.codeHash !== digest(v.code) ||
      row.redirectUri !== v.redirect_uri ||
      row.challenge !==
        createHash("sha256").update(v.code_verifier).digest("base64url")
    ) {
      await tx
        .update(auth)
        .set({
          failures: row.failures + 1,
          status: row.failures >= 4 ? "invalid" : row.status,
        })
        .where(eq(auth.id, row.id));
      return null;
    }
    await eligible(tx, row.userId!);
    await tx.execute(sql`select pg_advisory_xact_lock(${row.userId!})`);
    const existing = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, row.userId!),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          gt(sessions.refreshExpiresAt, new Date()),
        ),
      );
    if (existing.length >= 10)
      throw new DesktopError(409, "SESSION_LIMIT_REACHED");
    const [user] = await tx
      .select({ osuId: users.osuId, username: users.username })
      .from(users)
      .where(eq(users.osuId, row.userId!));
    const [s] = await tx
      .insert(sessions)
      .values({
        userId: row.userId!,
        deviceName: row.deviceName,
        platform: row.platform,
        scopes: row.scopes,
        expiresAt: new Date(Date.now() + 43200000),
        refreshExpiresAt: new Date(Date.now() + 7200000),
      })
      .returning();
    await tx
      .update(auth)
      .set({ status: "consumed", codeHash: null })
      .where(eq(auth.id, row.id));
    await tx
      .insert(audit)
      .values({ userId: s.userId, sessionId: s.id, action: "session_issued" });
    return issue(tx, s, user);
  });
  if (!result) throw new DesktopError(400, "INVALID_GRANT");
  return result;
}
const refreshSchema = z
  .object({
    client_id: client,
    refresh_token: z.string().regex(/^oclr_desk_rt_[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export async function refreshDesktopAuthorization(input: unknown) {
  const p = refreshSchema.safeParse(input);
  if (!p.success) throw new DesktopError(401, "INVALID_REFRESH_TOKEN");
  const result = await db().transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.hash, digest(p.data.refresh_token)));
    if (!token || token.kind !== "refresh") return null;
    const [s] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, token.sessionId))
      .for("update");
    const [current] = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.hash, token.hash));
    if (
      !s ||
      s.revokedAt ||
      s.expiresAt <= new Date() ||
      s.refreshExpiresAt <= new Date()
    )
      return null;
    if (current.consumedAt) {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, s.id));
      await tx.insert(audit).values({
        userId: s.userId,
        sessionId: s.id,
        action: "refresh_reuse_revoked",
      });
      return null;
    }
    if (token.expiresAt <= new Date()) return null;
    await eligible(tx, s.userId);
    await tx
      .update(tokens)
      .set({ consumedAt: new Date() })
      .where(eq(tokens.hash, token.hash));
    const [user] = await tx
      .select({ osuId: users.osuId, username: users.username })
      .from(users)
      .where(eq(users.osuId, s.userId));
    return issue(tx, s, user);
  });
  if (!result) throw new DesktopError(401, "INVALID_REFRESH_TOKEN");
  return result;
}
export async function revokeDesktopAuthorization(input: unknown) {
  const p = refreshSchema.safeParse(input);
  if (!p.success) return;
  const [token] = await db()
    .select()
    .from(tokens)
    .where(eq(tokens.hash, digest(p.data.refresh_token)));
  if (!token || token.kind !== "refresh") return;
  await db().transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, token.sessionId));
    await tx
      .insert(audit)
      .values({ sessionId: token.sessionId, action: "session_revoked" });
  });
}
export async function requireDesktopUser(request: Request, scope?: string) {
  const raw = request.headers.get("authorization");
  if (raw?.startsWith("Bearer oclr_dev_"))
    throw new DesktopError(403, "INSUFFICIENT_SCOPE");
  if (!raw || !/^Bearer oclr_desk_at_[A-Za-z0-9_-]{43}$/.test(raw))
    throw new DesktopError(401, "INVALID_ACCESS_TOKEN");
  const [row] = await db()
    .select({
      token: tokens,
      session: sessions,
      user: { osuId: users.osuId, username: users.username },
    })
    .from(tokens)
    .innerJoin(sessions, eq(tokens.sessionId, sessions.id))
    .innerJoin(users, eq(sessions.userId, users.osuId))
    .where(
      and(eq(tokens.hash, digest(raw.slice(7))), eq(tokens.kind, "access")),
    );
  if (!row) throw new DesktopError(401, "INVALID_ACCESS_TOKEN");
  const { session: s, token: t } = row;
  if (s.revokedAt) throw new DesktopError(401, "SESSION_REVOKED");
  if (s.expiresAt <= new Date() || s.refreshExpiresAt <= new Date())
    throw new DesktopError(401, "SESSION_EXPIRED");
  if (t.expiresAt <= new Date())
    throw new DesktopError(401, "ACCESS_TOKEN_EXPIRED");
  if (scope && !s.scopes.includes(scope))
    throw new DesktopError(403, "INSUFFICIENT_SCOPE");
  await eligible(db(), s.userId);
  return {
    ...row.user,
    sessionId: s.id,
    scopes: s.scopes,
    accessExpiresAt: t.expiresAt,
    refreshExpiresAt: s.refreshExpiresAt,
    sessionExpiresAt: s.expiresAt,
  };
}
export async function listDesktopSessions(actor: User) {
  const rows = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.userId, actor.osuId))
    .orderBy(desc(sessions.createdAt))
    .limit(50);
  return {
    sessions: rows.map((s) => ({
      id: s.id,
      client_id: "oclr-ref-tools",
      device_name: s.deviceName,
      platform: s.platform,
      created_at: s.createdAt.toISOString(),
      last_refreshed_at: s.refreshedAt.toISOString(),
      expires_at: new Date(
        Math.min(s.expiresAt.getTime(), s.refreshExpiresAt.getTime()),
      ).toISOString(),
      revoked_at: s.revokedAt?.toISOString() ?? null,
      status: s.revokedAt
        ? "revoked"
        : s.expiresAt <= new Date() || s.refreshExpiresAt <= new Date()
          ? "expired"
          : "active",
    })),
  };
}
export async function revokeDesktopSession(actor: User, id: string) {
  if (!z.uuid().safeParse(id).success) return;
  await db().transaction(async (tx) => {
    const changed = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, actor.osuId)))
      .returning();
    if (changed.length)
      await tx.insert(audit).values({
        userId: actor.osuId,
        sessionId: id,
        action: "browser_revoked",
      });
  });
}
export function desktopResponse(data: unknown, status = 200, kind = "Desktop") {
  const requestId = randomUUID();
  return Response.json(
    {
      data,
      meta: {
        apiVersion: desktopApiVersion,
        contractVersion: desktopContractVersion,
        requestId,
        serverTime: new Date().toISOString(),
        pollAfterSeconds: desktopPollAfterSeconds,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        [`X-OCLR-${kind}-Contract`]: desktopContractVersion,
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
export function desktopError(error: unknown) {
  const code =
      error instanceof DesktopError ? error.code : "SERVICE_UNAVAILABLE",
    status =
      error instanceof DesktopError
        ? error.status
        : error instanceof HttpError
          ? error.status
          : 503;
  const requestId = randomUUID();
  return Response.json(
    {
      error: {
        code,
        message: "Desktop request could not be completed.",
        requestId,
        retryable: status === 429,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
