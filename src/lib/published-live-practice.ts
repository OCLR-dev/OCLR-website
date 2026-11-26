import { db } from "@/db";
import type { Slot } from "./beatmap-similarity-model";
import { releaseSchema } from "./player-practice-data";
import { publicSeasonPerformance } from "./public-season-performance";

export async function publishedLivePractice(slug: string, slots: Slot[]) {
  const performance = await publicSeasonPerformance(slug, db());
  if (!performance) return;
  const { fixtures, names, games } = performance;
  const plays = games.flatMap(({ fixture, rating }) => {
    const at = rating?.playedAt ?? rating?.at;
    if (!rating?.beatmapId || !fixture.result?.mpId || !at) return [];
    return rating.scores.map((score) => ({
      fixtureId: fixture.id,
      mpId: fixture.result!.mpId!,
      gameId: rating.gameId,
      beatmapId: rating.beatmapId,
      slot:
        rating.reviewedPoolId === fixture.pool?.id ? (rating.slot ?? "—") : "—",
      at,
      osuId: score.userId,
      score: score.total,
      rawScore: score.unadjustedTotal ?? score.rawTotal,
      scoreMultiplier: score.scoreMultiplier,
      scoringType: rating.scoringType ?? "",
      mods: score.mods,
    }));
  });
  if (!plays.length) return;
  const pools = Map.groupBy(slots, (slot) => slot.poolId);
  return releaseSchema.parse({
    slug,
    players: [...names].map(([osuId, username]) => ({ osuId, username })),
    fixtures: fixtures.map(({ id }) => ({
      id,
      covered: true,
      technicalAdjudication: false,
    })),
    poolFixtures: fixtures.flatMap(({ id, pool }) =>
      pool
        ? [
            {
              id,
              poolId: pool.id,
              maps: (pools.get(pool.id) ?? []).map(({ bid, slot }) => ({
                slot,
                mapId: bid,
              })),
            },
          ]
        : [],
    ),
    plays,
  });
}
