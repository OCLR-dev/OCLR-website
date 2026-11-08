import { z } from "zod";
import {
  practiceCommandSchema,
  timetableCommandSchema,
} from "./player-workspace-model";
import {
  browserWriteError,
  type WriteApiOperation,
} from "./write-api-contract";

export const workspaceWriteReceipt = z.object({
  saved: z.literal(true),
  version: z.number().int().positive(),
});

const workspacePolicy =
  "Requires an accepted registration or captain appointment in a published, non-archived edition with a writable player workspace. Send the last observed version as expectedVersion, or 0 for the first write. Reuse requestKey when retrying the same payload after an uncertain outcome.";
const errors = {
  401: "An authenticated browser session is required.",
  403: "Origin, authentication channel, or eligibility rejected.",
  409: "Read-only workspace, stale data, or a reused request key with a different payload.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const transport = {
  access: "browser",
  method: "POST",
  maxBodyBytes: 32768,
  successStatus: 200,
  successDescription: "The saved version, including for a successful retry.",
  response: workspaceWriteReceipt,
  error: browserWriteError,
} as const;

export const practiceWrite = {
  ...transport,
  id: "writePlayerPractice",
  path: "/api/tournaments/{edition}/player/practice",
  request: practiceCommandSchema,
  summary: "Save or delete the signed-in player's own practice record",
  description: `The mappool entry must be published. expectedContext must match the current chart and mod policy. Deletion returns the same versioned receipt as a save. ${workspacePolicy}`,
  errors: {
    ...errors,
    404: "The workspace, published mappool entry, or record is unavailable.",
  },
  consumers: ["src/components/player-practice.tsx"],
} as const satisfies WriteApiOperation;

export const availabilityWrite = {
  ...transport,
  id: "writePlayerAvailability",
  path: "/api/tournaments/{edition}/player/availability",
  request: timetableCommandSchema,
  summary: "Save the signed-in player's own season availability",
  description: `Each interval must end after it starts. Overlaps between different availability states are rejected. An omitted status means available. ${workspacePolicy}`,
  errors: { ...errors, 404: "The workspace is unavailable." },
  consumers: ["src/components/player-timetable.tsx"],
} as const satisfies WriteApiOperation;

export type WorkspaceWriteReceipt = z.infer<typeof workspaceWriteReceipt>;

export type WorkspaceWriteInput<
  Operation extends typeof practiceWrite | typeof availabilityWrite,
> = WithoutRequestKey<z.input<Operation["request"]>>;

type WithoutRequestKey<Input> = Input extends { requestKey: string }
  ? Omit<Input, "requestKey">
  : never;
