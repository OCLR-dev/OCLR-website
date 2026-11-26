import { getPublicEditions } from "./content";
import type { Edition } from "./editions";
import type { ChatSource } from "./chat-retrieval";
import type { MappoolCategory } from "./mappool-model";
import {
  mapRowsByPlayer,
  publicSeasonMapPlays,
  type PlayerMapRow,
} from "./player-map-performance";
import { playerModBreakdownForMaps } from "./player-mod-breakdown";
import { publicPlayerDirectoryModel } from "./public-read-models";

export function modHistoryFields(rows: readonly PlayerMapRow[]) {
  const breakdown = playerModBreakdownForMaps(rows);
  return {
    mapsPlayed: rows.length,
    actualModUsage: breakdown.mods,
    slotAppearances: breakdown.slots.map(({ slot, plays }) => ({
      slot,
      plays,
    })),
    poolPerformance: breakdown.pools,
  };
}

async function editionModHistory(edition: Edition, ids?: ReadonlySet<number>) {
  if (
    ids &&
    edition.archive &&
    !edition.archive.players.some(({ osuId }) => ids.has(osuId))
  )
    return [];
  const plays = await publicSeasonMapPlays(edition.slug);
  if (!plays?.length) return [];
  const players =
    edition.archive?.players ??
    (await publicPlayerDirectoryModel(edition.slug)).rows;
  const names = new Map(
    players
      .filter(({ osuId }) => !ids || ids.has(osuId))
      .map(({ osuId, username }) => [osuId, username]),
  );
  return [...mapRowsByPlayer(plays, new Set(names.keys()))].map(
    ([osuId, rows]) => {
      return {
        osuId,
        username: names.get(osuId)!,
        edition: edition.name,
        editionSlug: edition.slug,
        ...modHistoryFields(rows),
      };
    },
  );
}

export async function playerModHistorySources(
  edition: Edition,
): Promise<ChatSource[]> {
  return (await editionModHistory(edition)).map((history) => ({
    title: [
      history.username,
      "OCLR MOD history",
      ...history.poolPerformance.map(({ category }) => category),
    ].join(" · "),
    url: "/players/" + history.osuId + "?edition=" + history.editionSlug,
    text: JSON.stringify(history),
  }));
}

export async function draftModHistorySources(
  draftSlug: string,
  candidates: readonly { osuId: number; username: string }[],
  category: MappoolCategory,
): Promise<ChatSource[]> {
  if (!candidates.length) return [];
  const ids = new Set(candidates.map(({ osuId }) => osuId));
  const seasonsByPlayer = new Map<
    number,
    {
      edition: string;
      editionSlug: string;
      maps: number;
      ratedMaps: number;
      averageEffectiveRating: number | null;
      actualModUses: number;
    }[]
  >();
  // Each season's published scores are read and ranked once for the whole pool.
  const editions = await getPublicEditions();
  for (const edition of editions) {
    for (const history of await editionModHistory(edition, ids)) {
      const pool = history.poolPerformance.find(
        (pool) => pool.category === category,
      );
      const actualModUses =
        history.actualModUsage.find((row) => row.mod === category)?.count ?? 0;
      if (!pool && !actualModUses) continue;
      const seasons = seasonsByPlayer.get(history.osuId) ?? [];
      seasons.push({
        edition: history.edition,
        editionSlug: history.editionSlug,
        maps: pool?.maps ?? 0,
        ratedMaps: pool?.ratedMaps ?? 0,
        averageEffectiveRating: pool?.averageEffectiveRating ?? null,
        actualModUses,
      });
      seasonsByPlayer.set(history.osuId, seasons);
    }
  }
  const ranked = candidates.flatMap((candidate) => {
    const seasons = seasonsByPlayer.get(candidate.osuId);
    if (!seasons) return [];
    const ratedMaps = seasons.reduce(
      (sum, season) => sum + season.ratedMaps,
      0,
    );
    const weightedRating = seasons.reduce(
      (sum, season) =>
        sum + (season.averageEffectiveRating ?? 0) * season.ratedMaps,
      0,
    );
    return [
      {
        ...candidate,
        seasons,
        maps: seasons.reduce((sum, season) => sum + season.maps, 0),
        ratedMaps,
        averageEffectiveRating: ratedMaps ? weightedRating / ratedMaps : null,
        actualModUses: seasons.reduce(
          (sum, season) => sum + season.actualModUses,
          0,
        ),
      },
    ];
  });
  if (!ranked.length) return [];

  // A handful of maps can be shown as evidence without becoming a ranked result.
  const minimumRatedMaps = 3;
  const comparable = ranked
    .filter((candidate) => candidate.ratedMaps >= minimumRatedMaps)
    .sort(
      (a, b) =>
        b.averageEffectiveRating! - a.averageEffectiveRating! ||
        b.ratedMaps - a.ratedMaps ||
        a.osuId - b.osuId,
    );
  const limited = ranked
    .filter((candidate) => candidate.ratedMaps < minimumRatedMaps)
    .sort(
      (a, b) =>
        b.maps - a.maps ||
        b.actualModUses - a.actualModUses ||
        a.osuId - b.osuId,
    );
  return [
    {
      title: "Public draft pool · OCLR MOD history",
      url: "/tournaments/" + draftSlug + "/draft",
      text: JSON.stringify({
        category,
        minimumRatedMaps,
        selectablePlayers: candidates.length,
        candidatesWithComparableHistory: comparable.length,
        candidatesWithLimitedHistory: limited.length,
        candidatesWithoutHistory: candidates.length - ranked.length,
        rankedCandidateIds: comparable.slice(0, 5).map(({ osuId }) => osuId),
      }),
    },
    ...[...comparable.slice(0, 5), ...limited.slice(0, 3)].map((candidate) => ({
      title: candidate.username + " · OCLR " + category + " history",
      url: "/players/" + candidate.osuId,
      text: JSON.stringify({
        category,
        ...candidate,
        sampleSufficient: candidate.ratedMaps >= minimumRatedMaps,
      }),
    })),
  ];
}
