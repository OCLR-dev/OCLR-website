import { createHash } from "node:crypto";
import { z } from "zod";
import { osuApi } from "./osu-api";
import { HttpError } from "./http-error";
import { baseDifficulty, previewConfigurations } from "./difficulty-display";
import {
  difficultyMods,
  type DifficultyConfiguration,
  type BeatmapAttributes,
  type BeatmapSnapshot,
  type DifficultySnapshot,
} from "./mappool-model";
const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const beatmap = z.object({
  id: positiveId,
  beatmapset_id: positiveId,
  version: z.string().trim().min(1).max(500),
  difficulty_rating: z.number().finite().nonnegative(),
  bpm: z.number().finite().nonnegative(),
  total_length: z.number().int().nonnegative(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{32}$/i)
    .nullable()
    .optional(),
  status: z
    .enum([
      "graveyard",
      "wip",
      "pending",
      "ranked",
      "approved",
      "qualified",
      "loved",
    ])
    .optional(),
  mode: z.enum(["osu", "taiko", "fruits", "mania"]).optional(),
  ar: z.number().finite().nonnegative().nullable().optional(),
  accuracy: z.number().finite().nonnegative().nullable().optional(),
  cs: z.number().finite().nonnegative().nullable().optional(),
  drain: z.number().finite().nonnegative().nullable().optional(),
  beatmapset: z.object({
    title: z.string().trim().min(1).max(500),
    artist: z.string().trim().min(1).max(500),
    creator: z.string().trim().min(1).max(500),
  }),
});
// Per-process bounded cache. Preview and Save share the same verified snapshot.
const cache = new Map<
  number,
  { snapshot?: BeatmapSnapshot; error?: HttpError; expiresAt: number }
>();
const inFlight = new Map<number, Promise<BeatmapSnapshot>>();
function remember(
  id: number,
  value: { snapshot?: BeatmapSnapshot; error?: HttpError; expiresAt: number },
) {
  cache.delete(id);
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(id, value);
}

/** Explicit staff refresh/offline preparation only. Public saved reads never call this. */
export async function prepareDifficultySnapshot(
  snapshot: BeatmapSnapshot,
  configurations: readonly DifficultyConfiguration[],
): Promise<DifficultySnapshot> {
  if (!snapshot.metadata.mode)
    throw new HttpError(
      502,
      "osu! did not supply the map ruleset; adjusted attributes cannot be verified.",
    );
  const variants: DifficultySnapshot["variants"] = {};
  // Pace through the shared official API transport; complete combinations are
  // requested independently, never assembled from individual SR multipliers.
  for (const configuration of new Set(configurations)) {
    variants[configuration] = (
      await withBeatmapAttributes(snapshot, configuration)
    ).metadata.attributes!;
  }
  return {
    beatmapId: snapshot.beatmapId,
    ruleset: snapshot.metadata.mode,
    checksum: snapshot.metadata.checksum ?? null,
    fetchedAt: snapshot.fetchedAt,
    base: baseDifficulty(snapshot.metadata),
    variants,
  };
}

export async function refreshDifficultyPreviews(
  snapshot: BeatmapSnapshot,
  category: string,
  configuration: DifficultyConfiguration | null,
): Promise<BeatmapSnapshot> {
  const selected = await withBeatmapAttributes(snapshot, configuration);
  if (!snapshot.metadata.mode) return selected;
  const difficultySnapshot = await prepareDifficultySnapshot(
    snapshot,
    previewConfigurations(category, configuration),
  );
  return {
    ...selected,
    metadata: { ...selected.metadata, difficultySnapshot },
  };
}
function normalizeBeatmap(value: unknown, id: number): BeatmapSnapshot {
  const parsed = beatmap.safeParse(value);
  if (!parsed.success || parsed.data.id !== id)
    throw new HttpError(
      502,
      "osu! returned incomplete beatmap metadata. Saved records were preserved.",
    );
  const b = parsed.data;
  const fetchedAt = Date.now();
  const metadata = {
    setId: b.beatmapset_id,
    title: b.beatmapset.title,
    artist: b.beatmapset.artist,
    mapper: b.beatmapset.creator,
    difficulty: b.version,
    stars: b.difficulty_rating,
    bpm: b.bpm,
    duration: b.total_length,
    ...(b.checksum === undefined
      ? {}
      : { checksum: b.checksum?.toLowerCase() ?? null }),
    ...(b.status === undefined ? {} : { status: b.status }),
    ...(b.mode === undefined ? {} : { mode: b.mode }),
    ...(b.ar === undefined ? {} : { ar: b.ar }),
    ...(b.accuracy === undefined ? {} : { od: b.accuracy }),
    ...(b.cs === undefined ? {} : { cs: b.cs }),
    ...(b.drain === undefined ? {} : { hp: b.drain }),
  };
  const snapshot: BeatmapSnapshot = {
    beatmapId: id,
    fetchedAt: new Date(fetchedAt).toISOString(),
    metadata,
    fingerprint: createHash("sha256")
      .update(JSON.stringify({ beatmapId: id, metadata }))
      .digest("hex"),
  };
  remember(id, { snapshot, expiresAt: fetchedAt + 60000 });
  return snapshot;
}
async function loadBeatmap(id: number): Promise<BeatmapSnapshot> {
  try {
    return normalizeBeatmap(await osuApi(`/beatmaps/${id}`), id);
  } catch (error) {
    if (error instanceof HttpError) {
      // Cool down failed lookups too; never turn stale data into a verified Save.
      remember(id, {
        error,
        expiresAt:
          Date.now() +
          (error.status === 404 || error.status === 429 ? 60000 : 10000),
      });
    }
    throw error;
  }
}
export async function fetchBeatmap(id: number): Promise<BeatmapSnapshot> {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new HttpError(400, "Invalid beatmap ID.");
  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.snapshot) return cached.snapshot;
    throw cached.error!;
  }
  const existing = inFlight.get(id);
  if (existing) return existing;
  if (inFlight.size >= 6)
    throw new HttpError(429, "osu! lookup is busy. Please retry shortly.");
  const pending = loadBeatmap(id);
  inFlight.set(id, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(id);
  }
}

// The official batch endpoint accepts at most 50 IDs. Reuse single-lookup snapshots and in-flight work.
let batchRequests = 0;
export async function fetchBeatmaps(
  ids: number[],
): Promise<Map<number, BeatmapSnapshot | HttpError>> {
  const unique = [...new Set(ids)];
  if (
    !unique.length ||
    unique.length > 50 ||
    unique.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new HttpError(400, "A batch requires 1–50 valid beatmap IDs.");
  const missing = unique.filter(
    (id) =>
      !inFlight.has(id) && !((cache.get(id)?.expiresAt ?? 0) > Date.now()),
  );
  if (missing.length) {
    if (batchRequests >= 2)
      throw new HttpError(429, "osu! batch lookup is busy. Retry shortly.");
    batchRequests++;
    const pending = (async () => {
      try {
        const response = z
          .object({ beatmaps: z.array(z.unknown()).max(50) })
          .safeParse(
            await osuApi(
              `/beatmaps?${missing.map((id) => `ids[]=${id}`).join("&")}`,
            ),
          );
        if (!response.success)
          throw new HttpError(502, "osu! returned incomplete batch metadata.");
        return response.data.beatmaps;
      } finally {
        batchRequests--;
      }
    })();
    for (const id of missing) {
      const item = pending.then((records) =>
        normalizeBeatmap(
          records.find(
            (row) =>
              row && typeof row === "object" && "id" in row && row.id === id,
          ),
          id,
        ),
      );
      // Attach rejection handlers immediately; per-row failures are returned to the preview.
      item.catch((error: unknown) => {
        if (error instanceof HttpError)
          remember(id, {
            error,
            expiresAt:
              Date.now() +
              (error.status === 404 || error.status === 429 ? 60000 : 10000),
          });
      });
      inFlight.set(id, item);
    }
  }
  const rows = await Promise.all(
    unique.map(async (id) => {
      try {
        return [id, await fetchBeatmap(id)] as const;
      } catch (error) {
        return [
          id,
          error instanceof HttpError
            ? error
            : new HttpError(502, "Beatmap lookup failed."),
        ] as const;
      } finally {
        if (missing.includes(id)) inFlight.delete(id);
      }
    }),
  );
  return new Map<number, BeatmapSnapshot | HttpError>(rows);
}

const attributesCache = new Map<
  string,
  { value: BeatmapAttributes; expiresAt: number }
>();
const attributesPending = new Map<string, Promise<BeatmapAttributes>>();
export async function withBeatmapAttributes(
  snapshot: BeatmapSnapshot,
  configuration: DifficultyConfiguration | null,
): Promise<BeatmapSnapshot> {
  if (configuration === null) return snapshot;
  const ruleset = snapshot.metadata.mode;
  if (!ruleset)
    throw new HttpError(
      502,
      "osu! did not supply the map ruleset; adjusted attributes cannot be verified.",
    );
  const key = `${snapshot.beatmapId}:${ruleset}:${configuration}:${snapshot.fingerprint}`;
  const cached = attributesCache.get(key);
  let attributes: BeatmapAttributes;
  if (cached && cached.expiresAt > Date.now()) attributes = cached.value;
  else {
    let pending = attributesPending.get(key);
    if (!pending) {
      if (attributesPending.size >= 4)
        throw new HttpError(429, "Difficulty lookup is busy. Retry shortly.");
      pending = (async () => {
        const parsed = z
          .object({
            attributes: z
              .object({
                star_rating: z.number().finite().nonnegative(),
                max_combo: z.number().int().nonnegative().nullable().optional(),
              })
              .catchall(z.unknown()),
          })
          .safeParse(
            await osuApi(`/beatmaps/${snapshot.beatmapId}/attributes`, {
              mods: difficultyMods[configuration],
              ruleset,
            }),
          );
        if (!parsed.success)
          throw new HttpError(
            502,
            "osu! returned incomplete difficulty attributes. Saved data was preserved.",
          );
        const a = parsed.data.attributes;
        const values: Record<string, number> = {};
        for (const field of [
          "aim_difficulty",
          "speed_difficulty",
          "flashlight_difficulty",
          "approach_rate",
          "overall_difficulty",
          "great_hit_window",
          "stamina_difficulty",
          "rhythm_difficulty",
          "colour_difficulty",
          "peak_difficulty",
          "score_multiplier",
        ]) {
          const value = a[field];
          if (typeof value === "number" && Number.isFinite(value))
            values[field] = value;
        }
        const value: BeatmapAttributes = {
          configuration,
          mods: [...difficultyMods[configuration]],
          ruleset,
          stars: a.star_rating,
          maxCombo: a.max_combo ?? null,
          values,
          fetchedAt: new Date().toISOString(),
        };
        if (attributesCache.size >= 200)
          attributesCache.delete(attributesCache.keys().next().value!);
        attributesCache.set(key, { value, expiresAt: Date.now() + 15 * 60000 });
        return value;
      })();
      attributesPending.set(key, pending);
    }
    try {
      attributes = await pending;
    } finally {
      attributesPending.delete(key);
    }
  }
  const metadata = { ...snapshot.metadata, attributes };
  return {
    ...snapshot,
    metadata,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          beatmapId: snapshot.beatmapId,
          metadata: {
            ...metadata,
            attributes: { ...attributes, fetchedAt: undefined },
          },
        }),
      )
      .digest("hex"),
  };
}
