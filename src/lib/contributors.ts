import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contributorDirectory, contributorEvents } from "@/db/schema";
import { assertCapability, assertReadCapability } from "./auth/staff";
import type { User } from "./auth/sessions";
import { updateContributorsWrite } from "./staff-administration-write-contracts";
import { HttpError } from "./http";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import type { ExplicitReadData } from "./explicit-read-contracts";
type ContributorsForAdmin = ExplicitReadData<"contributorsForAdmin">;
type PublicContributors = ExplicitReadData<"publicContributors">;

async function readDirectory(): Promise<ContributorsForAdmin> {
  const [row] = await db()
    .select({
      id: contributorDirectory.id,
      entries: contributorDirectory.entries,
      revision: contributorDirectory.revision,
    })
    .from(contributorDirectory)
    .where(eq(contributorDirectory.id, 1));
  return row ?? { id: 1, entries: [], revision: 0 };
}
async function databaseContributorsForAdmin(
  actor: User,
): Promise<ContributorsForAdmin> {
  await assertReadCapability(actor, "configure_tournament");
  return readDirectory();
}
async function databasePublicContributors(): Promise<PublicContributors> {
  if (!process.env.DATABASE_URL) return [];
  return (await readDirectory()).entries
    .filter((entry) => entry.published)
    .map(({ name, osuId }) => ({ name, osuId }));
}
export async function contributorsForAdmin(
  actor: User,
): Promise<ContributorsForAdmin> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource("contributorsForAdmin");
  }
  return databaseContributorsForAdmin(actor);
}
export async function publicContributors(): Promise<PublicContributors> {
  return remoteMode()
    ? frontendResource("publicContributors")
    : databasePublicContributors();
}
export async function updateContributors(actor: User, input: unknown) {
  await assertCapability(actor, "configure_tournament");
  const parsed = updateContributorsWrite.request.safeParse(input);
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
    await tx.insert(contributorEvents).values({
      actorId: actor.osuId,
      before: before.entries,
      after: after.entries,
      revision: after.revision,
    });
    return after;
  });
}
