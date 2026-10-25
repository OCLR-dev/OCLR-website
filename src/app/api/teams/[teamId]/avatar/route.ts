import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { db } from "@/db";
import { captains, teams } from "@/db/schema";
import { assertReadCapability } from "@/lib/auth/staff";
import { currentUser } from "@/lib/auth/user";
import { getPublicEdition } from "@/lib/content";
import { remoteMode } from "@/lib/data-source";
import { frontendMedia } from "@/lib/frontend-media";
import { readTeamImage } from "@/lib/team-media";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
async function readGET(
  _request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    if (remoteMode()) return frontendMedia(`/media/teams/${teamId}/avatar`);
    if (!z.uuid().safeParse(teamId).success)
      return new Response(null, { status: 404 });
    const [row] = await db()
      .select({ team: teams, captainPublished: captains.published })
      .from(teams)
      .innerJoin(
        captains,
        and(
          eq(captains.editionSlug, teams.editionSlug),
          eq(captains.userId, teams.captainId),
        ),
      )
      .where(and(eq(teams.id, teamId), isNull(teams.archivedAt)));
    if (!row?.team.avatarKey) return new Response(null, { status: 404 });
    const publicIdentity =
      row.team.identityPublished &&
      row.captainPublished &&
      !!(await getPublicEdition(row.team.editionSlug));
    if (!publicIdentity) {
      const user = await currentUser();
      if (!user) return new Response(null, { status: 404 });
      await assertReadCapability(user, "manage_teams", row.team.editionSlug);
    }
    return new Response(
      new Uint8Array(await readTeamImage(row.team.avatarKey)),
      {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      },
    );
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
