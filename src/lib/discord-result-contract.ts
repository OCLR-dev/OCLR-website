import { z } from "zod";
import { locales } from "../i18n/config";
import type { WriteApiOperation } from "./write-api-contract";

export const discordDeliveryStatuses = [
  "pending",
  "sending",
  "sent",
  "attention",
  "cancelled",
] as const;
export const discordDeliveryFailures = [
  "rate_limited",
  "unavailable",
  "uncertain",
  "rejected",
  "missing_message",
  "destination_changed",
  "credential",
] as const;
const revision = z.number().int().min(0).max(2147483647);

export function discordWebhookUrl(input: string) {
  const match =
    /^https:\/\/discord\.com\/api\/(?:v10\/)?webhooks\/([1-9]\d{16,19})\/([a-zA-Z0-9_-]{1,256})\/?$/.exec(
      input.trim(),
    );
  return match
    ? `https://discord.com/api/v10/webhooks/${match[1]}/${match[2]}`
    : null;
}

const settings = z.strictObject({
  available: z.boolean(),
  revision,
  configured: z.boolean(),
  enabled: z.boolean(),
  locale: z.enum(locales),
  attentionCount: z.number().int().nonnegative(),
  recent: z
    .array(
      z.strictObject({
        fixtureId: z.uuid(),
        fixtureLabel: z.string(),
        status: z.enum(discordDeliveryStatuses),
        failure: z.enum(discordDeliveryFailures).nullable(),
      }),
    )
    .max(8),
});
export type DiscordResultSettings = z.infer<typeof settings>;

export const updateDiscordResultSettingsWrite = {
  id: "updateDiscordResultSettings",
  path: "/api/admin/tournaments/{edition}/discord-results",
  method: "PATCH",
  access: "browser",
  maxBodyBytes: 2048,
  request: z
    .strictObject({
      expectedRevision: revision.max(2147483646),
      enabled: z.boolean(),
      locale: z.enum(locales),
      webhookUrl: z.string().trim().max(512).optional(),
      remove: z.boolean().optional(),
    })
    .refine((input) => !input.remove || (!input.webhookUrl && !input.enabled)),
  summary: "Update an edition's Discord result notification settings",
  description:
    "Requires an edition settings grant and the current settings revision. A blank URL retains the destination. A populated URL replaces it. An explicit remove clears it and disables notifications. URLs are accepted only over the site’s same-origin browser session and stored encrypted.",
  successStatus: 200,
  successDescription: "Settings metadata and recent delivery status.",
  successHeaders: { "Cache-Control": z.literal("no-store") },
  response: settings,
  errors: {
    400: "Invalid settings or Discord webhook URL.",
    401: "A signed-in website session is required.",
    403: "Origin, authentication channel or edition settings permission rejected.",
    404: "The edition does not exist.",
    409: "The settings revision changed.",
    413: "The request body exceeds the allowed size.",
    415: "JSON is required.",
    500: "Unexpected failure.",
    503: "Webhook storage or site origin is unavailable.",
  },
  consumers: ["src/components/discord-result-settings.tsx"],
} as const satisfies WriteApiOperation;
