import { eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/db";
import { contributorDirectory, contributorEvents } from "@/db/schema";
import {
  assertCapability,
  assertReadCapability,
  hasCapability,
} from "./auth/staff";
import type { User } from "./auth/sessions";
import { updateContributorsWrite } from "./staff-administration-write-contracts";
import { HttpError } from "./http-error";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import type { ExplicitReadData } from "./explicit-read-contracts";
import type { Contributor } from "./contributor-model";
import {
  cachedDirectoryStatistics,
  refreshDirectoryStatistics,
} from "./osu-profiles";
import { inReadChannel } from "./read-channel";
type ContributorsForAdmin = ExplicitReadData<"contributorsForAdmin">;
type PublicContributors = ExplicitReadData<"publicContributors">;
type ScheduleRefresh = (refresh: () => Promise<void>) => void;

async function readDirectory(): Promise<{
  id: number;
  entries: Contributor[];
  revision: number;
}> {
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
async function withCountries<Entry extends { osuId: number }>(
  entries: Entry[],
  scheduleRefresh?: ScheduleRefresh,
  actor?: User,
) {
  const { countries, refreshIds } = await cachedDirectoryStatistics(
    entries.map(({ osuId }) => osuId),
  );
  if (scheduleRefresh && !inReadChannel() && refreshIds.length)
    scheduleRefresh(async () => {
      try {
        await refreshDirectoryStatistics(refreshIds, async () => {
          if (actor && !(await hasCapability(actor, "configure_tournament")))
            return new Set<number>();
          const { entries: current } = await readDirectory();
          return new Set(
            current
              .filter((entry) => actor || entry.published)
              .map(({ osuId }) => osuId),
          );
        });
      } catch {
        // A profile refresh can be retried independently of the directory.
      }
    });
  return entries.map((entry) => {
    const countryCode = countries.get(entry.osuId);
    return countryCode ? { ...entry, countryCode } : entry;
  });
}
export async function contributorsForAdmin(
  actor: User,
  scheduleRefresh?: ScheduleRefresh,
): Promise<ContributorsForAdmin> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource("contributorsForAdmin");
  }
  await assertReadCapability(actor, "configure_tournament");
  const directory = await readDirectory();
  return {
    ...directory,
    entries: await withCountries(directory.entries, scheduleRefresh, actor),
  };
}
export async function publicContributors(
  scheduleRefresh?: ScheduleRefresh,
): Promise<PublicContributors> {
  if (remoteMode()) return frontendResource("publicContributors");
  if (!process.env.DATABASE_URL) return [];
  const entries = (await readDirectory()).entries
    .filter((entry) => entry.published)
    .map(({ name, osuId, description }) =>
      description ? { name, osuId, description } : { name, osuId },
    );
  return withCountries(entries, scheduleRefresh);
}
export async function updateContributors(actor: User, input: unknown) {
  await assertCapability(actor, "configure_tournament");
  const parsed = updateContributorsWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Check contributor names, descriptions, unique osu! IDs and revision.",
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
    const same = isDeepStrictEqual(before.entries, parsed.data.entries);
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
