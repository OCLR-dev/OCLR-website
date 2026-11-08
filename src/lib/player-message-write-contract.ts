import { z } from "zod";
import { playerMessageSchema } from "./player-message-model";
import type { WriteApiOperation } from "./write-api-contract";

const path = "/api/tournaments/{edition}/players/{osuId}/messages";
const text = z
  .string()
  .trim()
  .pipe(z.string().min(1).max(1000))
  .describe("After trimming surrounding whitespace, 1 to 1000 UTF-16 code units.");
const version = z
  .string()
  .regex(/^\d+$/)
  .describe("Opaque version returned by the server. Send it as a string.");
const parameters = {
  osuId: z.string().describe("Must convert to a positive safe integer."),
};
const messageParameters = { ...parameters, messageId: z.uuid() };
const consumer = "src/components/player-message-board.tsx";
const transport = {
  access: "browser",
  maxBodyBytes: 8192,
  consumers: [consumer],
} as const;
const errors = {
  400: "Invalid player ID, message ID or request fields.",
  401: "An active browser session is required.",
  403: "Origin or authentication channel rejected.",
  404: "The target player is not accepted in the published edition or the owned message was not found.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

export const postPlayerMessageWrite = {
  ...transport,
  id: "postPlayerMessage",
  path,
  method: "POST",
  parameters,
  request: z.strictObject({ requestId: z.uuid(), text }),
  summary: "Post a signed message for a published tournament player",
  description:
    "Requires a browser session and a target with accepted registration in the published edition. The signed-in account is the author. Reusing its request ID with the same target and saved text returns the existing message. A changed payload or reuse after deletion conflicts. Posting limits apply per author across targets, including recently deleted messages.",
  successStatus: 201,
  successDescription: "The saved or replayed message, including its current version.",
  response: playerMessageSchema,
  errors: {
    ...errors,
    400: "Invalid player ID or message request.",
    404: "The target player is not accepted in the published edition.",
    409: "The request ID is already in use for different content, another target, or a deleted message.",
    429: "The author exceeded the posting rate limit.",
  },
} as const satisfies WriteApiOperation;

export const editPlayerMessageWrite = {
  ...transport,
  id: "editPlayerMessage",
  path: `${path}/{messageId}`,
  method: "PATCH",
  parameters: messageParameters,
  request: z.strictObject({ version, text }),
  summary: "Edit the signed-in author's player message",
  description:
    "Checks current publication, accepted registration, message ownership and the supplied version. An edit retains the original creation time and returns the new version. Refresh the list after a conflict before trying again.",
  successStatus: 200,
  successDescription: "The edited message with its updated version.",
  response: playerMessageSchema,
  errors: { ...errors, 409: "The message has changed since the supplied version." },
} as const satisfies WriteApiOperation;

export const deletePlayerMessageWrite = {
  ...transport,
  id: "deletePlayerMessage",
  path: `${path}/{messageId}`,
  method: "DELETE",
  parameters: messageParameters,
  request: z.strictObject({ version }),
  summary: "Delete the signed-in author's player message",
  description:
    "Checks current publication, accepted registration, message ownership and the supplied version. Repeated deletion returns not found. Replaying the original post after deletion returns a conflict.",
  successStatus: 200,
  successDescription: "The message was deleted. The JSON response is null.",
  response: z.null(),
  errors: { ...errors, 409: "The message has changed since the supplied version." },
} as const satisfies WriteApiOperation;

export type PostPlayerMessageInput = z.input<
  typeof postPlayerMessageWrite.request
>;
export type EditPlayerMessageInput = z.input<
  typeof editPlayerMessageWrite.request
>;
export type DeletePlayerMessageInput = z.input<
  typeof deletePlayerMessageWrite.request
>;
