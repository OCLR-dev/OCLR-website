import { developerTokenMisses } from "./developer-token-misses";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
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
import { appUrl } from "./app-url";
import { HttpError } from "./http-error";
import {
  developerApiScopes,
  developerTokenPrefix,
  developerOriginPort,
  developerOriginAllowed,
  developerTokenPorts,
  maxDeveloperPorts,
  validDeveloperToken,
  type DeveloperApiScope,
  type DeveloperTokenMetadata,
} from "./developer-api-model";
import {
  createDeveloperTokenWrite,
  revokeDeveloperTokenWrite,
  type DeveloperTokenIssued,
} from "./developer-token-write-contract";

export class DeveloperApiError extends HttpError {
  constructor(
    status: number,
    public code: string,
    message: string,
  ) {
    super(status, message);
  }
}
/** null means Developers may choose any valid loopback port; [] disables access. */
export function developerPorts(): number[] | null {
  const configured = process.env.OCLR_DEVELOPER_PORTS;
  const legacy = process.env.OCLR_DEVELOPER_ORIGINS;
  if (configured === undefined && legacy === undefined) return null;
  const values = (configured ?? legacy!)
    .split(",")
    .map((value) => value.trim());
  if (values.length === 1 && values[0] === "") return [];
  const ports = values.map((value) =>
    configured !== undefined
      ? /^[0-9]{1,5}$/.test(value)
        ? Number(value)
        : null
      : developerOriginPort(value),
  );
  if (
    ports.length > maxDeveloperPorts ||
    ports.some((port) => port === null || port < 1 || port > 65535)
  )
    throw new DeveloperApiError(
      503,
      "API_UNAVAILABLE",
      "Developer API ports are not configured correctly.",
    );
  return [...new Set(ports as number[])];
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
    ports: developerTokenPorts(row),
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
    ports: developerPorts(),
    scopes: developerApiScopes,
    tokens: rows.map(metadata),
  };
}
export async function createDeveloperToken(
  session: BrowserSessionContext,
  input: unknown,
): Promise<DeveloperTokenIssued> {
  const parsed = createDeveloperTokenWrite.request.safeParse(input);
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose 1 to 20 unique local ports between 1 and 65535 and valid read scopes.",
    );
  const ports =
    "ports" in parsed.data
      ? parsed.data.ports
      : [developerOriginPort(parsed.data.origin)!];
  const allowedPorts = developerPorts();
  if (
    allowedPorts !== null &&
    ports.some((port) => !allowedPorts.includes(port))
  )
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
        scopes: parsed.data.scopes,
        ports,
        origin:
          "origin" in parsed.data
            ? parsed.data.origin
            : new URL(`http://localhost:${ports[0]}`).origin,
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
  if (!revokeDeveloperTokenWrite.parameters.tokenId.safeParse(id).success)
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
  if (developerTokenMisses.has(fingerprint))
    throw new DeveloperApiError(
      401,
      "INVALID_TOKEN",
      "A valid developer API token is required.",
    );
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
      if (!row) {
        developerTokenMisses.remember(fingerprint);
        throw new DeveloperApiError(
          401,
          "INVALID_TOKEN",
          "A valid developer API token is required.",
        );
      }
      await assertDeveloper(row.access.userId, tx);
      const origin = request.headers.get("origin");
      if (
        origin !== null &&
        (!developerOriginAllowed(origin, developerPorts()) ||
          !developerOriginAllowed(origin, developerTokenPorts(row.access)))
      )
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
      developerApiLimiter.take(`read:${fingerprint}`, 120);
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
