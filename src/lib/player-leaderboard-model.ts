import { z } from "zod";
import {
  classRules,
  PLAYER_CLASS_POLICY,
  type BaseClass,
} from "./player-class";
import type { DirectoryArt } from "./osu-profiles";

const nullableString = z.union([z.null(), z.string()]);
const nullableNumber = z.union([z.null(), z.number()]);
export const playerClassificationReadContract = z.strictObject({
  category: z.union(
    (Object.keys(classRules) as BaseClass[]).map((key) => z.literal(key)),
  ),
  code: z.union(
    Object.values(classRules).flatMap(({ codes }) =>
      codes.map((code) => z.literal(code)),
    ),
  ),
  policy: z.literal(PLAYER_CLASS_POLICY),
});
const leaderboardRow = z.strictObject({
  osuId: z.number(),
  username: z.string(),
  team: nullableString,
  pp: nullableNumber,
  mra: z.number(),
  rws: nullableNumber,
  classification: z.union([z.null(), playerClassificationReadContract]),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  appearances: z.number(),
  winRate: nullableNumber,
  participation: nullableNumber,
  nm: z.number(),
  mod: z.number(),
  hd: z.number(),
  hr: z.number(),
  dt: z.number(),
});
export const playerLeaderboardReadContract = z.strictObject({
  players: z.array(leaderboardRow),
  maps: z.number(),
  state: z.union([z.literal("pending"), z.literal("ready")]),
  editions: z.number(),
  unavailableEditions: z.number(),
  skippedMaps: z.number(),
  calculatedAt: nullableString,
  art: z.record(
    z.string(),
    z.strictObject({ avatarUrl: nullableString, coverUrl: nullableString }),
  ),
});
export type PlayerLeaderboardRow = z.infer<typeof leaderboardRow>;

export type PlayerLeaderboard = {
  players: PlayerLeaderboardRow[];
  editions: number;
  unavailableEditions: number;
  maps: number;
  skippedMaps: number;
  /** Saved avatar/cover art for the card list, keyed by osu! id. */
  art: Map<number, DirectoryArt>;
  state: "ready" | "pending";
  calculatedAt: string | null;
};

export type PlayerLeaderboardCore = Omit<
  PlayerLeaderboard,
  "art" | "state" | "calculatedAt"
>;
export type PlayerLeaderboardWire = z.infer<
  typeof playerLeaderboardReadContract
>;
