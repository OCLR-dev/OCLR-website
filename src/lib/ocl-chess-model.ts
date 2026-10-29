import { z } from "zod";
export const chessPalette = [
  "#FFFFFF",
  "#E4E4E4",
  "#888888",
  "#222222",
  "#FFA7D1",
  "#E50000",
  "#E59500",
  "#A06A42",
  "#E5D900",
  "#94E044",
  "#02BE01",
  "#00D3DD",
  "#0083C7",
  "#0000EA",
  "#CF6EE4",
  "#820080",
] as const;
export const chessSize = 128;
export const pixelCommand = z
  .object({
    requestId: z.uuid(),
    x: z.number().int().min(0).max(127),
    y: z.number().int().min(0).max(127),
    color: z.number().int().min(0).max(15),
  })
  .strict();
export const chessAdminCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("toggle"),
      enabled: z.boolean(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("clear"),
      x: z.number().int().min(0).max(127),
      y: z.number().int().min(0).max(127),
      width: z.number().int().min(1).max(128),
      height: z.number().int().min(1).max(128),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict()
    .refine((v) => v.x + v.width <= 128 && v.y + v.height <= 128),
]);
export type ChessState = {
  pixels: string;
  revision: number;
  enabled: boolean;
  nextAt: number;
  serverTime: number;
  signedIn: boolean;
  admin: boolean;
};
