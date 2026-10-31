import { archiveEvidenceUrl } from "./archive-metadata";
import { z } from "zod";

const text = z.string().trim().min(1).max(300);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const source = z.string().trim().min(1).max(160);
const id = z.number().int().positive().max(2147483647);
const tier = z.number().int().min(0).max(32).nullable();
const slot = z.string().regex(/^(NM|HD|HR|DT|FM|TB|ACE)[1-9]\d?$/);
const score = z.number().int().min(0).max(100);
const pair = z.tuple([score, score]);
const note = z.string().trim().min(1).max(6000);
const timestamp = z.iso.datetime({ offset: true });
const sides = <T extends z.ZodType>(value: T) =>
  z.object({ red: value, blue: value }).strict();

/** Source-only identities never become accounts, profile URLs or current memberships. */
export const unresolvedArchivePlayer = z
  .object({
    id: key,
    username: text,
    teamId: key,
    role: z.enum(["captain", "player", "coach"]),
    tier,
    sourceRole: z.literal("VICE").optional(),
    source,
  })
  .strict();

export const archiveReplacement = z
  .object({
    id: key,
    teamId: key,
    tier: z.number().int().min(1).max(32).nullable(),
    people: z
      .array(
        z.object({ osuId: id.nullable(), username: text, source }).strict(),
      )
      .min(2)
      .max(10),
    replacedAt: timestamp.nullable(),
    note,
    source,
  })
  .strict();

/** Pending evidence cannot become a result; approval retains the source snapshot. */
export const archiveMatchReview = z
  .object({
    status: z.enum(["pending", "approved"]),
    approval: z
      .object({
        approvedOn: z.iso.date(),
        approvedBy: text.optional(),
        evidenceUrl: archiveEvidenceUrl.optional(),
        source: note,
      })
      .strict()
      .optional(),
    workingScore: pair.nullable(),
    rawScore: pair.nullable(),
    possibleScore: pair.nullable(),
    note,
    startedAt: timestamp.nullable(),
    redTeamId: key,
    blueTeamId: key,
    games: z
      .array(
        z
          .object({
            gameId: id,
            beatmapId: id,
            poolSlot: z.union([slot, z.literal("TB")]).nullable(),
            startTime: timestamp,
            endTime: timestamp.nullable(),
            disposition: z.enum([
              "outside-stage-pools",
              "earlier-completed-replay-candidate",
              "selected-under-last-completed-attempt-hypothesis",
              "aborted-no-result",
              "post-match-entertainment-pending-confirmation",
            ]),
            totals: sides(
              z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            ),
            positivePlayers: sides(z.number().int().min(0).max(100)),
            teamFail: sides(z.boolean()).optional(),
            winningColor: z.enum(["red", "blue"]).nullable().optional(),
            interpretationStatus: z.literal("pending-confirmation").optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const archiveQualifier = z
  .object({
    name: text,
    poolId: key,
    source,
    records: z
      .array(
        z
          .object({
            username: text,
            scores: z
              .array(
                z
                  .object({
                    slot,
                    score: z
                      .number()
                      .int()
                      .nonnegative()
                      .max(Number.MAX_SAFE_INTEGER),
                  })
                  .strict(),
              )
              .max(100),
            source,
          })
          .strict(),
      )
      .max(2048),
  })
  .strict();

export const archiveReviewTable = z
  .object({
    name: text,
    note,
    rows: z
      .array(
        z
          .object({
            teamId: key,
            wins: score,
            losses: score,
            mapsWon: score,
            mapsLost: score,
          })
          .strict(),
      )
      .max(128),
  })
  .strict();

export const archiveSourceFact = z
  .object({
    category: z.enum(["rules", "provenance", "bracket", "schedule", "review"]),
    label: text,
    text: note,
    source,
  })
  .strict();
