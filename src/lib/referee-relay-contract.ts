import { z } from "zod";
import { desktopMetadataSchema } from "./desktop-wire";
import { relaySchema } from "./referee-irc-model";
import type { WriteApiOperation } from "./write-api-contract";

const relayReceipt = z.object({
  connectionId: z.uuid(),
  sequence: z.number().int().nonnegative(),
  command: z
    .object({
      id: z.uuid(),
      text: z.string().max(300),
      target: z.string().regex(/^(?:#mp_[1-9]\d*|BanchoBot)$/),
    })
    .nullable(),
  receiptReasons: z.boolean().optional(),
  bpSync: z.boolean().optional(),
});

export type RefereeRelayReceipt = z.infer<typeof relayReceipt>;

export const refereeRelayWrite = {
  id: "relayRefereeIrc",
  path: "/api/referee/v1/fixtures/{fixtureId}/relay",
  method: "POST",
  access: "desktop",
  scope: "referee:relay",
  contractHeader: "X-OCLR-Referee-Contract",
  parameters: { fixtureId: z.uuid() },
  maxBodyBytes: 524288,
  request: relaySchema,
  summary: "Bind, synchronize, or disconnect an assigned fixture's IRC relay",
  description:
    "Requires a current fixture assignment and an operational edition. Bind checks the authorized osu! identity and may advertise receiptReasons and bpSync. Sync ignores a repeated or older sequence and cannot dispatch the same queued command again. Omit optional capabilities for older clients. Command is null when there is nothing to dispatch. IRC projection and evidence lines reject control and format characters and Unicode line separators.",
  successStatus: 200,
  successDescription:
    "Versioned relay receipt. The request ID matches X-Request-Id.",
  response: z.object({ data: relayReceipt, meta: desktopMetadataSchema }),
  errors: {
    401: "Invalid, expired, or revoked desktop access.",
    403: "Scope, referee grant, assignment, connection, or IRC identity rejected.",
    404: "The fixture or operational edition is unavailable.",
    409: "The room binding or operational state has changed.",
    503: "Service unavailable.",
  },
  consumers: [],
  externalConsumers: ["OCLR-dev/OCLR-ref-tools:src/main/oclr-relay.ts"],
} as const satisfies WriteApiOperation;
