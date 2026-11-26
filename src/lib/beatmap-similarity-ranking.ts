import { createHash } from "node:crypto";
import type { Client } from "pg";
import { difficultyRate } from "./difficulty-display";
import {
  baseFeatures,
  features,
  featureNames,
  poolUrl,
  sourceUrls,
  type Feature,
  type Slot,
  type Snapshot,
} from "./beatmap-similarity-model";

export const profiles = {
  base: baseFeatures,
  skills: [...baseFeatures, "aim", "speed"],
} as const;

type Filters = {
  candidateEdition?: string;
  pool?: string;
  minStars?: number;
  maxStars?: number;
};
type Query = Filters & {
  bid: number;
  mod: NonNullable<Slot["mod"]>;
  profile: keyof typeof profiles;
  repeat: number;
  allowedBids?: ReadonlySet<number>;
};
type VerifiedSlot = Slot & {
  bid: number;
  checksum: string;
  difficultyFetchedAt: string;
};
type MapVersion = VerifiedSlot & { sources: VerifiedSlot[] };

export function latestVersions(slots: Slot[], mod: Query["mod"]) {
  const versions = new Map<number, MapVersion>();
  const ordered = slots
    .filter(
      (slot): slot is VerifiedSlot =>
        slot.mod === mod &&
        slot.bid !== null &&
        slot.checksum !== undefined &&
        slot.difficultyFetchedAt !== undefined &&
        !slot.excluded,
    )
    .sort(
      (a, b) =>
        Date.parse(b.difficultyFetchedAt) - Date.parse(a.difficultyFetchedAt) ||
        a.checksum.localeCompare(b.checksum) ||
        a.edition.localeCompare(b.edition) ||
        a.poolId.localeCompare(b.poolId) ||
        a.slot.localeCompare(b.slot),
    );
  for (const slot of ordered) {
    const current = versions.get(slot.bid);
    if (!current) {
      versions.set(slot.bid, { ...slot, sources: [slot] });
    } else if (current.checksum === slot.checksum) {
      current.sources.push(slot);
      current.setId ??= slot.setId;
    }
  }
  return [...versions.values()].sort((a, b) => a.bid - b.bid);
}

function sources(row: MapVersion) {
  return row.sources.map((source) => ({
    edition: source.edition,
    pool: source.poolName,
    slot: source.slot,
    url: poolUrl(source),
  }));
}

export function snapshotInfo(snapshot: Snapshot) {
  return {
    version: snapshot.version,
    capturedAt: snapshot.capturedAt,
    sha256: createHash("sha256")
      .update(
        JSON.stringify({ sources: snapshot.sources, slots: snapshot.slots }),
      )
      .digest("hex"),
    sources: snapshot.sources.map((source) => ({
      ...source,
      ...sourceUrls(source),
    })),
  };
}

function percentile(values: number[], quantile: number) {
  return values[Math.ceil(values.length * quantile) - 1];
}

function distribution(slots: Slot[]) {
  return Object.fromEntries(
    featureNames.map((feature) => {
      const values = slots
        .flatMap((slot) => slot.values[feature] ?? [])
        .sort((a, b) => a - b);
      return [
        feature,
        {
          unit: features[feature].unit,
          n: values.length,
          missing: slots.length - values.length,
          p25: percentile(values, 0.25) ?? null,
          median:
            values.length % 2 === 0 && values.length
              ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
              : (percentile(values, 0.5) ?? null),
          p75: percentile(values, 0.75) ?? null,
        },
      ];
    }),
  );
}

export function describePools(snapshot: Snapshot, onlyPool?: string) {
  const selected = snapshot.slots.filter(
    (slot) => !onlyPool || slot.edition + ":" + slot.poolId === onlyPool,
  );
  if (!selected.length)
    throw new Error("No published slots match the selected pools.");
  const groups = new Map<string, Slot[]>();
  for (const slot of selected) {
    const key =
      slot.edition +
      ":" +
      slot.poolId +
      ":" +
      slot.category +
      ":" +
      (slot.mod ?? "unresolved");
    const slots = groups.get(key) ?? [];
    slots.push(slot);
    groups.set(key, slots);
  }
  return {
    snapshot: snapshotInfo(snapshot),
    coverage: snapshot.sources
      .filter((source) =>
        selected.some((slot) => slot.edition === source.edition),
      )
      .map((source) => {
        const byCategory = Map.groupBy(
          selected.filter((slot) => slot.edition === source.edition),
          (slot) => slot.mod ?? slot.category,
        );
        return {
          edition: source.edition,
          categories: [...byCategory].map(([category, slots]) => ({
            category,
            slots: slots.length,
            baseAvailable: slots.filter((slot) =>
              baseFeatures.every(
                (feature) => slot.values[feature] !== undefined,
              ),
            ).length,
            skillsAvailable: slots.filter((slot) =>
              profiles.skills.every(
                (feature) => slot.values[feature] !== undefined,
              ),
            ).length,
            knownSetIds: slots.filter((slot) => slot.setId !== undefined)
              .length,
            fileChecks: Object.fromEntries(
              [...Map.groupBy(slots, (slot) => slot.file ?? "unchecked")].map(
                ([state, rows]) => [state, rows.length],
              ),
            ),
            exclusions: Object.fromEntries(
              [
                ...Map.groupBy(
                  slots,
                  (slot) =>
                    slot.excluded ??
                    (baseFeatures.every(
                      (feature) => slot.values[feature] !== undefined,
                    )
                      ? "eligible"
                      : "incomplete-base"),
                ),
              ]
                .filter(([reason]) => reason !== "eligible")
                .map(([reason, rows]) => [reason, rows.length]),
            ),
          })),
        };
      }),
    rounds: [...groups.values()].map((slots) => {
      const { edition, poolId, poolName, category, mod } = slots[0];
      return {
        edition,
        poolId,
        poolName,
        category,
        mod,
        slots: slots.length,
        features: distribution(slots),
      };
    }),
  };
}

const rankSql = `
  WITH candidates AS (
    SELECT bid, signature, embedding::public.vector AS embedding,
           baseline::public.vector AS baseline
    FROM jsonb_to_recordset($1::jsonb)
         AS rows(bid bigint, signature text, embedding text, baseline text)
  ), distances AS (
    SELECT bid, signature,
           embedding OPERATOR(public.<->) $2::public.vector AS vector_distance,
           baseline OPERATOR(public.<->) $3::public.vector AS baseline_distance
    FROM candidates
  ), methods AS (
    SELECT bid, signature, 'vector' AS method, vector_distance AS distance FROM distances
    UNION ALL
    SELECT bid, signature, 'baseline', baseline_distance FROM distances
  ), mapsets AS (
    SELECT *, row_number() OVER (PARTITION BY method, signature ORDER BY distance, bid) AS mapset_rank
    FROM methods
  ), ranked AS (
    SELECT *, row_number() OVER (PARTITION BY method ORDER BY distance, bid) AS rank
    FROM mapsets WHERE mapset_rank = 1
  )
  SELECT bid::text, method, rank::int, distance
  FROM ranked WHERE rank <= 10 ORDER BY method, rank
`;

export type SimilarityDatabase = Pick<Client, "query">;

type Rank = {
  bid: string;
  method: "baseline" | "vector";
  rank: number;
  distance: number;
};
const baselineFeatures = ["stars", "bpm"] as const;
const setKey = (row: MapVersion) =>
  row.setId ? "set:" + row.setId : "bid:" + row.bid;

export async function compareBeatmaps(
  db: SimilarityDatabase,
  snapshot: Snapshot,
  query: Query,
) {
  const dimensions: readonly Feature[] = profiles[query.profile];
  const maps = latestVersions(snapshot.slots, query.mod);
  const input = maps.find((row) => row.bid === query.bid);
  if (!input)
    throw new Error(
      "BID " +
        query.bid +
        " has no verified " +
        query.mod +
        " configuration in the selected public pools.",
    );
  const inputValues = input.values;
  const missing = dimensions.filter(
    (feature) => inputValues[feature] === undefined,
  );
  if (missing.length)
    throw new Error(
      "BID " +
        query.bid +
        " is missing " +
        query.profile +
        " features: " +
        missing.join(", "),
    );
  const reference = maps.filter((row) =>
    dimensions.every((feature) => row.values[feature] !== undefined),
  );
  if (
    query.candidateEdition &&
    !snapshot.sources.some(
      (source) => source.edition === query.candidateEdition,
    )
  )
    throw new Error(
      "Candidate edition is outside the selected public snapshot.",
    );
  const pool =
    query.pool &&
    snapshot.slots.filter(
      (slot) => slot.edition + ":" + slot.poolId === query.pool,
    );
  if (pool && !pool.length)
    throw new Error("Target pool is outside the selected public snapshot.");
  const poolBids = new Set(pool ? pool.map((slot) => slot.bid) : []);
  const candidates = reference.filter(
    (row) =>
      row.bid !== input.bid &&
      (!query.allowedBids || query.allowedBids.has(row.bid)) &&
      !poolBids.has(row.bid) &&
      (!query.candidateEdition ||
        row.sources.some(
          (source) => source.edition === query.candidateEdition,
        )) &&
      row.values.stars! >= (query.minStars ?? -Infinity) &&
      row.values.stars! <= (query.maxStars ?? Infinity),
  );
  const normalization = dimensions.map((feature) => {
    const values = reference.map((row) => row.values[feature]!);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    );
    return { feature, mean, scale: deviation || 1, ...features[feature] };
  });
  function vector(row: MapVersion, method: Rank["method"]) {
    return JSON.stringify(
      normalization
        .filter(
          ({ feature }) =>
            method === "vector" ||
            baselineFeatures.some((key) => key === feature),
        )
        .map(
          ({ feature, mean, scale, weight }) =>
            ((row.values[feature]! - mean) / scale) *
            (method === "vector" ? Math.sqrt(weight) : 1),
        ),
    );
  }

  const mapById = new Map(candidates.map((row) => [row.bid, row]));
  const parameters = [
    JSON.stringify(
      candidates.map((row) => ({
        bid: row.bid,
        signature: setKey(row),
        embedding: vector(row, "vector"),
        baseline: vector(row, "baseline"),
      })),
    ),
    vector(input, "vector"),
    vector(input, "baseline"),
  ];
  const elapsed: number[] = [];
  let ranked: Rank[] = [];
  for (let run = 0; run < query.repeat; run++) {
    const start = performance.now();
    ranked = (await db.query<Rank>(rankSql, parameters)).rows;
    elapsed.push(performance.now() - start);
  }
  elapsed.sort((a, b) => a - b);

  function result(method: Rank["method"]) {
    return ranked
      .filter((rank) => rank.method === method)
      .map((rank) => {
        const row = mapById.get(Number(rank.bid))!;
        const differences = normalization
          .map(({ feature, unit, scale, weight }) => {
            const delta = row.values[feature]! - inputValues[feature]!;
            return {
              feature,
              unit,
              reference: inputValues[feature]!,
              candidate: row.values[feature]!,
              delta,
              contribution: weight * (delta / scale) ** 2,
            };
          })
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3);
        return {
          rank: rank.rank,
          bid: row.bid,
          setId: row.setId ?? null,
          title: row.title,
          checksum: row.checksum,
          distance: rank.distance,
          values: row.values,
          differences,
          sources: sources(row),
        };
      });
  }
  const vectorResults = result("vector");
  const baseline = result("baseline");
  return {
    snapshot: snapshotInfo(snapshot),
    input: {
      bid: input.bid,
      title: input.title,
      checksum: input.checksum,
      mod: query.mod,
      clockRate: difficultyRate(query.mod),
      values: inputValues,
      sources: sources(input),
    },
    profile: query.profile,
    normalization,
    filters: {
      candidateEdition: query.candidateEdition,
      pool: query.pool,
      minStars: query.minStars,
      maxStars: query.maxStars,
    },
    referenceCount: reference.length,
    candidateCount: candidates.length,
    candidateGroups: new Set(candidates.map(setKey)).size,
    unknownSetCount: candidates.filter((row) => !row.setId).length,
    overlap: vectorResults.filter((row) =>
      baseline.some((other) => other.bid === row.bid),
    ).length,
    queryMs: {
      samples: elapsed.length,
      p50: percentile(elapsed, 0.5),
      p95: percentile(elapsed, 0.95),
    },
    vector: vectorResults,
    baseline,
  };
}
