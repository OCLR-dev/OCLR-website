export const OPEN_MATCH_WARNING =
  "The lobby is still open. Review incomplete and extra games explicitly.";
import { z } from "zod";
import { scoringRulesSchema } from "./competition-model";
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const time = z.iso.datetime({ offset: true }).nullable();
export const matchScoreSchema = z
  .object({
    osuId: id.nullable(),
    total: integer.nullable(),
    team: z.enum(["blue", "red", "none"]).nullable(),
    slot: integer.nullable(),
    passed: z.boolean().nullable(),
    mods: z.array(z.string().max(16)).max(64),
    accuracy: z.number().min(0).max(1).nullable(),
    combo: integer.nullable(),
    hitCounts: z
      .object({
        great: integer.nullable(),
        ok: integer.nullable(),
        meh: integer.nullable(),
        miss: integer.nullable(),
      })
      .strict()
      .optional(),
    providerFields: z.record(
      z.string(),
      z.union([
        z.string().max(100),
        z.number().finite(),
        z.boolean(),
        z.null(),
      ]),
    ),
    problems: z.array(z.string().max(250)).max(32),
  })
  .strict();
export const matchGameSchema = z
  .object({
    id,
    beatmapId: id.nullable(),
    startTime: time,
    endTime: time,
    mode: z.string().max(30).nullable(),
    teamType: z.string().max(40).nullable(),
    scoringType: z.string().max(40).nullable(),
    mods: z.array(z.string().max(16)).max(64),
    scores: z.array(matchScoreSchema).max(64),
    problems: z.array(z.string().max(250)).max(32),
    beatmap: z
      .object({
        setId: id.nullable(),
        title: z.string().max(500).nullable(),
        artist: z.string().max(500).nullable(),
        difficulty: z.string().max(500).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const matchSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    apiVersion: z.literal("20220705"),
    fetchedAt: z.iso.datetime(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    match: z
      .object({
        id,
        title: z.string().max(500),
        startTime: time,
        endTime: time,
      })
      .strict(),
    firstEventId: integer,
    latestEventId: integer,
    currentGameId: id.nullable(),
    pages: z.number().int().min(1).max(100),
    complete: z.boolean(),
    warnings: z.array(z.string().max(300)).max(100),
    events: z
      .array(
        z
          .object({
            id,
            at: time,
            type: z.string().max(80),
            actorOsuId: id.nullable(),
            gameId: id.nullable(),
          })
          .strict(),
      )
      .max(10000),
    games: z.array(matchGameSchema).max(3000),
  })
  .strict();
export type MatchSource = z.infer<typeof matchSourceSchema>;
export type MatchGame = z.infer<typeof matchGameSchema>;
export type MatchScore = z.infer<typeof matchScoreSchema>;
export const gameDecisionSchema = z
  .object({
    gameId: id,
    included: z.boolean(),
    reason: z.string().trim().max(1000),
    complianceConfirmed: z.boolean(),
    substitutions: z
      .array(
        z
          .object({
            osuId: id,
            teamId: z.uuid(),
            reason: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export type GameDecision = z.infer<typeof gameDecisionSchema>;
export type GamePreview = {
  exMode: boolean;
  game: MatchGame;
  players: (MatchScore & {
    teamId: string | null;
    evidence: "roster" | "substitution" | null;
  })[];
  colors: { blueTeamId: string | null; redTeamId: string | null };
  confidence: "roster" | "manual" | "unresolved";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  tied: boolean;
  problems: string[];
  warnings: string[];
  decision: GameDecision | null;
};
export type SeriesOutcome = {
  homeWins: number;
  awayWins: number;
  tiedMaps: number;
  includedGames: number;
  winnerTeamId: string | null;
  draw: boolean;
  complete: boolean;
};
export type MatchImportPreview = {
  fixtureId: string;
  source: {
    matchId: number;
    title: string;
    fingerprint: string;
    complete: boolean;
    warnings: string[];
  };
  teams: { id: string; name: string }[];
  games: GamePreview[];
  series: SeriesOutcome;
  blockers: string[];
  canSubmit: boolean;
};

export type MatchContext = {
  exDeclarations?: readonly {
    id: string;
    beatmapId: number;
    exMode: boolean;
  }[];
  fixture: {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    status: string;
  };
  round: { scoringRules: unknown };
  teams: readonly {
    id: string;
    name: string;
    members: readonly { osuId: number; username: string }[];
  }[];
  pool: {
    fmMode: string | null;
    fmRestrictions: string;
    entries: readonly { beatmapId: number; category: string }[];
  } | null;
};

export const reviewedResultSchema = z
  .object({
    exDeclarations: z
      .array(
        z.object({ id: z.uuid(), beatmapId: id, exMode: z.boolean() }).strict(),
      )
      .max(200)
      .optional(),
    schemaVersion: z.literal(1),
    fixtureVersion: integer,
    roundId: z.uuid(),
    poolVersion: integer.nullable(),
    poolSnapshot: z
      .object({
        poolId: z.uuid(),
        fmMode: z.enum(["free_mod", "force_mod"]).nullable(),
        fmRestrictions: z.string().max(2000),
        entries: z
          .array(
            z
              .object({
                beatmapId: id,
                category: z.string().max(8),
                position: integer,
              })
              .strict(),
          )
          .max(6000),
      })
      .strict()
      .nullable(),
    teamIds: z.tuple([z.uuid(), z.uuid()]).refine((ids) => ids[0] !== ids[1]),
    rosterSnapshot: z
      .array(
        z.object({ teamId: z.uuid(), osuIds: z.array(id).max(1000) }).strict(),
      )
      .length(2),
    rulesSnapshot: scoringRulesSchema,
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decisions: z.array(gameDecisionSchema).max(3000),
    publicNote: z.string().trim().max(1000),
    games: z
      .array(
        z
          .object({
            gameId: id,
            confidence: z.enum(["roster", "manual", "unresolved"]).optional(),
            attribution: z
              .array(
                z
                  .object({
                    osuId: id.nullable(),
                    teamId: z.uuid().nullable(),
                    evidence: z.enum(["roster", "substitution"]).nullable(),
                  })
                  .strict(),
              )
              .max(64)
              .optional(),
            warnings: z.array(z.string().max(1000)).max(200).optional(),
            exMode: z.boolean().optional(),
            beatmapId: id.nullable(),
            beatmap: matchGameSchema.shape.beatmap,
            mods: z.array(z.string().max(16)).max(64),
            scoringType: z.string().max(40).nullable(),
            homeScore: z
              .number()
              .finite()
              .nonnegative()
              .max(Number.MAX_SAFE_INTEGER),
            awayScore: z
              .number()
              .finite()
              .nonnegative()
              .max(Number.MAX_SAFE_INTEGER),
            winnerTeamId: z.uuid().nullable(),
            tied: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(3000),
    series: z
      .object({
        homeWins: integer,
        awayWins: integer,
        tiedMaps: integer,
        includedGames: integer,
        winnerTeamId: z.uuid().nullable(),
        draw: z.boolean(),
        complete: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .refine(
    (r) =>
      new Set(r.games.map((g) => g.gameId)).size === r.games.length &&
      r.games.every((g) =>
        g.tied
          ? g.winnerTeamId === null
          : r.teamIds.includes(g.winnerTeamId ?? ""),
      ) &&
      r.series.includedGames === r.games.length &&
      r.series.homeWins ===
        r.games.filter((g) => g.winnerTeamId === r.teamIds[0]).length &&
      r.series.awayWins ===
        r.games.filter((g) => g.winnerTeamId === r.teamIds[1]).length &&
      r.series.tiedMaps === r.games.filter((g) => g.tied).length &&
      (r.series.draw
        ? r.series.winnerTeamId === null &&
          r.series.homeWins === r.series.awayWins
        : r.series.winnerTeamId ===
            (r.series.homeWins > r.series.awayWins
              ? r.teamIds[0]
              : r.teamIds[1]) && r.series.homeWins !== r.series.awayWins),
  );
export type ReviewedResult = z.infer<typeof reviewedResultSchema>;
