import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { NextResponse } from "next/server";
import { assertCapability, requireStaff } from "@/lib/auth/staff";
import { staffTeams, updateTeams } from "@/lib/teams";
import {
  storeTeamImage,
  removeTeamImage,
  TEAM_IMAGE_MAX_BYTES,
} from "@/lib/team-media";
import { apiError, HttpError, requireSameOrigin } from "@/lib/http";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ edition: string; teamId: string }> },
) {
  let uploaded: string | undefined;
  try {
    requireSameOrigin(request);
    const actor = await requireStaff(),
      { edition, teamId } = await context.params;
    await assertCapability(actor, "manage_teams", edition);
    const before = (await staffTeams(actor, edition)).teams.find(
      (t) => t.id === teamId,
    );
    if (!before) throw new HttpError(404, "Team not found.");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "A request body is required.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > TEAM_IMAGE_MAX_BYTES + 8192) {
        await reader.cancel();
        throw new HttpError(413, "The request is too large.");
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const image = form.get("image");
    if (
      image instanceof File &&
      image.size &&
      !["image/jpeg", "image/png", "image/webp"].includes(image.type)
    )
      throw new HttpError(400, "Choose a JPEG, PNG or WebP image up to 5 MB.");
    if (image instanceof File && image.size)
      uploaded = await storeTeamImage(Buffer.from(await image.arrayBuffer()));
    const data = await updateTeams(
      actor,
      edition,
      {
        expectedVersion: Number(form.get("expectedVersion")),
        confirmed: true,
        command: {
          action: "edit",
          teamId,
          name: form.get("name"),
          capacity: before.capacity,
          avatarKey:
            uploaded ??
            (form.get("removeAvatar") === "true" ? null : before.avatarKey),
        },
      },
      uploaded,
    );
    const saved = data.teams.find((t) => t.id === teamId)!;
    if (before.avatarKey && before.avatarKey !== saved.avatarKey)
      await removeTeamImage(before.avatarKey);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (uploaded) {
      // A post-commit response failure must never remove the committed image.
      try {
        const referenced = await db()
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.avatarKey, uploaded))
          .limit(1);
        if (!referenced.length) await removeTeamImage(uploaded);
      } catch {
        /* Retain for recovery/garbage collection if the DB is unavailable. */
      }
    }
    return apiError(error);
  }
}
