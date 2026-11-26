import { createHmac } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashToken, randomToken, validToken } from "./tokens";
import { HttpError } from "../http-error";

const sessionHash = (token: string, previewKey?: string) =>
  previewKey
    ? createHmac("sha256", previewKey)
        .update(`oclr-local-role-preview:${token}`)
        .digest("hex")
    : hashToken(token);

export async function createSession(userId: number) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db()
    .insert(sessions)
    .values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}
/** Rotate the local preview session and revoke its derived credentials atomically. */
export async function switchLocalRolePreviewSession(
  userId: number,
  key: string,
  previous?: { token: string; expiresAt: Date },
) {
  const token = randomToken();
  const now = new Date();
  const expiresAt =
    previous?.expiresAt ?? new Date(now.getTime() + 8 * 60 * 60 * 1000);
  await db().transaction(async (tx) => {
    if (previous) {
      const [removed] = await tx
        .delete(sessions)
        .where(
          and(
            eq(sessions.tokenHash, sessionHash(previous.token, key)),
            gt(sessions.expiresAt, now),
          ),
        )
        .returning({ tokenHash: sessions.tokenHash });
      if (!removed)
        throw new HttpError(409, "The local role preview session has changed.");
    }
    await tx
      .insert(sessions)
      .values({ tokenHash: sessionHash(token, key), userId, expiresAt });
  });
  return { token, expiresAt };
}

export async function readSession(
  token: string | undefined,
  previewKey?: string,
) {
  if (!validToken(token)) return null;
  const [row] = await db()
    .select({ osuId: users.osuId, username: users.username })
    .from(sessions)
    .innerJoin(users, eq(users.osuId, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sessionHash(token, previewKey)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
/** Server-only session context for delegated credential management. */
export async function readSessionContext(
  token: string | undefined,
  previewKey?: string,
) {
  if (!validToken(token)) return null;
  const [row] = await db()
    .select({
      osuId: users.osuId,
      username: users.username,
      tokenHash: sessions.tokenHash,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.osuId, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sessionHash(token, previewKey)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
export type BrowserSessionContext = NonNullable<
  Awaited<ReturnType<typeof readSessionContext>>
>;
export async function revokeSession(
  token: string | undefined,
  previewKey?: string,
) {
  if (validToken(token))
    await db()
      .delete(sessions)
      .where(eq(sessions.tokenHash, sessionHash(token, previewKey)));
}
export type User = NonNullable<Awaited<ReturnType<typeof readSession>>>;
