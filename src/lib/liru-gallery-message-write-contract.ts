import { z } from "zod";
import { liruGalleryMessageSchema } from "./player-message-model";
import {
  deletePlayerMessageWrite,
  editPlayerMessageWrite,
  postPlayerMessageWrite,
} from "./player-message-write-contract";
import type { WriteApiOperation } from "./write-api-contract";

const path = "/api/wiki/liru-gallery/messages";
const messageParameters = {
  messageId: editPlayerMessageWrite.parameters.messageId,
};

export const postLiruGalleryMessageWrite = {
  ...postPlayerMessageWrite,
  id: "postLiruGalleryMessage",
  path,
  parameters: {},
  request: postPlayerMessageWrite.request.extend({
    parentId: z
      .uuid()
      .optional()
      .describe("ID of the top-level message to reply to."),
  }),
  response: liruGalleryMessageSchema,
  summary: "Post a signed message or reply on the Liru gallery",
  description:
    "Requires a browser session. Replaying the same request, parent and text returns the saved message. Top-level posts and replies share the posting limit per author, including recently deleted messages.",
  errors: {
    ...postPlayerMessageWrite.errors,
    400: "Invalid message request.",
    404: "The top-level message to reply to was not found.",
  },
} as const satisfies WriteApiOperation;

export const editLiruGalleryMessageWrite = {
  ...editPlayerMessageWrite,
  id: "editLiruGalleryMessage",
  path: `${path}/{messageId}`,
  parameters: messageParameters,
  response: liruGalleryMessageSchema,
  summary: "Edit the signed-in author's Liru gallery message",
  description:
    "Checks message ownership and version. An edit retains the original creation time and returns the new version.",
  errors: {
    ...editPlayerMessageWrite.errors,
    400: "Invalid message ID or request fields.",
    404: "The owned gallery message was not found.",
  },
} as const satisfies WriteApiOperation;

export const deleteLiruGalleryMessageWrite = {
  ...deletePlayerMessageWrite,
  id: "deleteLiruGalleryMessage",
  path: `${path}/{messageId}`,
  parameters: messageParameters,
  summary: "Delete the signed-in author's Liru gallery message",
  description:
    "Checks message ownership and version. Replies to a deleted top-level message become top-level messages. Replaying the original post after deletion returns a conflict.",
  errors: {
    ...deletePlayerMessageWrite.errors,
    400: "Invalid message ID or request fields.",
    404: "The owned gallery message was not found.",
  },
} as const satisfies WriteApiOperation;

export type PostLiruGalleryMessageInput = z.input<
  typeof postLiruGalleryMessageWrite.request
>;
