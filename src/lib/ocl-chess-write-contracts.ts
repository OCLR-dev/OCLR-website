import { z } from "zod";
import {
  chessAdminCommand,
  chessStateSchema,
  pixelCommand,
} from "./ocl-chess-model";
import type { WriteApiOperation } from "./write-api-contract";

const canvas = {
  path: "/api/games/ocl-chess",
  access: "browser",
  maxBodyBytes: 2048,
  successStatus: 200,
  successDescription:
    "Current canvas and the caller's cooldown and permissions.",
  successHeaders: { "Cache-Control": z.literal("no-store") },
  response: chessStateSchema.extend({ id: z.literal(1) }),
  consumers: ["src/app/games/ocl-chess/workspace.tsx"],
} as const;
const errors = {
  400: "Invalid canvas command.",
  401: "An authenticated browser session is required.",
  403: "Origin or authentication channel rejected.",
  500: "Unexpected failure.",
  503: "The canvas or site origin is unavailable.",
};

export const placeChessPixelWrite = {
  ...canvas,
  id: "placeChessPixel",
  method: "POST",
  request: pixelCommand,
  summary: "Place a pixel on the OCL Chess canvas",
  description:
    "Uses the signed-in browser account. Identical retries by that account return the current board without another write or cooldown. New placements require an enabled canvas and enforce the per-account cooldown. An already accepted retry can still be confirmed while paused.",
  errors: {
    ...errors,
    403: "Origin, authentication channel, or paused canvas rejected.",
    409: "The request ID was already used with different data or by another account.",
    429: "The caller is still on cooldown.",
  },
} as const satisfies WriteApiOperation;

export const moderateChessWrite = {
  ...canvas,
  id: "moderateChess",
  method: "PATCH",
  request: chessAdminCommand,
  summary: "Toggle the OCL Chess canvas or clear a rectangle",
  description:
    "Requires global configure_tournament and the current canvas revision. The clear rectangle must fit within the 128 by 128 canvas. A saved command and its audit event commit together.",
  errors: {
    ...errors,
    403: "Origin, authentication channel, or global administration permission rejected.",
    409: "The canvas revision changed.",
  },
} as const satisfies WriteApiOperation;

export type ChessPixelInput = z.input<typeof placeChessPixelWrite.request>;
export type ChessModerationInput = z.input<typeof moderateChessWrite.request>;
