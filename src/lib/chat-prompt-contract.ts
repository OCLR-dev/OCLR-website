import { z } from "zod";
import type { WriteApiOperation } from "./write-api-contract";

export const chatPromptLimit = 3000;
export const defaultChatOutputTokens = 2048;
export const maximumChatOutputTokens = 16384;
const outputTokens = z.number().int().min(1).max(maximumChatOutputTokens);
const revision = z.number().int().min(0).max(2147483647);

export const updateChatPromptWrite = {
  id: "updateChatPrompt",
  path: "/api/admin/settings/chat",
  method: "PATCH",
  access: "browser",
  maxBodyBytes: 20000,
  request: z.strictObject({
    prompt: z
      .string()
      .max(chatPromptLimit)
      .trim()
      .refine((prompt) => !prompt.includes("\0")),
    maxOutputTokens: outputTokens.optional(),
    expectedRevision: revision.max(2147483646),
  }),
  summary: "Update the sitewide Liru chat settings",
  description:
    "Requires a local browser session and global configure_tournament permission. A blank prompt restores the built-in behavior. maxOutputTokens sets the limit for subsequent replies. Omitting it preserves the saved limit and the original prompt-only response shape. A stale revision is rejected and unchanged saves do not create audit events.",
  successStatus: 200,
  successDescription:
    "The saved prompt and revision, plus the output limit when requested.",
  successHeaders: { "Cache-Control": z.literal("no-store") },
  response: z.strictObject({
    prompt: z.string().max(chatPromptLimit),
    maxOutputTokens: outputTokens.optional(),
    revision,
  }),
  errors: {
    400: "Invalid prompt, output token limit or revision.",
    401: "A signed-in website session is required.",
    403: "Origin, authentication channel or required permission rejected.",
    409: "The current prompt revision differs from the supplied revision.",
    413: "The request body exceeds the allowed size.",
    415: "JSON is required.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
  consumers: ["src/components/site-chat-prompt-form.tsx"],
} as const satisfies WriteApiOperation;
