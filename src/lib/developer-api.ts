import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  developerApiEvents,
  developerApiTokens,
  sessions,
  staffRoles,
  users,
} from "@/db/schema";
import type { BrowserSessionContext } from "./auth/sessions";
import { hashToken, randomToken } from "./auth/tokens";
import { appUrl, HttpError } from "./http";
import {
  developerApiScopes,
  developerTokenPrefix,
  isDeveloperOrigin,
  validDeveloperToken,
  type DeveloperApiScope,
  type DeveloperTokenMetadata,
} from "./developer-api-model";

export class DeveloperApiError extends HttpError {
  constructor(
    status: number,
    public code: string,
    message: string,
  ) {
    super(status, message);
  }
}
export function developerOrigins() {
  const origins = (
    process.env.OCLR_DEVELOPER_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (origins.length > 20 || origins.some((v) => !isDeveloperOrigin(v)))
    throw new DeveloperApiError(
      503,
      "API_UNAVAILABLE",
      "Developer API origins are not configured correctly.",
    );
  return [...new Set(origins)];
}

/** Bounded process-local abuse protection. Never store raw credentials or IP headers. */
type RateWindow = { count: number; until: number };
export class DeveloperApiLimiter {
  constructor(private windows = new Map<string, RateWindow>()) {}
  take(key: string, limit: number, now = Date.now()) {
    const previous = this.windows.get(key);
    if (previous && previous.until > now) {
      if (previous.count >= limit)
        throw new DeveloperApiError(
          429,
          "RATE_LIMITED",
          "Too many developer API requests. Try again in a minute.",
        );
      previous.count++;
      return;
    }
    if (this.windows.size >= 4096) {
      for (const [id, window] of this.windows)
        if (window.until <= now) this.windows.delete(id);
      if (this.windows.size >= 4096)
        throw new DeveloperApiError(
          429,
          "RATE_LIMITED",
          "Too many developer API requests. Try again in a minute.",
        );
    }
    this.windows.set(key, { count: 1, until: now + 60_000 });
  }
}
const state = globalThis as unknown as {
  oclrDeveloperApiRateWindows?: Map<string, RateWindow>;
};
// Next route bundles have distinct Error constructors. Share only counters so
// each bundle throws its own DeveloperApiError, preserving 429 classification.
export const developerApiLimiter = new DeveloperApiLimiter(
  (state.oclrDeveloperApiRateWindows ??= new Map()),
);

type Reader = Pick<ReturnType<typeof db>, "select">;
export async function hasDeveloperAccess(osuId: number, reader: Reader = db()) {
  // Explicit grant, including when a bootstrap Admin also holds Developer.
  const [grant] = await reader
    .select({ id: staffRoles.id })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.userId, osuId),
        eq(staffRoles.role, "developer"),
        isNull(staffRoles.editionSlug),
        isNull(staffRoles.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(grant);
}
async function assertDeveloper(osuId: number, reader: Reader) {
  if (!(await hasDeveloperAccess(osuId, reader)))
    throw new DeveloperApiError(
      403,
      "DEVELOPER_REQUIRED",
      "Developer access is required.",
    );
}
function metadata(
  row: typeof developerApiTokens.$inferSelect,
): DeveloperTokenMetadata {
  return {
    id: row.id,
    origin: row.origin,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
async function liveBrowserSession(
  session: BrowserSessionContext,
  reader: Reader,
) {
  const [parent] = await reader
    .select({ expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, session.tokenHash),
        eq(sessions.userId, session.osuId),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!parent)
    throw new DeveloperApiError(
      401,
      "SESSION_EXPIRED",
      "Sign in with osu! to continue.",
    );
  await assertDeveloper(session.osuId, reader);
  return parent;
}
export async function listDeveloperTokens(session: BrowserSessionContext) {
  await liveBrowserSession(session, db());
  const rows = await db()
    .select()
    .from(developerApiTokens)
    .where(eq(developerApiTokens.userId, session.osuId))
    .orderBy(
      sql`${developerApiTokens.revokedAt} NULLS FIRST`,
      desc(developerApiTokens.expiresAt),
    )
    .limit(50);
  // Recheck after I/O; do not return private metadata after a concurrent revocation.
  await liveBrowserSession(session, db());
  return {
    backend: appUrl(),
    origins: developerOrigins(),
    scopes: developerApiScopes,
    tokens: rows.map(metadata),
  };
}
const creation = z
  .object({
    origin: z.string().max(200).refine(isDeveloperOrigin),
    scopes: z
      .array(z.enum(developerApiScopes))
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export async function createDeveloperToken(
  session: BrowserSessionContext,
  input: unknown,
) {
  const parsed = creation.safeParse(input);
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose a valid local origin and read scopes.",
    );
  if (!developerOrigins().includes(parsed.data.origin))
    throw new DeveloperApiError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This local origin is not allowed.",
    );
  developerApiLimiter.take(`issue:${session.osuId}`, 5);
  const backend = appUrl();
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    // Serialize quotas across this user's browser sessions and server processes.
    await tx
      .select({ id: users.osuId })
      .from(users)
      .where(eq(users.osuId, session.osuId))
      .for("update");
    const parent = await liveBrowserSession(session, tx);
    const now = new Date();
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(developerApiTokens)
      .where(
        and(
          eq(developerApiTokens.userId, session.osuId),
          isNull(developerApiTokens.revokedAt),
          gt(developerApiTokens.expiresAt, now),
        ),
      );
    if (count >= 10)
      throw new DeveloperApiError(
        429,
        "TOKEN_LIMIT",
        "Revoke an active token before creating another.",
      );
    const token = developerTokenPrefix + randomToken();
    const [row] = await tx
      .insert(developerApiTokens)
      .values({
        userId: session.osuId,
        sessionHash: session.tokenHash,
        tokenHash: hashToken(token),
        ...parsed.data,
        createdAt: now,
        expiresAt: new Date(
          Math.min(now.getTime() + 3_600_000, parent.expiresAt.getTime()),
        ),
      })
      .returning();
    const after = metadata(row);
    await tx.insert(developerApiEvents).values({
      actorId: session.osuId,
      accessId: row.id,
      action: "create",
      detail: { before: null, after },
    });
    return { backend, access: after, token };
  });
}
export async function revokeDeveloperToken(
  session: BrowserSessionContext,
  id: string,
) {
  if (!z.uuid().safeParse(id).success)
    throw new DeveloperApiError(
      404,
      "NOT_FOUND",
      "Developer API access was not found.",
    );
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await liveBrowserSession(session, tx);
    const [before] = await tx
      .select()
      .from(developerApiTokens)
      .where(
        and(
          eq(developerApiTokens.id, id),
          eq(developerApiTokens.userId, session.osuId),
        ),
      )
      .for("update");
    if (!before)
      throw new DeveloperApiError(
        404,
        "NOT_FOUND",
        "Developer API access was not found.",
      );
    if (before.revokedAt) return metadata(before);
    const [after] = await tx
      .update(developerApiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(developerApiTokens.id, id))
      .returning();
    await tx.insert(developerApiEvents).values({
      actorId: session.osuId,
      accessId: id,
      action: "revoke",
      detail: { before: metadata(before), after: metadata(after) },
    });
    return metadata(after);
  });
}

export type DeveloperReadPrincipal = {
  kind: "developer-read";
  subject: { osuId: number; username: string };
  scopes: DeveloperApiScope[];
  expiresAt: string;
};
/** Never turns the credential into a User/browser session or staff capabilities. */
export async function authenticateDeveloperRead(
  request: Request,
  scope: DeveloperApiScope,
): Promise<DeveloperReadPrincipal> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (\S+)$/i.exec(authorization);
  if (!match || !validDeveloperToken(match[1]))
    throw new DeveloperApiError(
      401,
      "INVALID_TOKEN",
      "A valid developer API token is required.",
    );
  const fingerprint = hashToken(match[1]);
  developerApiLimiter.take(`read:${fingerprint}`, 120);
  return db().transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      const [row] = await tx
        .select({
          access: developerApiTokens,
          username: users.username,
          sessionExpiry: sessions.expiresAt,
        })
        .from(developerApiTokens)
        .innerJoin(
          sessions,
          and(
            eq(developerApiTokens.sessionHash, sessions.tokenHash),
            eq(developerApiTokens.userId, sessions.userId),
          ),
        )
        .innerJoin(users, eq(users.osuId, developerApiTokens.userId))
        .where(
          and(
            eq(developerApiTokens.tokenHash, fingerprint),
            isNull(developerApiTokens.revokedAt),
            gt(developerApiTokens.expiresAt, new Date()),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row)
        throw new DeveloperApiError(
          401,
          "INVALID_TOKEN",
          "A valid developer API token is required.",
        );
      await assertDeveloper(row.access.userId, tx);
      const origin = request.headers.get("origin");
      if (origin !== null && origin !== row.access.origin)
        throw new DeveloperApiError(
          403,
          "ORIGIN_NOT_ALLOWED",
          "This local origin is not allowed.",
        );
      if (!row.access.scopes.includes(scope))
        throw new DeveloperApiError(
          403,
          "INSUFFICIENT_SCOPE",
          "This token does not include the required read scope.",
        );
      return {
        kind: "developer-read",
        subject: { osuId: row.access.userId, username: row.username },
        scopes: row.access.scopes,
        expiresAt: new Date(
          Math.min(row.access.expiresAt.getTime(), row.sessionExpiry.getTime()),
        ).toISOString(),
      };
    },
    { accessMode: "read only" },
  );
}
