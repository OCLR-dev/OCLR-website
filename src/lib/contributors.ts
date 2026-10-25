import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contributorDirectory, contributorEvents } from "@/db/schema";
import { assertCapability, assertReadCapability } from "./auth/staff";
import type { User } from "./auth/sessions";
import { contributorListSchema } from "./contributor-model";
import { HttpError } from "./http";

async function readDirectory() {
  const [row] = await db()
    .select()
    .from(contributorDirectory)
    .where(eq(contributorDirectory.id, 1));
  return row ?? { id: 1, entries: [], revision: 0 };
}
export async function contributorsForAdmin(actor: User) {
  await assertReadCapability(actor, "configure_tournament");
  return readDirectory();
}
export async function publicContributors() {
  if (!process.env.DATABASE_URL) return [];
  return (await readDirectory()).entries
    .filter((entry) => entry.published)
    .map(({ name, osuId }) => ({ name, osuId }));
}
export async function updateContributors(actor: User, input: unknown) {
  await assertCapability(actor, "configure_tournament");
  const parsed = z
    .object({
      entries: contributorListSchema,
      expectedRevision: z.number().int().min(0).max(2147483646),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Check contributor names, unique osu! IDs and revision.",
    );
  return db().transaction(async (tx) => {
    await tx
      .insert(contributorDirectory)
      .values({ id: 1 })
      .onConflictDoNothing();
    const [before] = await tx
      .select()
      .from(contributorDirectory)
      .where(eq(contributorDirectory.id, 1))
      .for("update");
    await assertCapability(actor, "configure_tournament", undefined, tx);
    const same =
      JSON.stringify(before.entries) === JSON.stringify(parsed.data.entries);
    // A retry of the just-committed request is safe and creates no duplicate event.
    if (
      same &&
      (before.revision === parsed.data.expectedRevision ||
        before.revision === parsed.data.expectedRevision + 1)
    )
      return before;
    if (before.revision !== parsed.data.expectedRevision)
      throw new HttpError(409, "Contributors changed. Refresh before saving.");
    const [after] = await tx
      .update(contributorDirectory)
      .set({ entries: parsed.data.entries, revision: before.revision + 1 })
      .where(eq(contributorDirectory.id, 1))
      .returning();
    await tx
      .insert(contributorEvents)
      .values({
        actorId: actor.osuId,
        before: before.entries,
        after: after.entries,
        revision: after.revision,
      });
    return after;
  });
}
