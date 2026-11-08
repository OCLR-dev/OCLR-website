import { z } from "zod";

const text = z.string();
const number = z.number();
const flag = z.boolean();
const nullableString = z.union([z.null(), text]);
const nullableNumber = z.union([z.null(), number]);
const identity = z.strictObject({ id: text, name: text });
const publicTeam = z.strictObject({
  exhibition: z.union([z.literal(false), z.literal(true)]).optional(),
  ...identity.shape,
  avatarKey: nullableString.optional(),
});
const publicSlot = z.strictObject({
  team: z.union([z.null(), publicTeam]),
  label: text,
  sourceId: nullableString,
  outcome: z.union([z.null(), z.literal("winner"), z.literal("loser")]),
});
const publicMatchResult = z.strictObject({
  revision: number,
  homeWins: number,
  awayWins: number,
  tiedMaps: number,
  winnerTeamId: nullableString,
  draw: flag,
  games: z.array(
    z.strictObject({
      gameId: number,
      beatmapId: nullableNumber,
      beatmap: z.union([
        z.null(),
        z.strictObject({
          setId: nullableNumber,
          title: nullableString,
          artist: nullableString,
          difficulty: nullableString,
        }),
      ]),
      mods: z.array(text),
      scoringType: nullableString,
      homeScore: number,
      awayScore: number,
      winnerTeamId: nullableString,
      tied: flag,
    }),
  ),
  mpId: number,
  mpUrl: text,
  publicNote: text,
  updatedAt: text,
});
const publicFixture = z.strictObject({
  pool: z.union([z.null(), identity]),
  id: text,
  label: text,
  publishedAt: text,
  roundId: text,
  roundName: text,
  roundPosition: number,
  stageId: text,
  stage: z.union([
    z.literal("group"),
    z.literal("knockout"),
    z.literal("exhibition"),
  ]),
  position: number,
  home: publicSlot,
  away: publicSlot,
  confirmed: flag,
  scheduledAt: nullableString,
  timeZone: text,
  status: z.union([
    z.literal("scheduled"),
    z.literal("in_progress"),
    z.literal("cancelled"),
  ]),
  result: z.union([z.null(), publicMatchResult]),
  updatedAt: text,
});
export const publicCompetitionReadContract = z.union([
  z.null(),
  z.strictObject({
    fixtures: z.array(publicFixture),
    groups: z.array(
      z.strictObject({
        key: text,
        name: text,
        version: text,
        rows: z.array(
          z.strictObject({
            team: publicTeam,
            played: number,
            wins: number,
            losses: number,
            draws: number,
            mapsWon: number,
            mapsLost: number,
            mapDifference: number,
            points: nullableNumber,
            rank: nullableNumber,
          }),
        ),
        rankingPending: flag,
        criteria: z.union([
          z.null(),
          z.array(
            z.union([
              z.literal("points"),
              z.literal("wins"),
              z.literal("map_difference"),
              z.literal("maps_won"),
            ]),
          ),
        ]),
        rulesVersions: z.array(text),
      }),
    ),
    databaseAuthority: flag,
  }),
]);
export type PublicTeam = z.infer<typeof publicTeam>;
export type PublicSlot = z.infer<typeof publicSlot>;
export type PublicMatchResult = z.infer<typeof publicMatchResult>;
export type PublicFixture = z.infer<typeof publicFixture>;
