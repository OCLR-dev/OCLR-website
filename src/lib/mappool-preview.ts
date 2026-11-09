import { db } from "@/db";
import { tournamentRounds } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { getEdition } from "./content";
import { HttpError } from "./http-error";
import {
  parseBeatmapId,
  parseMappoolRows,
  type BeatmapSnapshot,
} from "./mappool-model";
import { mappoolWorkspace } from "./mappool-reads";
import {
  batchBeatmapPreviewInput,
  singleBeatmapPreviewInput,
  type MappoolBatchPreview,
} from "./mappool-write-contracts";
import { fetchBeatmap, fetchBeatmaps, withBeatmapAttributes } from "./osu-beatmaps";

// Preview is a protected read, not a mutation. No registration or audit data is returned.
export async function previewBeatmap(
  actor: User,
  slug: string,
  input: unknown,
): Promise<BeatmapSnapshot> {
  await assertCapability(actor, "manage_mappools", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = singleBeatmapPreviewInput.safeParse(input);
  const id = parsed.success ? parseBeatmapId(parsed.data.beatmap) : null;
  if (!id)
    throw new HttpError(
      400,
      "Enter an osu! beatmap ID or canonical difficulty URL.",
    );
  return withBeatmapAttributes(
    await fetchBeatmap(id),
    parsed.data!.difficultyConfiguration,
  );
}
export async function previewMappoolBatch(
  actor: User,
  slug: string,
  input: unknown,
): Promise<MappoolBatchPreview> {
  // Batch preview prepares an edit and spends the osu! lookup budget.
  await assertCapability(actor, "manage_mappools", slug);
  const data = await mappoolWorkspace(actor, slug);
  const parsed = batchBeatmapPreviewInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Choose a pool and enter 1–50 rows.");
  const c = parsed.data,
    pool = data.pools.find((p) => p.id === c.poolId);
  if (!pool) throw new HttpError(404, "Mappool not found.");
  if (
    pool.version !== c.expectedVersion ||
    pool.lockedAt ||
    pool.selectionLockedAt
  )
    throw new HttpError(
      409,
      "Refresh the pool. Stale or completed-fixture pools cannot be edited.",
    );
  let rows;
  try {
    rows = parseMappoolRows(
      c.text,
      c.category,
      data.entries.filter((e) => e.poolId === pool.id),
    );
  } catch {
    throw new HttpError(400, "Enter between 1 and 50 map rows.");
  }
  const [round] = await db()
    .select({ rules: tournamentRounds.scoringRules })
    .from(tournamentRounds)
    .where(eq(tournamentRounds.id, pool.roundId));
  rows = rows.map((r) => ({
    ...r,
    error:
      r.error ??
      (r.category === "FM" && !pool.fmMode
        ? "Configure Free Mod or Force Mod first."
        : null),
  }));
  const ids = rows.filter((r) => !r.error).map((r) => r.beatmapId!);
  const snapshots = ids.length
    ? await fetchBeatmaps(ids)
    : new Map<number, BeatmapSnapshot | HttpError>();
  return {
    poolId: pool.id,
    version: pool.version,
    rows: rows.map((r) => {
      const snapshot = snapshots.get(r.beatmapId!);
      return {
        ...r,
        snapshot: snapshot instanceof HttpError ? null : (snapshot ?? null),
        error:
          r.error ??
          (snapshot instanceof HttpError
            ? snapshot.message
            : snapshot &&
                round.rules &&
                snapshot.metadata.mode !== round.rules.mode
              ? "Beatmap ruleset does not match the configured round."
              : null),
      };
    }),
  };
}
