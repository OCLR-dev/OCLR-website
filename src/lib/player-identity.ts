import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { playerNames, users } from "@/db/schema";
import { getPublicEditions } from "./content";
import { HttpError } from "./http";
import type { PublishedPlayer } from "./players";

export type NameEvidence = {
  source: string;
  editionSlug: string | null;
  reference: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
};
export type PlayerName = { username: string; evidence: NameEvidence[] };

/** UID is the only join key. A reused name never establishes identity. */
export function groupPlayerNames(
  rows: (typeof playerNames.$inferSelect)[],
): PlayerName[] {
  const names = new Map<string, PlayerName>();
  for (const row of rows) {
    const key = row.username.toLowerCase();
    const item = names.get(key) ?? { username: row.username, evidence: [] };
    item.evidence.push({
      source: row.source,
      editionSlug: row.editionSlug || null,
      reference: row.reference || null,
      firstObservedAt: row.firstObservedAt?.toISOString() ?? null,
      lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
    });
    names.set(key, item);
  }
  return [...names.values()].sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

/** Publication is evaluated at read time, including after an edition is hidden.
 * Account/login observations are private; public provider and archive evidence
 * can be searched only for identities already released by the relevant source. */
export async function visiblePlayerNames(
  osuIds: number[],
  selfId?: number,
  authorizedEdition?: string,
) {
  if (!process.env.DATABASE_URL || !osuIds.length) return [];
  const editions = await getPublicEditions();
  const rows = await db()
    .select()
    .from(playerNames)
    .where(inArray(playerNames.osuId, osuIds))
    .orderBy(
      playerNames.username,
      playerNames.source,
      playerNames.editionSlug,
      playerNames.reference,
    );
  return rows.filter((row) => {
    if (row.osuId === selfId) return true;
    if (
      authorizedEdition &&
      (!row.editionSlug || row.editionSlug === authorizedEdition)
    )
      return true;
    if (!row.published) return false;
    if (!row.source.startsWith("archive_")) return row.source !== "account";
    const archive = editions.find((e) => e.slug === row.editionSlug)?.archive;
    return Boolean(
      archive &&
      (archive.players.some(
        (p) => p.osuId === row.osuId && p.source === row.reference,
      ) ||
        archive.staff.some(
          (p) => p.osuId === row.osuId && p.source === row.reference,
        ) ||
        archive.rosterReplacements?.some((r) =>
          r.people.some(
            (p) => p.osuId === row.osuId && p.source === row.reference,
          ),
        )),
    );
  });
}

export async function knownPlayerIdentity(
  osuId: number,
  participation: PublishedPlayer[],
  selfId?: number,
  authorizedEdition?: string,
) {
  const [account] = process.env.DATABASE_URL
    ? await db().select().from(users).where(eq(users.osuId, osuId))
    : [];
  const names = await visiblePlayerNames([osuId], selfId, authorizedEdition);
  // A provider diagnostic cache alone is not evidence that a player belongs to
  // OCLR. Historical staff/replacements with confirmed UIDs are known too.
  const publicArchive = names.some((n) => n.source.startsWith("archive_"));
  if (
    !participation.length &&
    !publicArchive &&
    !((selfId === osuId || authorizedEdition) && account)
  )
    throw new HttpError(404, "Known player not found.");
  const currentProvider = names
    .filter((n) => n.source === "osu_current")
    .sort(
      (a, b) =>
        (b.lastObservedAt?.getTime() ?? 0) - (a.lastObservedAt?.getTime() ?? 0),
    )[0];
  // Login-only names never become public because an unrelated private account
  // happens to share a public archive UID. Public current accounts are already
  // exposed through the accepted directory.
  const currentAccount =
    selfId === osuId ||
    Boolean(authorizedEdition) ||
    participation.some((p) => p.participation !== "historical");
  const accountName = currentAccount ? account?.username : undefined;
  const currentUsername =
    accountName &&
    (!currentProvider?.lastObservedAt ||
      currentProvider.lastObservedAt <= account!.updatedAt)
      ? accountName
      : (currentProvider?.username ?? accountName ?? null);
  const username =
    currentUsername ?? participation[0]?.username ?? names[0]?.username;
  if (!username) throw new HttpError(404, "Known player not found.");
  return { osuId, username, currentUsername, names: groupPlayerNames(names) };
}

/** Login provider aliases are private observations unless independently public. */
export async function observeLoginNames(osuId: number, names: string[]) {
  for (const username of new Set(names)) {
    if (!username || username.length > 300) continue;
    await db().execute(
      sql`SELECT oclr_observe_name(${osuId}::bigint, ${username}, 'account', '', '', clock_timestamp())`,
    );
  }
}
