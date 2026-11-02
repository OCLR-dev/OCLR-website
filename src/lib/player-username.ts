import { db, readOnlyData } from "@/db";
import { playerNames } from "@/db/schema";
import { sql } from "drizzle-orm";
import { visiblePlayerNames } from "./player-identity";

/** A public URL segment, not an osu! account rule. osu! names may use Unicode
 * letters, digits, spaces, `_` and `-`; separators that would change the path
 * are excluded. */
const addressableName = /^[^/\\?#%]{1,64}$/;

export function addressableUsername(value: string) {
  return (
    value.length > 0 &&
    value.trim() === value &&
    addressableName.test(value)
  );
}

export type UsernameOwner = { osuId: number; username: string };

/** Names that the current public listing mentions for this identity. The
 * directory already applies accepted/roster/archive publication boundaries,
 * so a login-only account or a private application never becomes addressable. */
export function chooseUsernameOwner(
  owners: { osuId: number; username: string }[],
): UsernameOwner | null {
  const uids = new Set(owners.map((owner) => owner.osuId));
  if (uids.size !== 1) return null;
  return owners[0];
}

/** Resolves a released name to one participant UID. Names shared by two
 * participants stay ambiguous, so the caller can return 404 rather than guess. */
export async function databaseUsernameOwner(name: string) {
  if (!process.env.DATABASE_URL || !addressableUsername(name)) return null;
  return readOnlyData(async () => {
    const rows = await db()
      .select({ osuId: playerNames.osuId })
      .from(playerNames)
      .where(sql`lower(${playerNames.username}) = lower(${name})`);
    if (!rows.length) return null;
    const uids = [...new Set(rows.map((row) => row.osuId))];
    // Visible names already exclude unpublished, account-only and withdrawn
    // archive evidence, so a private application can never claim a URL.
    const visible = await visiblePlayerNames(uids);
    const { publicPlayer } = await import("./players");
    const owners: UsernameOwner[] = [];
    for (const osuId of uids) {
      const match = visible.find(
        (row) =>
          row.osuId === osuId &&
          row.username.toLowerCase() === name.toLowerCase(),
      );
      // Only participants in the public directory are addressable.
      if (!match || !(await publicPlayer(osuId)).length) continue;
      owners.push({ osuId, username: match.username });
    }
    return chooseUsernameOwner(owners);
  });
}
