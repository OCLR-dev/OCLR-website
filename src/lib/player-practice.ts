import { createHash } from "node:crypto";
import { features, type Snapshot } from "./beatmap-similarity-model";
import {
  compareBeatmaps,
  latestVersions,
  profiles,
  snapshotInfo,
  type SimilarityDatabase,
} from "./beatmap-similarity-ranking";
import {
  collectPlayerEvidence,
  median,
  minimumPeers,
  releaseSource,
  scoreEvidence,
  type Evidence,
  practiceEditions,
  type PracticeCorpus,
} from "./player-practice-data";

const demandFeatures = [
  "bpm",
  "duration",
  "ar",
  "od",
  "cs",
  "aim",
  "speed",
  "rhythmChangeShare",
  "sustainedDensity",
] as const;
type DemandFeature = (typeof demandFeatures)[number];
type Mod = Evidence["map"]["mod"];
type Demand = {
  mod: Mod;
  feature: DemandFeature;
  cutoff: number;
  referenceMaps: number;
};
const minimumReferenceMaps = 8;
const minimumGames = 4;
const minimumMaps = 3;
const minimumFixtures = 2;
const minimumGap = 0.08;
const holdoutCutoff = "2025-01-01T00:00:00.000Z";
const isBeforeCutoff = (at: string) =>
  Date.parse(at) < Date.parse(holdoutCutoff);

function countEvidence(rows: Evidence[]) {
  return {
    games: rows.length,
    beatmaps: new Set(rows.map((row) => row.beatmapId)).size,
    fixtures: new Set(rows.map((row) => row.edition + ":" + row.fixtureId))
      .size,
    peerAppearances: rows.reduce((sum, row) => sum + row.peers, 0),
  };
}

function summary(rows: Evidence[]) {
  const byMap = Map.groupBy(rows, (row) => row.beatmapId);
  const ratios = [...byMap.values()].map((plays) =>
    median(plays.map((row) => row.ratio)),
  );
  return {
    ...countEvidence(rows),
    medianPeerRatio: ratios.length ? median(ratios) : null,
  };
}

function supported(group: ReturnType<typeof summary>) {
  return (
    group.games >= minimumGames &&
    group.beatmaps >= minimumMaps &&
    group.fixtures >= minimumFixtures
  );
}

function fitDemands(pools: Snapshot) {
  const mods = new Set(
    pools.slots.flatMap((slot) =>
      slot.mod && !slot.excluded ? [slot.mod] : [],
    ),
  );
  return [...mods].flatMap((mod) => {
    const maps = latestVersions(pools.slots, mod);
    return demandFeatures.flatMap((feature): Demand[] => {
      const values = maps
        .flatMap((map) => map.values[feature] ?? [])
        .sort((a, b) => a - b);
      const cutoff = values[Math.ceil(values.length * 0.6) - 1];
      if (values.length < minimumReferenceMaps || cutoff === values[0])
        return [];
      return [{ mod, feature, cutoff, referenceMaps: values.length }];
    });
  });
}

function assess(demand: Demand, evidence: Evidence[]) {
  const cohort = evidence.filter((row) => row.map.mod === demand.mod);
  // Group by BID. Drop conflicting versions rather than counting the same difficulty on both sides.
  const comparable = [...Map.groupBy(cohort, (row) => row.beatmapId).values()]
    .filter(
      (rows) =>
        new Set(rows.map((row) => row.map.checksum)).size === 1 &&
        rows.every(
          (row) =>
            row.map.values[demand.feature] !== undefined &&
            row.map.values[demand.feature] ===
              rows[0].map.values[demand.feature],
        ),
    )
    .flat();
  const highRows = comparable.filter(
    (row) => row.map.values[demand.feature]! >= demand.cutoff,
  );
  const otherRows = comparable.filter(
    (row) => row.map.values[demand.feature]! < demand.cutoff,
  );
  const high = summary(highRows);
  const other = summary(otherRows);
  const gap =
    supported(high) && supported(other)
      ? high.medianPeerRatio! - other.medianPeerRatio!
      : null;
  const classification =
    gap === null
      ? "insufficient-samples"
      : gap <= -minimumGap
        ? "practice-opportunity"
        : gap >= minimumGap
          ? "relative-strength"
          : "similar";
  return {
    report: {
      ...demand,
      unit: features[demand.feature].unit,
      high,
      other,
      gap,
      classification,
      excludedGames: cohort.length - comparable.length,
    },
    highRows,
  };
}

type Assessment = ReturnType<typeof assess>;
function evidenceExamples(rows: Evidence[]) {
  return [...Map.groupBy(rows, (row) => row.beatmapId).values()]
    .slice(0, 3)
    .map(([row]) => scoreEvidence(row));
}

function chooseAnchor(
  assessment: Assessment,
  pools: Snapshot,
  profile: keyof typeof profiles,
) {
  const versions = new Map(
    latestVersions(pools.slots, assessment.report.mod).map((map) => [
      map.bid,
      map,
    ]),
  );
  const struggling = assessment.highRows.filter((row) => {
    const version = versions.get(row.beatmapId);
    return (
      version?.checksum === row.map.checksum &&
      version.values[assessment.report.feature] ===
        row.map.values[assessment.report.feature] &&
      profiles[profile].every(
        (feature) =>
          version.values[feature] === row.map.values[feature] &&
          version.values[feature] !== undefined,
      ) &&
      row.ratio < assessment.report.other.medianPeerRatio!
    );
  });
  if (!struggling.length) return;
  const typicalStars = median(
    [...Map.groupBy(struggling, (row) => row.beatmapId).values()].map(
      ([row]) => row.map.values.stars!,
    ),
  );
  return struggling.toSorted(
    (a, b) =>
      Math.abs(a.map.values.stars! - typicalStars) -
        Math.abs(b.map.values.stars! - typicalStars) ||
      a.ratio - b.ratio ||
      a.beatmapId - b.beatmapId,
  )[0];
}

async function recommendations(
  db: SimilarityDatabase,
  pools: Snapshot,
  assessments: Assessment[],
  played: Set<number>,
) {
  const opportunities = assessments
    .filter(({ report }) => report.classification === "practice-opportunity")
    .sort((a, b) => a.report.gap! - b.report.gap!);
  const picked = new Set<number>();
  const results = [];
  for (const opportunity of opportunities.slice(0, 3)) {
    const { mod, feature, cutoff, high, other, gap } = opportunity.report;
    const profile =
      feature === "aim" || feature === "speed" ? "skills" : "base";
    const anchor = chooseAnchor(opportunity, pools, profile);
    if (!anchor) continue;
    const anchorStars = anchor.map.values.stars!;
    const versions = latestVersions(pools.slots, mod);
    const steps = [];
    for (const [step, minStars, maxStars] of [
      ["foundation", Math.max(0, anchorStars - 0.75), anchorStars - 0.15],
      ["near-reference", Math.max(0, anchorStars - 0.15), anchorStars + 0.15],
    ] as const) {
      const allowedBids = new Set(
        versions
          .filter(
            (map) =>
              !played.has(map.bid) &&
              !picked.has(map.bid) &&
              (map.values[feature] ?? -Infinity) >= cutoff,
          )
          .map((map) => map.bid),
      );
      const ranked = await compareBeatmaps(db, pools, {
        bid: anchor.beatmapId,
        mod,
        profile,
        repeat: 1,
        minStars,
        maxStars,
        allowedBids,
      });
      const candidate = ranked.vector[0];
      if (candidate) picked.add(candidate.bid);
      steps.push({
        step,
        minStars,
        maxStars,
        eligibleCandidates: ranked.candidateCount,
        candidate: candidate
          ? {
              ...candidate,
              beatmapUrl: "https://osu.ppy.sh/beatmaps/" + candidate.bid,
              targetFeature: candidate.values[feature],
              starDelta: candidate.values.stars! - anchorStars,
            }
          : null,
      });
    }
    results.push({
      mod,
      feature,
      unit: features[feature].unit,
      minimumTargetFeature: cutoff,
      reason: {
        high,
        other,
        gap,
        profile,
        anchorStars,
        anchorFeature: anchor.map.values[feature],
      },
      anchor: scoreEvidence(anchor),
      steps,
    });
  }
  return results;
}

function validateTemporal(
  snapshot: PracticeCorpus,
  evidence: Evidence[],
  osuId: number,
) {
  const train = snapshot.releases.find(
    (release) => release.slug === practiceEditions[0],
  );
  const holdout = snapshot.releases.find(
    (release) => release.slug === practiceEditions[1],
  );
  if (!train || !holdout || snapshot.releases.length !== 2)
    throw new Error(
      "Temporal validation requires the S9 and S10 practice snapshot.",
    );
  if (
    train.plays.some((row) => !isBeforeCutoff(row.at)) ||
    holdout.plays.some((row) => isBeforeCutoff(row.at))
  )
    throw new Error(
      "S9 and S10 score dates do not fit the configured holdout split.",
    );
  const earlierPools = {
    ...snapshot.pools,
    slots: snapshot.pools.slots.filter((slot) => slot.edition === train.slug),
  };
  const training = evidence.filter((row) => isBeforeCutoff(row.at));
  const priorBids = new Set(
    train.plays
      .filter((row) => row.osuId === osuId)
      .map((row) => row.beatmapId),
  );
  const later = evidence.filter((row) => !isBeforeCutoff(row.at));
  const heldOut = later.filter((row) => !priorBids.has(row.beatmapId));
  const comparisons = fitDemands(earlierPools).flatMap((demand) => {
    const { report: before } = assess(demand, training);
    if (before.classification !== "practice-opportunity") return [];
    const { report: after, highRows } = assess(demand, heldOut);
    const outcome =
      after.classification === "insufficient-samples"
        ? "insufficient-samples"
        : after.classification === "practice-opportunity"
          ? "observed-again"
          : "not-observed-again";
    return [
      { before, after, outcome, heldOutEvidence: evidenceExamples(highRows) },
    ];
  });
  return {
    cutoff: holdoutCutoff,
    training: countEvidence(training),
    heldOut: countEvidence(heldOut),
    repeatBidGamesExcluded: later.length - heldOut.length,
    comparisons,
  };
}

export async function playerPractice(
  db: SimilarityDatabase,
  snapshot: PracticeCorpus,
  osuId: number,
  validate: boolean,
) {
  const { evidence, published, publishedPlays, exclusions } =
    collectPlayerEvidence(snapshot, osuId);
  const assessments = fitDemands(snapshot.pools).map((demand) =>
    assess(demand, evidence),
  );
  return {
    osuId,
    modelVersion: 1,
    status: assessments.some(
      ({ report }) => report.classification !== "insufficient-samples",
    )
      ? "ready"
      : "insufficient-samples",
    capturedAt: snapshot.capturedAt,
    statisticsSha256: createHash("sha256")
      .update(JSON.stringify(snapshot.releases))
      .digest("hex"),
    pools: snapshotInfo(snapshot.pools),
    sources: snapshot.releases.map((release) => releaseSource(release, osuId)),
    seasons: snapshot.releases.map((release) => ({
      ...releaseSource(release, osuId),
      publishedPlays: release.plays.filter((row) => row.osuId === osuId).length,
      usable: countEvidence(
        evidence.filter((row) => row.edition === release.slug),
      ),
    })),
    publishedPlays,
    usable: countEvidence(evidence),
    exclusions,
    policy: {
      minimumPeers,
      minimumGames,
      minimumMaps,
      minimumFixtures,
      minimumGap,
    },
    assessments: assessments.map(({ report, highRows }) => ({
      ...report,
      evidence: evidenceExamples(highRows),
    })),
    recommendations: await recommendations(
      db,
      snapshot.pools,
      assessments,
      published,
    ),
    ...(validate
      ? { temporalValidation: validateTemporal(snapshot, evidence, osuId) }
      : {}),
  };
}
