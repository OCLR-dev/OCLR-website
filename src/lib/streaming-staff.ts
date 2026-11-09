import { and, eq, isNull, or } from "drizzle-orm";
import type { db } from "@/db";
import { staffRoles, users } from "@/db/schema";
import { canRead, type StaffGrant } from "./auth/staff";

type Reader = Pick<ReturnType<typeof db>, "select">;
export function canViewStreaming(grants: readonly StaffGrant[], slug: string) {
  return canRead(grants, "view_streaming", slug);
}

export async function eligibleBroadcastStaff(
  reader: Reader,
  slug: string,
  role: "streamer" | "commentator",
) {
  return reader
    .select({ osuId: users.osuId, username: users.username })
    .from(users)
    .innerJoin(staffRoles, eq(staffRoles.userId, users.osuId))
    .where(
      and(
        eq(staffRoles.role, role),
        isNull(staffRoles.revokedAt),
        or(isNull(staffRoles.editionSlug), eq(staffRoles.editionSlug, slug)),
      ),
    )
    .groupBy(users.osuId, users.username)
    .orderBy(users.username);
}
