import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { z } from "zod";
import { readLocale } from "../i18n/config";
import type { Fetch } from "./api";
import {
  parseCommand,
  problem,
  runCommand,
  type Command,
  type CommandOutcome,
} from "./commands";
import { botTranslator } from "./messages";

const signatureWindowMs = 5 * 60_000;
const perMinute = 6;
const concurrentLimit = 12;
const servicePerMinute = 90;

export const snowflake = z.string().regex(/^[1-9]\d{16,19}$/);
export const publicKeyHex = z.string().regex(/^[a-f0-9]{64}$/i);
const commandInteraction = z.object({
  id: snowflake,
  type: z.literal(InteractionType.APPLICATION_COMMAND),
  application_id: snowflake,
  guild_id: snowflake,
  token: z.string().min(1).max(1024),
  locale: z.string().max(20).optional(),
  member: z.object({ user: z.object({ id: snowflake }) }),
  data: z.unknown(),
});
const ping = z.object({
  type: z.literal(InteractionType.PING),
  application_id: snowflake.optional(),
});
const ephemeral = { flags: InteractionResponseFlags.EPHEMERAL };
const deferred = {
  status: 200,
  body: {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: ephemeral,
  },
};

type Settings = {
  applicationId: string;
  guildId: string;
  publicKey: string;
  origin: string;
};
type SignedBody = {
  body: Buffer;
  signature?: string;
  timestamp?: string;
};
type Ack = {
  status: number;
  body?: object;
  finish?: () => Promise<void>;
};
type Log = (entry: {
  command: Command["name"];
  outcome: CommandOutcome;
  durationMs: number;
  delivered: boolean;
}) => void;

export function interactionHandler(
  settings: Settings,
  request: Fetch = fetch,
  log: Log = (entry) => console.info(JSON.stringify(entry)),
  clock: () => number = Date.now,
) {
  let window = -1;
  let started = 0;
  let active = 0;
  const users = new Map<string, number>();
  const seen = new Map<string, number>();

  return async ({ body, signature, timestamp }: SignedBody): Promise<Ack> => {
    const now = clock();
    const signedAt =
      timestamp && /^\d{10}$/.test(timestamp) ? Number(timestamp) * 1000 : NaN;
    if (
      !signature ||
      !/^[a-f0-9]{128}$/i.test(signature) ||
      !timestamp ||
      !Number.isFinite(signedAt) ||
      Math.abs(signedAt - now) > signatureWindowMs ||
      !(await verifyKey(body, signature, timestamp, settings.publicKey))
    )
      return { status: 401 };

    let data: unknown;
    try {
      data = JSON.parse(body.toString("utf8"));
    } catch {
      return { status: 400 };
    }
    const probe = ping.safeParse(data);
    if (probe.success) {
      return !probe.data.application_id ||
        probe.data.application_id === settings.applicationId
        ? { status: 200, body: { type: InteractionResponseType.PONG } }
        : { status: 403 };
    }

    const parsed = commandInteraction.safeParse(data);
    if (!parsed.success) return { status: 400 };
    const interaction = parsed.data;
    if (
      interaction.application_id !== settings.applicationId ||
      interaction.guild_id !== settings.guildId
    )
      return { status: 403 };

    const locale = readLocale(undefined, interaction.locale);
    const immediate = (outcome: "limited" | "invalid") => ({
      status: 200,
      body: {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          ...ephemeral,
          ...problem(botTranslator(locale), outcome).message,
        },
      },
    });
    const command = parseCommand(interaction.data);
    if (!command) return immediate("invalid");

    for (const [id, until] of seen) if (until < now) seen.delete(id);
    if (seen.has(interaction.id)) return deferred;
    const minute = Math.floor(now / 60_000);
    if (window !== minute) {
      window = minute;
      started = 0;
      users.clear();
    }
    const user = interaction.member.user.id;
    const count = users.get(user) ?? 0;
    if (
      count >= perMinute ||
      active >= concurrentLimit ||
      started >= servicePerMinute
    )
      return immediate("limited");

    seen.set(interaction.id, signedAt + signatureWindowMs);
    users.set(user, count + 1);
    started++;
    active++;
    return {
      ...deferred,
      async finish() {
        let delivered = false;
        let outcome: CommandOutcome = "unavailable";
        try {
          const result = await runCommand(command, {
            origin: settings.origin,
            locale,
            request,
            now,
          });
          outcome = result.outcome;
          const url = `https://discord.com/api/v10/webhooks/${settings.applicationId}/${encodeURIComponent(interaction.token)}/messages/@original`;
          const response = await request(url, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(result.message),
            redirect: "error",
            signal: AbortSignal.timeout(5_000),
          });
          delivered = response.ok;
          await response.body?.cancel();
        } catch {
          // Request errors may contain the interaction token in the URL.
        } finally {
          active--;
          log({
            command: command.name,
            outcome,
            delivered,
            durationMs: clock() - now,
          });
        }
      },
    };
  };
}
