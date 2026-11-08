import { z } from "zod";
import {
  practiceCommandSchema,
  timetableCommandSchema,
} from "./player-workspace-model";

export const workspaceWriteReceipt = z.object({
  saved: z.literal(true),
  version: z.number().int().positive(),
});

export const workspaceWriteError = z.object({ error: z.string() });

const transport = {
  method: "POST",
  maxBodyBytes: 32768,
  response: workspaceWriteReceipt,
  error: workspaceWriteError,
} as const;

export const practiceWrite = {
  ...transport,
  id: "writePlayerPractice",
  path: "/api/tournaments/{edition}/player/practice",
  request: practiceCommandSchema,
  summary: "Save or delete the signed-in player's own practice record",
  description:
    "The mappool entry must be published. expectedContext must match the current chart and mod policy. Deletion returns the same versioned receipt as a save.",
  notFound: "The workspace, published mappool entry, or record is unavailable.",
  consumers: ["src/components/player-practice.tsx"],
} as const;

export const availabilityWrite = {
  ...transport,
  id: "writePlayerAvailability",
  path: "/api/tournaments/{edition}/player/availability",
  request: timetableCommandSchema,
  summary: "Save the signed-in player's own season availability",
  description:
    "Each interval must end after it starts. Overlaps between different availability states are rejected. An omitted status means available.",
  notFound: "The workspace is unavailable.",
  consumers: ["src/components/player-timetable.tsx"],
} as const;

export type WorkspaceWriteReceipt = z.infer<typeof workspaceWriteReceipt>;

export type WorkspaceWriteInput<
  Operation extends typeof practiceWrite | typeof availabilityWrite,
> = WithoutRequestKey<z.input<Operation["request"]>>;

type WithoutRequestKey<Input> = Input extends { requestKey: string }
  ? Omit<Input, "requestKey">
  : never;
