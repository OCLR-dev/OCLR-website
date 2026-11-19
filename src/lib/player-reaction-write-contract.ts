import { z } from "zod";
import type { WriteApiOperation } from "./write-api-contract";

const reactions = z.array(
  z.object({
    id: z.string(),
    count: z.number().int().positive(),
    selected: z.boolean(),
  }),
);
export type PlayerReactionSummary = z.infer<typeof reactions>;

export const setPlayerReactionWrite = {
  id: "setPlayerReaction",
  path: "/api/tournaments/{edition}/players/{osuId}/reactions",
  method: "PUT",
  access: "browser",
  parameters: { osuId: z.string().regex(/^[1-9]\d*$/) },
  request: z.strictObject({
    id: z.string().min(1).max(100),
    selected: z.boolean(),
  }),
  maxBodyBytes: 1024,
  summary: "Set the signed-in account's emoji reaction to a tournament player",
  description:
    "Requires a browser session, same origin, a catalog emoji and a target with accepted registration in a published edition. Repeating the same selection is idempotent. Only aggregate counts and the caller's own selection are returned.",
  successStatus: 200,
  successDescription:
    "The target player's current reactions and the caller's selection.",
  response: reactions,
  errors: {
    400: "Invalid player ID, emoji ID or selection.",
    401: "An active browser session is required.",
    403: "Origin or authentication channel rejected.",
    404: "The target player is not accepted in a published edition.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
  consumers: ["src/components/player-reactions.tsx"],
} as const satisfies WriteApiOperation;
