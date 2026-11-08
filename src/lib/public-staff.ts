import { db } from "@/db";
import { editionState, staffRoles, userProfileCache, users } from "@/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import type { ExplicitReadData } from "./explicit-read-contracts";
type PublicStaff = ExplicitReadData<"publicStaff">;
async function databasePublicStaff(): Promise<PublicStaff> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db()
    .select({
      osuId: users.osuId,
      username: users.username,
      countryCode: sql<
        string | null
      >`${userProfileCache.profile}->>'countryCode'`,
      role: staffRoles.role,
      editionSlug: staffRoles.editionSlug,
      editionName: sql<string | null>`${editionState.configuration}->>'name'`,
    })
    .from(staffRoles)
    .innerJoin(users, eq(users.osuId, staffRoles.userId))
    .leftJoin(
      userProfileCache,
      and(
        eq(userProfileCache.osuId, users.osuId),
        eq(userProfileCache.mode, "osu"),
        sql`${userProfileCache.errorStatus} IS DISTINCT FROM 404`,
      ),
    )
    .leftJoin(editionState, eq(editionState.slug, staffRoles.editionSlug))
    .where(
      and(
        eq(staffRoles.aboutPublished, true),
        isNull(staffRoles.revokedAt),
        or(
          isNull(staffRoles.editionSlug),
          sql`${editionState.configuration}->>'published' = 'true'`,
        ),
      ),
    )
    .orderBy(users.username, staffRoles.role, staffRoles.editionSlug);
  const people = new Map<number, PublicStaff[number]>();
  for (const row of rows) {
    if (row.editionSlug && !row.editionName) continue;
    const person = people.get(row.osuId) ?? {
      osuId: row.osuId,
      username: row.username,
      countryCode: row.countryCode,
      roles: [],
    };
    person.roles.push({
      role: row.role,
      edition: row.editionSlug
        ? { slug: row.editionSlug, name: row.editionName! }
        : null,
    });
    people.set(row.osuId, person);
  }
  return [...people.values()];
}
export async function publicStaff(): Promise<PublicStaff> {
  if (remoteMode()) {
    return frontendResource<PublicStaff>("publicStaff");
  }
  return databasePublicStaff();
}
