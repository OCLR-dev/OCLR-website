import { db } from "@/db";
import {
  discordResultDeliveries,
  discordResultSettings,
  editionEvents,
  editionState,
  fixtures,
} from "@/db/schema";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { defaultLocale } from "../i18n/config";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  hasCapability,
  assertUserWriteChannel,
} from "./auth/staff";
import { remoteMode } from "./data-source";
import {
  discordWebhookUrl,
  updateDiscordResultSettingsWrite,
  type DiscordResultSettings,
} from "./discord-result-contract";
import {
  discordResultRuntime,
  sealDiscordWebhook,
} from "./discord-result-secret";
import { HttpError } from "./http-error";
import { inReadChannel } from "./read-channel";

type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
const initial = {
  revision: 0,
  destinationId: null,
  enabled: false,
  locale: defaultLocale,
};
const metadata = {
  revision: discordResultSettings.revision,
  destinationId: discordResultSettings.destinationId,
  enabled: discordResultSettings.enabled,
  locale: discordResultSettings.locale,
};

async function settingsSummary(
  slug: string,
  reader: Pick<Transaction, "select"> = db(),
): Promise<DiscordResultSettings> {
  const [saved] = await reader
    .select(metadata)
    .from(discordResultSettings)
    .where(eq(discordResultSettings.editionSlug, slug));
  const recent = await reader
    .select({
      fixtureId: discordResultDeliveries.fixtureId,
      fixtureLabel: fixtures.label,
      status: discordResultDeliveries.status,
      failure: discordResultDeliveries.failure,
    })
    .from(discordResultDeliveries)
    .innerJoin(fixtures, eq(fixtures.id, discordResultDeliveries.fixtureId))
    .where(eq(discordResultDeliveries.editionSlug, slug))
    .orderBy(
      sql`(${discordResultDeliveries.status} = 'attention') DESC`,
      desc(discordResultDeliveries.updatedAt),
    )
    .limit(8);
  const [attention] = await reader
    .select({ count: count() })
    .from(discordResultDeliveries)
    .where(
      and(
        eq(discordResultDeliveries.editionSlug, slug),
        eq(discordResultDeliveries.status, "attention"),
      ),
    );
  const { revision, destinationId, enabled, locale } = saved ?? initial;
  return {
    available: Boolean(discordResultRuntime()),
    revision,
    configured: Boolean(destinationId),
    enabled,
    locale,
    recent,
    attentionCount: attention.count,
  };
}

export async function discordResultSettingsForAdmin(actor: User, slug: string) {
  if (
    remoteMode() ||
    inReadChannel() ||
    !(await hasCapability(actor, "configure_tournament", slug))
  )
    return null;
  return settingsSummary(slug);
}

export async function saveDiscordResultSettings(
  actor: User,
  slug: string,
  input: unknown,
) {
  assertUserWriteChannel();
  await assertCapability(actor, "configure_tournament", slug);
  const parsed = updateDiscordResultSettingsWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Enter valid Discord result notification settings.",
    );
  const { webhookUrl, remove, enabled, locale, expectedRevision } = parsed.data;
  const url = webhookUrl ? discordWebhookUrl(webhookUrl) : null;
  if (webhookUrl && !url)
    throw new HttpError(400, "Enter a Discord HTTPS webhook URL.");
  const runtime = discordResultRuntime();
  if ((url || enabled) && !runtime)
    throw new HttpError(
      503,
      "Discord result notification storage is unavailable.",
    );

  return db().transaction(async (tx) => {
    const [edition] = await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "configure_tournament", slug, tx);
    if (!edition) throw new HttpError(404, "Tournament not found.");
    const [saved] = await tx
      .select(metadata)
      .from(discordResultSettings)
      .where(eq(discordResultSettings.editionSlug, slug));
    const before = saved ?? initial;
    if (before.revision !== expectedRevision)
      throw new HttpError(
        409,
        "Discord notification settings changed. Refresh before saving.",
      );

    const destinationId = url
      ? randomUUID()
      : remove
        ? null
        : before.destinationId;
    if (enabled && !destinationId)
      throw new HttpError(
        400,
        "Save a Discord webhook URL before enabling notifications.",
      );
    if (
      destinationId === before.destinationId &&
      enabled === before.enabled &&
      locale === before.locale
    )
      return settingsSummary(slug, tx);

    const meta = {
      destinationId,
      revision: before.revision + 1,
      enabled,
      locale,
    };
    const credential =
      url && runtime
        ? {
            sealedUrl: sealDiscordWebhook(
              url,
              runtime.key,
              `${slug}/${destinationId}`,
            ),
          }
        : remove
          ? { sealedUrl: null }
          : {};
    if (saved) {
      await tx
        .update(discordResultSettings)
        .set({ ...meta, ...credential })
        .where(eq(discordResultSettings.editionSlug, slug));
    } else {
      await tx
        .insert(discordResultSettings)
        .values({ editionSlug: slug, ...meta, ...credential });
    }

    if (
      before.destinationId &&
      (!enabled || before.destinationId !== destinationId)
    ) {
      await tx
        .update(discordResultDeliveries)
        .set({
          status: sql`CASE WHEN ${discordResultDeliveries.messageId} IS NULL THEN 'cancelled' ELSE 'attention' END`,
          failure: "destination_changed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(discordResultDeliveries.editionSlug, slug),
            eq(discordResultDeliveries.destinationId, before.destinationId),
            inArray(discordResultDeliveries.status, ["pending"]),
          ),
        );
    }

    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "discord_result_settings",
      detail: {
        before: {
          configured: Boolean(before.destinationId),
          enabled: before.enabled,
          locale: before.locale,
        },
        after: { configured: Boolean(destinationId), enabled, locale },
        destinationChanged: before.destinationId !== destinationId,
      },
    });
    return settingsSummary(slug, tx);
  });
}

export async function queueDiscordResult(
  tx: Transaction,
  slug: string,
  fixtureId: string,
  resultVersion: number,
  publishedRevision: number | null,
) {
  const delivery = discordResultDeliveries;
  const needsReview = sql`${delivery.status} = 'attention' AND ${delivery.failure} IS DISTINCT FROM 'destination_changed'`;
  const waitingForDiscord = sql`${delivery.status} = 'pending' AND ${delivery.failure} = 'rate_limited'`;
  const nextAttemptAt = sql`CASE WHEN ${waitingForDiscord} THEN ${delivery.nextAttemptAt} ELSE now() END`;
  const [setting] = await tx
    .select({
      id: discordResultSettings.destinationId,
      enabled: discordResultSettings.enabled,
    })
    .from(discordResultSettings)
    .where(eq(discordResultSettings.editionSlug, slug));
  if (!setting) return;
  if (setting.id && setting.enabled && publishedRevision !== null) {
    await tx
      .insert(delivery)
      .values({
        editionSlug: slug,
        fixtureId,
        destinationId: setting.id,
        resultVersion,
        publishedRevision,
      })
      .onConflictDoUpdate({
        target: [delivery.fixtureId, delivery.destinationId],
        set: {
          resultVersion,
          publishedRevision,
          updatedAt: new Date(),
          nextAttemptAt,
          attempts: 0,
          status: sql`CASE WHEN ${delivery.status} = 'sending' OR (${needsReview}) THEN ${delivery.status} ELSE 'pending' END`,
          failure: sql`CASE WHEN (${needsReview}) OR (${waitingForDiscord}) THEN ${delivery.failure} ELSE NULL END`,
        },
        setWhere: sql`${delivery.resultVersion} < ${resultVersion}`,
      });
  }

  // Withdraw a previously published message and flag older destinations for review.
  await tx
    .update(delivery)
    .set({
      resultVersion,
      publishedRevision: null,
      updatedAt: new Date(),
      nextAttemptAt,
      attempts: 0,
      status: sql`CASE
      WHEN ${delivery.status} = 'sending' THEN 'sending'
      WHEN ${needsReview} THEN 'attention'
      WHEN ${delivery.messageId} IS NULL THEN 'cancelled'
      WHEN ${delivery.destinationId} = ${setting.id} AND ${setting.enabled} THEN 'pending'
      ELSE 'attention'
    END`,
      failure: sql`CASE
      WHEN (${needsReview}) OR (${waitingForDiscord}) THEN ${delivery.failure}
      WHEN ${delivery.messageId} IS NOT NULL AND (${delivery.destinationId} IS DISTINCT FROM ${setting.id} OR NOT ${setting.enabled})
        THEN 'destination_changed'
      ELSE NULL
    END`,
    })
    .where(
      and(
        eq(delivery.editionSlug, slug),
        eq(delivery.fixtureId, fixtureId),
        sql`${delivery.resultVersion} < ${resultVersion}`,
        publishedRevision === null
          ? undefined
          : sql`${delivery.destinationId} IS DISTINCT FROM ${setting.id}`,
      ),
    );
}
