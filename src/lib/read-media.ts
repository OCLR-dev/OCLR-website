import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { teams, captains } from "@/db/schema";
import { getPublicEdition } from "./content";
import { assertReadCapability } from "./auth/staff";
import { HttpError } from "./http";
import { readTeamImage } from "./team-media";
import { downloadMappoolReplay } from "./mappool-replays";
import type { DeveloperReadPrincipal } from "./developer-api";
export type ReadMedia = {
  bytes: Uint8Array;
  contentType: "image/webp" | "application/octet-stream";
  filename?: string;
};
export async function readMedia(
  id: string,
  params: Record<string, string>,
  principal: DeveloperReadPrincipal | null,
): Promise<ReadMedia> {
  if (id === "downloadReplay") {
    const result = await downloadMappoolReplay(
      principal!.subject,
      params.edition,
      params.id,
      params.replayId,
    );
    return {
      bytes: result.bytes,
      filename: result.filename,
      contentType: "application/octet-stream",
    };
  }
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
    .where(and(eq(teams.id, params.id), isNull(teams.archivedAt)));
  if (!row?.team.avatarKey) throw new HttpError(404, "Team image not found.");
  const published =
    row.team.identityPublished &&
    row.captainPublished &&
    !!(await getPublicEdition(row.team.editionSlug));
  if (!published) {
    if (!principal?.scopes.includes("tournaments:private:read"))
      throw new HttpError(404, "Team image not found.");
    await assertReadCapability(
      principal.subject,
      "manage_teams",
      row.team.editionSlug,
    );
  }
  return {
    bytes: await readTeamImage(row.team.avatarKey),
    contentType: "image/webp",
  };
}
export function mediaDisposition(filename: string) {
  const safe = filename.slice(0, 180).replace(/[\\/\p{Cc}\p{Cf}]/gu, "_");
  return `attachment; filename="replay.osr"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`;
}
