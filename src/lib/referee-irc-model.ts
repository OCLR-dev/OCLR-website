import { z } from "zod";
const line = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s));
export const ircMessageSchema = z
  .object({
    id: line(128),
    sender: line(100),
    text: line(1000),
    at: z.iso.datetime(),
  })
  .strict();
export type IrcMessage = z.infer<typeof ircMessageSchema>;
export const ircSelectionSchema = z
  .object({
    entryId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type IrcSelection = z.infer<typeof ircSelectionSchema>;
export const ircQueueSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("queue"),
      requestKey: z.uuid(),
      text: line(300),
      selection: ircSelectionSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
]);
export const relaySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("bind"),
      roomId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      ircUsername: line(50),
    })
    .strict(),
  z
    .object({ action: z.literal("disconnect"), connectionId: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal("sync"),
      connectionId: z.uuid(),
      sequence: z.number().int().positive().max(2147483647),
      projection: z
        .object({
          status: z.enum(["connected", "disconnected"]),
          messages: z.array(ircMessageSchema).max(100),
        })
        .strict(),
      receipts: z
        .array(
          z
            .object({
              commandId: z.uuid(),
              status: z.enum(["sent", "confirmed", "failed", "unknown"]),
              evidence: z
                .object({
                  sender: line(100),
                  target: line(100),
                  text: line(1000),
                })
                .strict()
                .optional(),
            })
            .strict(),
        )
        .max(10),
    })
    .strict(),
]);
export const normalizedIrcUsername = (name: string) =>
  name.trim().replace(/\s+/g, "_").toLowerCase();
/** One line, existing room only. Credentials, arbitrary IRC verbs and room creation are not remotely executable. */
export function allowedIrcCommand(text: string) {
  return /^(?:!mp map [1-9]\d{0,9}(?: [0-3])?|!mp mods (?:None|(?:NF|EZ|HD|HR|DT|HT|NC|FL|FI|SD|PF|SO|MR|[1-9]K|Freemod)(?: (?:NF|EZ|HD|HR|DT|HT|NC|FL|FI|SD|PF|SO|MR|[1-9]K|Freemod))*)|!mp set [0-3] [0-3] (?:[1-9]|1[0-6])|!mp (?:invite|addref) [A-Za-z0-9_\[\]-]{1,50}|!mp (?:timer|start) [1-9]\d{0,3}|!mp (?:abort|aborttimer))$/.test(
    text,
  );
}
export function confirmsMap(
  text: string,
  target: string,
  evidence?: { sender: string; target: string; text: string },
) {
  const map = /^!mp map ([1-9]\d*)(?: [0-3])?$/.exec(text)?.[1];
  if (
    !map ||
    evidence?.sender !== "BanchoBot" ||
    evidence.target.toLowerCase() !== target.toLowerCase()
  )
    return false;
  if (!/^(?:Beatmap changed to:?|Changed beatmap to) /i.test(evidence.text))
    return false;
  const linked =
    /https:\/\/osu\.ppy\.sh\/(?:b|beatmaps)\/([1-9]\d*)(?=[\s\])]|$)/.exec(
      evidence.text,
    )?.[1];
  return linked === map;
}
export function safeIrcMessages(messages: IrcMessage[]) {
  return messages.filter(
    (m) =>
      !/(?:password|access_token|refresh_token|code_verifier|oclr_desk_(?:at|rt)_|^PASS\s|^AUTHENTICATE\s)/i.test(
        m.text,
      ),
  );
}

/** Only known semantic replies; socket write success is a distinct state. */
export function confirmsIrcCommand(
  text: string,
  target: string,
  evidence?: { sender: string; target: string; text: string },
) {
  if (confirmsMap(text, target, evidence)) return true;
  if (
    evidence?.sender !== "BanchoBot" ||
    evidence.target.toLowerCase() !== target.toLowerCase()
  )
    return false;
  if (text === "!mp abort")
    return /^Aborted the match\.?$/i.test(evidence.text);
  if (text === "!mp aborttimer")
    return /^(?:Countdown aborted|Aborted the match start timer)\.?$/i.test(
      evidence.text,
    );
  return false;
}
