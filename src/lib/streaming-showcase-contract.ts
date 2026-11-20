import { z } from "zod";
import { categories } from "./mappool-model";

const pool = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  version: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  stage: z.strictObject({
    id: z.uuid(),
    kind: z.enum(["group", "knockout", "exhibition"]),
  }),
  round: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    position: z.number().int().positive(),
  }),
  entryCount: z.number().int().nonnegative(),
});

export const showcasePoolsSchema = z.strictObject({ pools: z.array(pool) });
export const showcasePoolSchema = z.strictObject({
  pool,
  entries: z.array(
    z.strictObject({
      entryId: z.uuid(),
      slot: z.string(),
      category: z.enum(categories),
      position: z.number().int().positive(),
      beatmapId: z.number().int().positive(),
      title: z.string(),
      difficulty: z.string(),
      coverUrl: z.string().startsWith("/api/v1/streaming/").nullable(),
    }),
  ),
});
export const showcaseReplaysSchema = z.strictObject({
  poolId: z.uuid(),
  version: z.number().int().nonnegative(),
  entries: z.array(
    z.strictObject({
      entryId: z.uuid(),
      slot: z.string(),
      replays: z
        .array(
          z.strictObject({
            replayId: z.uuid(),
            filename: z.string(),
            playerName: z.string(),
            mods: z.number().int().nonnegative(),
          }),
        )
        .max(1),
    }),
  ),
});
export const showcaseVersionQuery = z.string().regex(/^(0|[1-9]\d{0,9})$/);
export const showcaseReadMaxBytes = 2097152;
export const showcasePath =
  "/api/v1/streaming/tournaments/{edition}/showcase/pools";
