import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mappoolCandidates } from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { getEdition, getPublicEditions } from "./content";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { publicMappools } from "./mappool-reads";
import { parseBeatmapId, slotLabel } from "./mappool-model";
import { compareTournamentSeasons } from "./tournament-order";
import type { ExplicitReadData } from "./explicit-read-contracts";
export type CandidateHistory = ExplicitReadData<"candidateHistory">;

async function databaseCandidateHistory(
  actor: User,
  slug: string,
  id: string,
): Promise<CandidateHistory> {
  await assertReadCapability(actor, "select_mappools", slug);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(400, "Invalid candidate.");
  const [candidate] = await db()
    .select({ beatmapId: mappoolCandidates.beatmapId })
    .from(mappoolCandidates)
    .where(
      and(
        eq(mappoolCandidates.id, id),
        eq(mappoolCandidates.editionSlug, slug),
      ),
    );
  if (!candidate) throw new HttpError(404, "Candidate not found.");
  return publishedBeatmapHistory(candidate.beatmapId, slug);
}

async function publishedBeatmapHistory(
  beatmapId: number,
  excludeEdition?: string,
): Promise<CandidateHistory> {
  const editions = (await getPublicEditions())
    .filter(
      (edition) =>
        edition.slug !== excludeEdition &&
        (edition.archive || edition.status === "completed"),
    )
    .sort(compareTournamentSeasons);
  const matches = await Promise.all(
    editions.map(async (edition): Promise<CandidateHistory["matches"]> => {
      const identity = {
        editionSlug: edition.slug,
        editionName: edition.name,
        season: edition.season,
      };
      if (edition.archive) {
        return edition.archive.pools.flatMap((pool) =>
          pool.maps.flatMap((map) =>
            map.beatmapId === beatmapId || map.originalId === beatmapId
              ? [
                  {
                    ...identity,
                    poolId: pool.id,
                    poolName: pool.name,
                    roundName: null,
                    slot: map.slot,
                    matchedBy:
                      map.beatmapId === beatmapId
                        ? ("beatmap" as const)
                        : ("original" as const),
                  },
                ]
              : [],
          ),
        );
      }
      return (await publicMappools(edition.slug)).flatMap((pool) =>
        pool.entries
          .filter((entry) => entry.beatmapId === beatmapId)
          .map((entry) => ({
            ...identity,
            poolId: pool.id,
            poolName: pool.name,
            roundName: pool.roundName,
            slot: slotLabel(entry.category, entry.position),
            matchedBy: "beatmap" as const,
          })),
      );
    }),
  );
  return { beatmapId, matches: matches.flat() };
}

export async function beatmapHistory(actor: User, slug: string, input: string) {
  await assertReadCapability(actor, "select_mappools", slug);
  const beatmapId = parseBeatmapId(input);
  if (!beatmapId) throw new HttpError(400, "Invalid BID");
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return publishedBeatmapHistory(beatmapId);
}

export async function candidateHistory(
  actor: User,
  slug: string,
  id: string,
): Promise<CandidateHistory> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource("candidateHistory", { slug, id });
  }
  return databaseCandidateHistory(actor, slug, id);
}
