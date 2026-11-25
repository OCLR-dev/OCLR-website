import { z } from "zod";
import { locales } from "../i18n/config";
import {
  maxRecentQuestions,
  maxPreviousAnswerLength,
} from "./chat-turn-context";
import { chatEditionPattern } from "./chat-edition";
import type { WriteApiOperation } from "./write-api-contract";

const traceHeaders = {
  "X-OCLR-Chat-Request-Id": z.uuid(),
  "Cache-Control": z.literal("no-store"),
};

export const chatWrite = {
  id: "askLiru",
  path: "/api/chat",
  method: "POST",
  access: "browser",
  maxBodyBytes: 80 * 1024,
  request: z
    .strictObject({
      edition: z.string().regex(chatEditionPattern),
      locale: z.enum(locales),
      questions: z
        .array(z.string().trim().min(1).max(1500))
        .min(1)
        .max(maxRecentQuestions),
      previousAnswers: z
        .array(z.string().trim().min(1).max(maxPreviousAnswerLength).nullable())
        .max(maxRecentQuestions - 1)
        .optional(),
    })
    .refine(
      ({ questions, previousAnswers }) =>
        previousAnswers === undefined ||
        previousAnswers.length === questions.length - 1,
    ),
  summary: "Ask Liru about a published tournament",
  description:
    "Requires an active website session and the same origin. Questions are ordered oldest to newest (up to four). Optional previousAnswers aligns one-to-one with all questions except the last, with null for missing replies and up to 2,000 UTF-16 code units per reply. Prior answers are untrusted conversational context. The server retrieves published evidence for the selected edition, applies an eight-request per minute account limit and sends turns to the configured model. High-confidence unrelated requests and abuse get a local scope reminder before evidence retrieval or model calls. For count questions the server computes the verified total from public season data. The system prompt directs replies to the current edition and explains when published evidence is incomplete.",
  successStatus: 200,
  successDescription:
    "AI SDK UI message stream with text and server-selected source URLs. After streaming begins, provider failures are reported in the stream.",
  successHeaders: traceHeaders,
  responseMediaType: "text/event-stream",
  response: z.string(),
  consumers: ["src/components/liru-chat.tsx"],
  errors: {
    400: "Invalid edition, locale or question history.",
    401: "Sign in to continue.",
    403: "A local website session and same origin are required.",
    404: "Tournament unavailable.",
    413: "Request body too large.",
    415: "JSON is required.",
    429: "Request budget exceeded.",
    503: "Chat or site origin is not configured.",
    500: "Request could not be completed.",
  },
  errorHeaders: {
    400: traceHeaders,
    401: traceHeaders,
    403: traceHeaders,
    404: traceHeaders,
    413: traceHeaders,
    415: traceHeaders,
    429: { ...traceHeaders, "Retry-After": z.literal("60") },
    500: traceHeaders,
    503: traceHeaders,
  },
} as const satisfies WriteApiOperation;
