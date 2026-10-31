import { z } from "zod";
import { archiveEvidenceUrl } from "./archive-metadata";
import { matchSourceSchema } from "./match-model";

const id = z.number().int().positive();
export const statisticsExcludedGameSchema = z
  .object({
    gameId: id,
    reason: z.enum([
      "warmup",
      "aborted",
      "superseded-replay",
      "post-match",
      "outside-pool",
      "other",
      "unknown",
    ]),
  })
  .strict();
export const statisticsAdjudicationSchema = z
  .object({
    kind: z.literal("technical"),
    note: z.string().trim().min(1).max(6000).optional(),
    evidenceUrl: archiveEvidenceUrl.optional(),
  })
  .strict();
export const statisticsExcludedScoresSchema = z
  .array(
    z
      .object({
        gameId: id,
        osuId: id,
        reason: z.literal("non-participant").optional(),
      })
      .strict(),
  )
  .max(32000);

/** The deprecated flag is accepted on reads only; new writes use adjudication. */
export const statisticsSnapshotSchema = z
  .object({
    archiveKey: z.string().regex(/^[a-f0-9]{64}$/),
    source: matchSourceSchema,
    poolId: z.string().max(80),
    included: z.array(id).max(500),
    allowUnlistedMaps: z.boolean().optional(),
    excludedScores: statisticsExcludedScoresSchema.optional(),
    rosterTeamGames: z.array(id).max(500).optional(),
    technicalAdjudication: z.boolean().optional(),
    adjudication: statisticsAdjudicationSchema.nullable().optional(),
    excludedGames: z.array(statisticsExcludedGameSchema).max(500).optional(),
    reviewedBy: id.optional(),
    reviewedAt: z.iso.datetime({ offset: true }).optional(),
    evidenceUrl: archiveEvidenceUrl.optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if ((s.reviewedBy === undefined) !== (s.reviewedAt === undefined))
      issue("Reviewer and review time must be recorded together.");
    if (
      s.adjudication !== undefined &&
      s.technicalAdjudication !== undefined &&
      Boolean(s.adjudication) !== s.technicalAdjudication
    )
      issue("Conflicting adjudication representations.");
    if (s.excludedGames !== undefined) {
      const ids = s.excludedGames.map((g) => g.gameId);
      if (
        new Set(ids).size !== ids.length ||
        ids.some(
          (id) =>
            s.included.includes(id) || !s.source.games.some((g) => g.id === id),
        ) ||
        s.source.games.some(
          (g) => !s.included.includes(g.id) && !ids.includes(g.id),
        )
      )
        issue(
          "Excluded games must identify every unselected source game exactly once.",
        );
    }
  });
export type StatisticsSnapshot = z.infer<typeof statisticsSnapshotSchema>;
export type StatisticsAdjudication = z.infer<
  typeof statisticsAdjudicationSchema
>;

export function hasStatisticsAdjudication(
  s: Pick<StatisticsSnapshot, "adjudication" | "technicalAdjudication">,
) {
  return s.adjudication !== undefined
    ? s.adjudication?.kind === "technical"
    : s.technicalAdjudication === true;
}

/** In-memory compatibility migration; missing historical evidence stays absent. */
export function parseStatisticsSnapshot(input: unknown): StatisticsSnapshot {
  const s = statisticsSnapshotSchema.parse(input);
  const { technicalAdjudication, ...rest } = s;
  return {
    ...rest,
    adjudication:
      s.adjudication ?? (technicalAdjudication ? { kind: "technical" } : null),
    excludedGames:
      s.excludedGames ??
      s.source.games
        .filter((g) => !s.included.includes(g.id))
        .map((g) => ({ gameId: g.id, reason: "unknown" })),
  };
}
