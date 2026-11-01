import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mappoolCandidates } from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { getPublicEditions } from "./content";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
import { publicMappools } from "./mappools";
import { slotLabel } from "./mappool-model";
import { compareTournamentSeasons } from "./tournament-order";

export type CandidateHistory = {
  beatmapId: number;
  matches: {
    editionSlug: string;
    editionName: string;
    season: string | null;
    poolId: string;
    poolName: string;
    roundName: string | null;
    slot: string;
    matchedBy: "beatmap" | "original";
  }[];
};

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
  const editions = (await getPublicEditions())
    .filter(
      (edition) =>
        edition.slug !== slug &&
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
            map.beatmapId === candidate.beatmapId ||
            map.originalId === candidate.beatmapId
              ? [
                  {
                    ...identity,
                    poolId: pool.id,
                    poolName: pool.name,
                    roundName: null,
                    slot: map.slot,
                    matchedBy:
                      map.beatmapId === candidate.beatmapId
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
          .filter((entry) => entry.beatmapId === candidate.beatmapId)
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
  return { beatmapId: candidate.beatmapId, matches: matches.flat() };
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
