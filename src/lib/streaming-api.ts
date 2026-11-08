import { getEditions } from "./content";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  streamingApiEvents,
  streamingApiTokens,
  sessions,
  staffRoles,
  users,
} from "@/db/schema";
import type { BrowserSessionContext } from "./auth/sessions";
import { hashToken, randomToken } from "./auth/tokens";
import { appUrl } from "./app-url";
import { editionSchema } from "./editions";
import { DeveloperApiError, developerApiLimiter } from "./developer-api";
import { developerTokenMisses } from "./developer-token-misses";
import { isDeveloperOrigin } from "./developer-api-model";
import {
  streamingApiScopes,
  streamingTokenPrefix,
  validStreamingToken,
  type StreamingApiScope,
  type StreamingTokenMetadata,
} from "./streaming-api-model";
import {
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
  type StreamingAccessIssued,
} from "./streaming-write-contract";
type Reader = Pick<ReturnType<typeof db>, "select">;
async function streamingGrants(osuId: number) {
  return db()
    .select({ editionSlug: staffRoles.editionSlug })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.userId, osuId),
        eq(staffRoles.role, "streamer"),
        isNull(staffRoles.revokedAt),
      ),
    );
}
/** Menu visibility only; edition endpoints independently verify their live grant. */
export async function hasStreamingMenuAccess(osuId: number) {
  return (await streamingGrants(osuId)).length > 0;
}
export async function streamingAccessEditions(osuId: number) {
  const grants = await streamingGrants(osuId);
  if (!grants.length)
    throw new DeveloperApiError(
      403,
      "FORBIDDEN",
      "An active Streamer grant is required.",
    );
  return (await getEditions())
    .filter(
      (edition) =>
        edition.published &&
        edition.status !== "completed" &&
        grants.some(
          (grant) =>
            grant.editionSlug === null || grant.editionSlug === edition.slug,
        ),
    )
    .map(({ slug, name, status }) => ({ slug, name, status }));
}
export async function hasStreamingAccess(
  osuId: number,
  editionSlug: string,
  reader: Reader = db(),
) {
  const [grant] = await reader
    .select({ id: staffRoles.id })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.userId, osuId),
        eq(staffRoles.role, "streamer"),
        or(
          isNull(staffRoles.editionSlug),
          eq(staffRoles.editionSlug, editionSlug),
        ),
        isNull(staffRoles.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(grant);
}
export async function assertStreamer(
  osuId: number,
  editionSlug: string,
  reader: Reader = db(),
) {
  if (!(await hasStreamingAccess(osuId, editionSlug, reader)))
    throw new DeveloperApiError(
      403,
      "STREAMER_REQUIRED",
      "Streamer access is required for this edition.",
    );
}
function metadata(
  row: typeof streamingApiTokens.$inferSelect,
): StreamingTokenMetadata {
  return {
    lastUsedAt: row.lastUsedAt.toISOString(),
    id: row.id,
    editionSlug: row.editionSlug,
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
  return parent;
}
export async function listStreamingTokens(
  session: BrowserSessionContext,
  editionSlug: string,
) {
  await liveBrowserSession(session, db());
  if (!editionSchema.shape.slug.safeParse(editionSlug).success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose valid streaming query parameters.",
    );
  await assertStreamer(session.osuId, editionSlug);
  const rows = await db()
    .select()
    .from(streamingApiTokens)
    .where(
      and(
        eq(streamingApiTokens.userId, session.osuId),
        eq(streamingApiTokens.editionSlug, editionSlug),
      ),
    )
    .orderBy(
      sql`${streamingApiTokens.revokedAt} NULLS FIRST`,
      desc(streamingApiTokens.expiresAt),
    )
    .limit(50);
  // Recheck after I/O; do not return private metadata after a concurrent revocation.
  await liveBrowserSession(session, db());
  return {
    backend: appUrl(),
    origins: streamingOrigins(),
    scopes: streamingApiScopes,
    tokens: rows.map(metadata),
  };
}
export async function createStreamingToken(
  session: BrowserSessionContext,
  input: unknown,
): Promise<StreamingAccessIssued> {
  const parsed = createStreamingAccessWrite.request.safeParse(input);
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose a valid local origin and read scopes.",
    );
  if (!streamingOrigins().includes(parsed.data.origin))
    throw new DeveloperApiError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This local origin is not allowed.",
    );
  developerApiLimiter.take(`stream-issue:${session.osuId}`, 5);
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
    await assertStreamer(session.osuId, parsed.data.editionSlug, tx);
    const now = new Date();
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(streamingApiTokens)
      .where(
        and(
          eq(streamingApiTokens.userId, session.osuId),
          isNull(streamingApiTokens.revokedAt),
          gt(streamingApiTokens.expiresAt, now),
        ),
      );
    if (count >= 10)
      throw new DeveloperApiError(
        429,
        "TOKEN_LIMIT",
        "Revoke an active token before creating another.",
      );
    const token = streamingTokenPrefix + randomToken();
    const [row] = await tx
      .insert(streamingApiTokens)
      .values({
        userId: session.osuId,
        sessionHash: session.tokenHash,
        tokenHash: hashToken(token),
        ...parsed.data,
        scopes: ["streaming:read"],
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(
          Math.min(now.getTime() + 3_600_000, parent.expiresAt.getTime()),
        ),
      })
      .returning();
    const after = metadata(row);
    await tx.insert(streamingApiEvents).values({
      actorId: session.osuId,
      accessId: row.id,
      action: "create",
      detail: { before: null, after },
    });
    return { backend, access: after, token };
  });
}
export async function revokeStreamingToken(
  session: BrowserSessionContext,
  id: string,
): Promise<StreamingTokenMetadata> {
  if (!revokeStreamingAccessWrite.parameters.tokenId.safeParse(id).success)
    throw new DeveloperApiError(
      404,
      "NOT_FOUND",
      "Streaming API access was not found.",
    );
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await liveBrowserSession(session, tx);
    const [before] = await tx
      .select()
      .from(streamingApiTokens)
      .where(
        and(
          eq(streamingApiTokens.id, id),
          eq(streamingApiTokens.userId, session.osuId),
        ),
      )
      .for("update");
    if (!before)
      throw new DeveloperApiError(
        404,
        "NOT_FOUND",
        "Streaming API access was not found.",
      );
    if (before.revokedAt) return metadata(before);
    const [after] = await tx
      .update(streamingApiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(streamingApiTokens.id, id))
      .returning();
    await tx.insert(streamingApiEvents).values({
      actorId: session.osuId,
      accessId: id,
      action: "revoke",
      detail: { before: metadata(before), after: metadata(after) },
    });
    return metadata(after);
  });
}

export type StreamingReadPrincipal = {
  accessId: string;
  kind: "streaming-read";
  subject: { osuId: number; username: string };
  scopes: StreamingApiScope[];
  editionSlug: string;
  expiresAt: string;
};
/** Never turns the credential into a User/browser session or staff capabilities. */
export async function authenticateStreamingRead(
  request: Request,
  editionSlug: string,
  rateLimit = true,
): Promise<StreamingReadPrincipal> {
  if (!process.env.DATABASE_URL)
    throw new DeveloperApiError(
      503,
      "DATA_UNAVAILABLE",
      "Saved data is temporarily unavailable.",
    );
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (\S+)$/i.exec(authorization);
  if (!match || !validStreamingToken(match[1]))
    throw new DeveloperApiError(
      401,
      "INVALID_TOKEN",
      "A valid streaming API token is required.",
    );
  const fingerprint = hashToken(match[1]);
  if (developerTokenMisses.has(fingerprint))
    throw new DeveloperApiError(
      401,
      "INVALID_TOKEN",
      "A valid streaming API token is required.",
    );
  return db().transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      const [row] = await tx
        .select({
          access: streamingApiTokens,
          username: users.username,
          sessionExpiry: sessions.expiresAt,
        })
        .from(streamingApiTokens)
        .innerJoin(
          sessions,
          and(
            eq(streamingApiTokens.sessionHash, sessions.tokenHash),
            eq(streamingApiTokens.userId, sessions.userId),
          ),
        )
        .innerJoin(users, eq(users.osuId, streamingApiTokens.userId))
        .where(
          and(
            eq(streamingApiTokens.tokenHash, fingerprint),
            isNull(streamingApiTokens.revokedAt),
            gt(streamingApiTokens.expiresAt, new Date()),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row) {
        developerTokenMisses.remember(fingerprint);
        throw new DeveloperApiError(
          401,
          "INVALID_TOKEN",
          "A valid streaming API token is required.",
        );
      }
      if (row.access.editionSlug !== editionSlug)
        throw new DeveloperApiError(
          403,
          "EDITION_NOT_ALLOWED",
          "This token is bound to another edition.",
        );
      await assertStreamer(row.access.userId, editionSlug, tx);
      const origin = request.headers.get("origin");
      if (origin !== null && origin !== row.access.origin)
        throw new DeveloperApiError(
          403,
          "ORIGIN_NOT_ALLOWED",
          "This local origin is not allowed.",
        );
      if (!row.access.scopes.includes("streaming:read"))
        throw new DeveloperApiError(
          403,
          "INSUFFICIENT_SCOPE",
          "This token does not include the required read scope.",
        );
      if (rateLimit)
        developerApiLimiter.take(`stream-read:${fingerprint}`, 120);
      return {
        accessId: row.access.id,
        kind: "streaming-read",
        editionSlug,
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

export function streamingOrigins() {
  const origins = (
    process.env.OCLR_STREAMING_ORIGINS ??
    "http://127.0.0.1:3001,http://localhost:3001"
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    !origins.length ||
    origins.length > 20 ||
    origins.some((v) => !isDeveloperOrigin(v))
  )
    throw new DeveloperApiError(
      503,
      "API_UNAVAILABLE",
      "Streaming API origins are not configured correctly.",
    );
  return [...new Set(origins)];
}

/** Authentication/lease bookkeeping only; never execute inside the business read snapshot. */
export async function touchStreamingAccess(
  request: Request,
  editionSlug: string,
) {
  const principal = await authenticateStreamingRead(
    request,
    editionSlug,
    false,
  );
  const now = new Date();
  const threshold = new Date(now.getTime() - 60_000);
  await db()
    .update(streamingApiTokens)
    .set({
      lastUsedAt: now,
      expiresAt: sql`least(${now.toISOString()}::timestamptz + interval '1 hour', (select expires_at from sessions where token_hash = ${streamingApiTokens.sessionHash}))`,
    })
    .where(
      and(
        eq(streamingApiTokens.id, principal.accessId),
        isNull(streamingApiTokens.revokedAt),
        gt(streamingApiTokens.expiresAt, now),
        lt(streamingApiTokens.lastUsedAt, threshold),
      ),
    );
}
