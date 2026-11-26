import { z } from "zod";
import { difficultyMods, type DifficultyConfiguration } from "./mappool-model";
import { minimumCountedScore } from "./player-map-performance-model";
import {
  baseFeatures,
  bidSchema,
  editionSchema,
  poolUrl,
  publicOrigin,
  snapshotSchema,
  type Slot,
} from "./beatmap-similarity-model";

export const practiceEditions = ["s9", "s10"] as const;
const timestamp = z.iso.datetime({ offset: true });
const playSchema = z.object({
  fixtureId: z.string().min(1),
  mpId: bidSchema,
  gameId: bidSchema,
  beatmapId: bidSchema,
  slot: z.string(),
  at: timestamp,
  osuId: bidSchema,
  score: z.number().int().nonnegative(),
  rawScore: z.number().int().nonnegative().optional(),
  scoreMultiplier: z.number().positive().optional(),
  scoringType: z.string(),
  mods: z.array(z.string()).nullish(),
});
export const releaseSchema = z.object({
  slug: editionSchema,
  archiveKey: z.string().min(1).optional(),
  publishedAt: timestamp.optional(),
  players: z.array(
    z.object({ osuId: bidSchema.nullable(), username: z.string() }),
  ),
  fixtures: z.array(
    z.object({
      id: z.string().min(1),
      covered: z.boolean(),
      technicalAdjudication: z.boolean(),
    }),
  ),
  poolFixtures: z.array(
    z.object({
      id: z.string().min(1),
      poolId: z.string().min(1).optional(),
      maps: z
        .array(
          z.object({
            slot: z.string(),
            mapId: bidSchema.nullable().optional(),
          }),
        )
        .nullish()
        .transform((maps) => maps ?? []),
    }),
  ),
  plays: z.array(playSchema),
});
const archiveReleaseSchema = releaseSchema.extend({
  slug: z.enum(practiceEditions),
  archiveKey: z.string().min(1),
  publishedAt: timestamp,
});
export const practiceSnapshotSchema = z
  .object({
    version: z.literal(1),
    capturedAt: timestamp,
    pools: snapshotSchema,
    releases: z.tuple([archiveReleaseSchema, archiveReleaseSchema]),
  })
  .refine(
    ({ pools, releases }) =>
      releases.every(({ slug }, i) => slug === practiceEditions[i]) &&
      pools.sources.length === practiceEditions.length &&
      pools.sources.every(
        ({ edition, kind }, i) =>
          edition === practiceEditions[i] && kind === "archive",
      ),
    "The practice snapshot must contain the published S9 and S10 archive releases and pools.",
  );
export type PracticeSnapshot = z.infer<typeof practiceSnapshotSchema>;
export type PracticeRelease = z.infer<typeof releaseSchema>;
export type PracticeCorpus = Omit<PracticeSnapshot, "releases"> & {
  releases: PracticeRelease[];
};
type Play = z.infer<typeof playSchema>;

export const minimumPeers = 3;
const shapeMods = new Map(
  Object.entries(difficultyMods).map(([mod, parts]) => [
    parts.toSorted().join(","),
    mod as DifficultyConfiguration,
  ]),
);
const key = (...parts: (number | string | null)[]) => JSON.stringify(parts);
const seasonUrl = (slug: PracticeRelease["slug"]) =>
  publicOrigin + "/tournaments/" + slug;

export function releaseSource(release: PracticeRelease, osuId: number) {
  const url = seasonUrl(release.slug);
  return {
    edition: release.slug,
    publishedAt: release.publishedAt,
    archiveKey: release.archiveKey,
    username:
      release.players.find((player) => player.osuId === osuId)?.username ??
      null,
    statisticsUrl: url + (release.archiveKey ? "/statistics" : "/schedule"),
    profileUrl: publicOrigin + "/players/" + osuId + "?edition=" + release.slug,
    apiUrl:
      publicOrigin +
      "/api/v1/tournaments/" +
      release.slug +
      (release.archiveKey ? "/statistics" : "/competition"),
  };
}

export function median(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  return (
    (ordered[Math.floor((ordered.length - 1) / 2)] +
      ordered[Math.floor(ordered.length / 2)]) /
    2
  );
}

type MatchedPlay = Play & {
  rawScore: number;
  map: Slot & { mod: DifficultyConfiguration; checksum: string };
  edition: PracticeRelease["slug"];
};
export type Evidence = MatchedPlay & {
  peers: number;
  peerMedian: number;
  ratio: number;
};
type Exclusion =
  | "unverified-fixture"
  | "unverified-pool-map"
  | "unverified-mod"
  | "missing-features"
  | "unusable-score"
  | "duplicate-player"
  | "too-few-peers";
type ExclusionCounts = Partial<Record<Exclusion, number>>;

export function scoreEvidence(play: Evidence) {
  return {
    edition: play.edition,
    fixtureId: play.fixtureId,
    gameId: play.gameId,
    mpId: play.mpId,
    bid: play.beatmapId,
    slot: play.slot,
    at: play.at,
    scoringType: play.scoringType,
    mods: play.mods,
    rawScore: play.rawScore,
    peerMedian: play.peerMedian,
    peers: play.peers,
    ratio: play.ratio,
    fixtureUrl:
      seasonUrl(play.edition) +
      "/matches/" +
      encodeURIComponent(play.fixtureId),
    poolUrl: poolUrl(play.map),
  };
}

/** Join to the reviewed fixture's published pool membership before using any difficulty values. */
export function collectPlayerEvidence(snapshot: PracticeCorpus, osuId: number) {
  const exclusions: ExclusionCounts = {};
  const exclusionsBySeason = new Map<string, ExclusionCounts>();
  const published = new Set<number>();
  const evidence: Evidence[] = [];
  let publishedPlays = 0;
  for (const release of snapshot.releases) {
    const seasonExclusions: ExclusionCounts = {};
    exclusionsBySeason.set(release.slug, seasonExclusions);
    function exclude(play: Play, reason: Exclusion) {
      if (play.osuId !== osuId) return;
      exclusions[reason] = (exclusions[reason] ?? 0) + 1;
      seasonExclusions[reason] = (seasonExclusions[reason] ?? 0) + 1;
    }
    const fixtures = new Set(
      release.fixtures
        .filter((fixture) => fixture.covered && !fixture.technicalAdjudication)
        .map(({ id }) => id),
    );
    const fixtureMaps = new Map(
      release.poolFixtures.flatMap(({ id, maps, poolId }) =>
        maps.map(({ mapId, slot }) => [
          key(id, slot, mapId ?? null),
          poolId ?? null,
        ]),
      ),
    );
    const slots = Map.groupBy(
      snapshot.pools.slots.filter((slot) => slot.edition === release.slug),
      (slot) => key(slot.slot, slot.bid, slot.mod),
    );
    const groups = new Map<string, MatchedPlay[]>();

    for (const play of release.plays) {
      if (play.osuId === osuId) {
        publishedPlays++;
        published.add(play.beatmapId);
      }
      if (!fixtures.has(play.fixtureId)) {
        exclude(play, "unverified-fixture");
        continue;
      }
      const poolId = fixtureMaps.get(
        key(play.fixtureId, play.slot, play.beatmapId),
      );
      if (poolId === undefined) {
        exclude(play, "unverified-pool-map");
        continue;
      }
      // NF is irrelevant to chart geometry. Keep it in the score-cohort key.
      const mods = play.mods && [...new Set(play.mods)].sort();
      const mod =
        mods && shapeMods.get(mods.filter((part) => part !== "NF").join(","));
      if (!mod) {
        exclude(play, "unverified-mod");
        continue;
      }
      const matching = (
        slots.get(key(play.slot, play.beatmapId, mod)) ?? []
      ).filter((slot) => !poolId || slot.poolId === poolId);
      const versions = new Set(
        matching.map((slot) => JSON.stringify([slot.checksum, slot.values])),
      );
      const map = matching[0];
      if (
        versions.size !== 1 ||
        !map?.checksum ||
        map.excluded ||
        !baseFeatures.every((feature) => map.values[feature] !== undefined)
      ) {
        exclude(play, "missing-features");
        continue;
      }
      const rawScore =
        play.rawScore ?? ((play.scoreMultiplier ?? 1) === 1 ? play.score : 0);
      if (
        rawScore < minimumCountedScore ||
        !["score", "scorev2"].includes(play.scoringType)
      ) {
        exclude(play, "unusable-score");
        continue;
      }
      const cohort = key(
        play.fixtureId,
        play.mpId,
        play.gameId,
        play.beatmapId,
        play.slot,
        play.scoringType,
        mods!.join(","),
      );
      const rows = groups.get(cohort) ?? [];
      rows.push({
        ...play,
        mods,
        rawScore,
        map: { ...map, mod, checksum: map.checksum },
        edition: release.slug,
      });
      groups.set(cohort, rows);
    }

    for (const rows of groups.values()) {
      const people = Map.groupBy(rows, (row) => row.osuId);
      const target = people.get(osuId);
      if (!target) continue;
      if (target.length !== 1) {
        for (const row of target) exclude(row, "duplicate-player");
        continue;
      }
      const peers = [...people.values()].filter(
        (person) => person.length === 1 && person[0].osuId !== osuId,
      );
      const play = target[0];
      if (peers.length < minimumPeers) {
        exclude(play, "too-few-peers");
        continue;
      }
      const peerMedian = median(peers.map(([peer]) => peer.rawScore));
      evidence.push({
        ...play,
        peers: peers.length,
        peerMedian,
        ratio: play.rawScore / peerMedian,
      });
    }
  }

  return {
    publishedPlays,
    exclusions,
    exclusionsBySeason,
    published,
    evidence,
  };
}
