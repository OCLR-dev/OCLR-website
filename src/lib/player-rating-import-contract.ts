import { z } from "zod";
import type { WriteApiOperation } from "./write-api-contract";

export const importedRatingsEdition = "s11";
export const importedRatingSource = z.enum(["sip", "etx"]);
export const playerRatingCsvLimit = 2 * 1024 * 1024;

export const importPlayerRatingsWrite = {
  id: "importPlayerRatings",
  method: "POST",
  path: "/api/admin/tournaments/{edition}/player-ratings",
  access: "browser",
  maxBodyBytes: 2 * playerRatingCsvLimit + 64 * 1024,
  request: z.strictObject({
    source: importedRatingSource,
    csv: z.string().min(1).max(playerRatingCsvLimit),
  }),
  summary: "Import S11 SIP or ETX ratings",
  description:
    "Requires manage_registrations in S11. Imports the selected source for matched accepted registrations. SIP matches a unique case-insensitive current username and ETX matches osu! ID. Changes and their audit event commit together.",
  successStatus: 200,
  successDescription: "Counts and a sample of unmatched CSV row numbers.",
  response: z.strictObject({
    matched: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    unmatchedRows: z.array(z.number().int().positive()).max(10),
    missing: z.number().int().nonnegative(),
  }),
  errors: {
    400: "Invalid or conflicting CSV records.",
    401: "Sign in as staff.",
    403: "Edition-scoped Admin permission and a same-origin browser are required.",
    404: "S11 is unavailable.",
    409: "The tournament is archived.",
    413: "The request exceeds the import limit.",
    415: "A JSON request is required.",
  },
  consumers: ["src/components/player-rating-import.tsx"],
} as const satisfies WriteApiOperation;
