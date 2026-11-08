import { z } from "zod";
import { defaultJsonBodyLimit } from "./request-body-limits";
import { availabilitySchema } from "./schedule-model";
import type { WriteApiOperation } from "./write-api-contract";

const browserPost = {
  access: "browser",
  method: "POST",
  maxBodyBytes: defaultJsonBodyLimit,
} as const;
const commonErrors = {
  401: "An active browser session is required.",
  404: "The edition or accessible fixture was not found.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const fixtureRevision = {
  fixtureId: z.uuid(),
  expectedFixtureVersion: z.number().int().nonnegative(),
  requestKey: z.uuid(),
};

export const scheduleRequestWrite = {
  ...browserPost,
  id: "changeScheduleRequest",
  path: "/api/tournaments/{edition}/schedule/requests",
  request: z.discriminatedUnion("action", [
    z.strictObject({
      ...fixtureRevision,
      action: z.literal("availability"),
      expectedVersion: z.number().int().nonnegative(),
      intervals: availabilitySchema,
    }),
    z.strictObject({
      ...fixtureRevision,
      action: z.literal("propose"),
      requestId: z.uuid().nullable(),
      expectedVersion: z.number().int().nonnegative(),
      proposedAt: z.iso.datetime({ offset: true }),
      confirmed: z.literal(true),
    }),
    z.strictObject({
      ...fixtureRevision,
      requestId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      action: z.enum(["accept", "withdraw", "reject", "approve"]),
      confirmed: z.literal(true),
      decisionNote: z.string().trim().max(1000).optional(),
    }),
  ]),
  summary: "Save availability or negotiate a fixture schedule request",
  description:
    "Current players can replace their own availability with up to 40 intervals whose end follows their start. Participating captains can negotiate a new time. Only independent staff with manage_fixtures can approve and update the official time. Fixture and request or availability versions are checked. Repeating the same request key and payload for the same edition and actor returns the original success shape without a second write.",
  successStatus: 200,
  successDescription: "The command was saved or replayed.",
  response: z.object({ saved: z.literal(true) }),
  errors: {
    ...commonErrors,
    400: "Invalid command, interval, proposed time, or missing staff rejection note.",
    403: "Origin, authentication channel, or fixture participation or capability rejected.",
    409: "Stale revision, ineligible fixture, conflicting request state, or reuse of a request key with a different payload.",
  },
  consumers: ["src/components/schedule-manager.tsx"],
} as const satisfies WriteApiOperation;

const userId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const streamingTaskWrite = {
  ...browserPost,
  id: "changeStreamingTask",
  path: "/api/admin/tournaments/{edition}/streaming/{fixtureId}",
  parameters: { fixtureId: z.uuid() },
  request: z.strictObject({
    action: z.enum(["select", "assign", "cancel", "reconfirm"]),
    task: z.literal("commentary").optional(),
    userId: userId.optional(),
    userIds: z
      .array(userId)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length)
      .meta({ uniqueItems: true })
      .optional(),
    requestKey: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedFixtureVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  }),
  summary: "Change a streaming or commentary assignment",
  description:
    "Omitting task selects the streaming slot. Staff assignment requires a target user or, for commentary only, a list of distinct target users. Commentary cancellation and reconfirmation can target an individual. The server checks role eligibility, ownership, and task and fixture revisions. A matching request key and payload returns replayed=true without writing another event.",
  successStatus: 200,
  successDescription:
    "The assignment command was saved, with its replay indicator.",
  response: z.object({ saved: z.literal(true), replayed: z.boolean() }),
  errors: {
    ...commonErrors,
    400: "Invalid fixture ID, command, or target selection.",
    403: "Origin, authentication channel, edition capability, task ownership, or target eligibility rejected.",
    409: "Stale revision, unavailable task or fixture, conflicting assignment, or reuse of a request key with a different payload.",
  },
  consumers: ["src/components/streaming-manager.tsx"],
} as const satisfies WriteApiOperation;

export type ScheduleRequestReceipt = z.output<
  typeof scheduleRequestWrite.response
>;
export type StreamingTaskReceipt = z.output<typeof streamingTaskWrite.response>;
