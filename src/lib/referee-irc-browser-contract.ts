import { z } from "zod";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { ircMessageSchema, ircQueueSchema } from "./referee-irc-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const connection = z
  .object({
    id: z.uuid(),
    roomId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    ircUsername: z.string(),
    status: z.enum(["connected", "disconnected", "revoked"]),
    lastSeenAt: z.iso.datetime().nullable(),
    connected: z.boolean(),
    bpSync: z.boolean(),
  })
  .nullable();

const commands = z
  .array(
    z.object({
      id: z.uuid(),
      requestKey: z.uuid(),
      text: z.string(),
      target: z.string(),
      status: z.enum([
        "queued",
        "sending",
        "sent",
        "notified",
        "confirmed",
        "failed",
        "unknown",
        "record_failed",
      ]),
      recordError: z.string().nullable(),
      automation: z
        .object({
          eventId: z.uuid(),
          selectionId: z.uuid(),
          step: z.enum(["notice", "map", "mods"]),
          predecessorId: z.uuid().nullable(),
          withdrawn: z.boolean(),
        })
        .nullable(),
      createdAt: z.iso.datetime(),
    }),
  )
  .max(50);
const messages = z.array(ircMessageSchema);

export type RefereeIrcBrowserView = {
  connection: z.output<typeof connection>;
  messages: z.output<typeof messages>;
  commands: z.output<typeof commands>;
  workspace: ExplicitReadData<"refereeWorkspace">;
};

export const changeRefereeIrcBrowserWrite = {
  id: "changeRefereeIrcBrowser",
  path: "/api/admin/tournaments/{edition}/matches/{fixtureId}/referee/irc",
  method: "POST",
  access: "browser",
  parameters: { fixtureId: z.uuid() },
  maxBodyBytes: defaultJsonBodyLimit,
  request: ircQueueSchema,
  summary:
    "Queue or synchronize a referee IRC command, or disconnect the relay",
  description:
    "Requires a browser session, record_results and current fixture access. Queue accepts one allowed command for the current relay and deduplicates matching request keys. Sync_selection queues a plan for an eligible saved BP event owned by the caller and requires a connected relay with bpSync. Disconnect revokes the current connection. The response reports queue state and confirmation, including cases where a command was sent but could not be recorded in the referee workspace.",
  successStatus: 200,
  successDescription:
    "Current relay connection, IRC messages, command receipts and referee workspace.",
  response: {
    properties: {
      connection,
      messages,
      commands,
      workspace: { readResource: "refereeWorkspace" },
    },
  },
  errors: {
    400: "Invalid request, unsupported IRC command, or command text that does not match the selected map.",
    401: "An active browser session is required.",
    403: "Origin, authentication channel, fixture assignment, or edition capability rejected.",
    404: "The fixture or related operational record was not found.",
    409: "The connection, pending command, BP event, workspace revision, or request key conflicts with current state.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
  consumers: [
    "src/components/referee-irc.tsx",
    "src/components/referee-panel.tsx",
  ],
} as const satisfies WriteApiOperation;
