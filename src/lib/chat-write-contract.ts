import { z } from "zod";
import { locales } from "../i18n/config";
import { chatEditionPattern } from "./chat-edition";
import type { WriteApiOperation } from "./write-api-contract";

export const chatWrite = {
  id: "askLiru",
  path: "/api/chat",
  method: "POST",
  access: "browser",
  maxBodyBytes: 32768,
  request: z.strictObject({
    edition: z.string().regex(chatEditionPattern),
    locale: z.enum(locales),
    questions: z.array(z.string().trim().min(1).max(1500)).min(1).max(4),
  }),
  summary: "Ask Liru about a published tournament",
  description:
    "Requires an active website session and the same origin. Questions are ordered oldest to newest. The server retrieves published evidence for the selected edition, applies an eight-request per minute account limit and contacts the configured model when evidence exists.",
  successStatus: 200,
  successDescription:
    "AI SDK UI message stream with text and server-selected source URLs. After streaming begins, provider failures are reported in the stream.",
  responseMediaType: "text/event-stream",
  response: z.string(),
  consumers: ["src/components/liru-chat.tsx"],
  errors: {
    400: "Invalid edition, locale or question history.",
    401: "Sign in to continue.",
    403: "A local website session and same origin are required.",
    404: "Tournament unavailable.",
    429: "Request budget exceeded.",
    503: "Chat or site origin is not configured.",
    500: "Request could not be completed.",
  },
  errorHeaders: { 429: { "Retry-After": z.literal("60") } },
} as const satisfies WriteApiOperation;
