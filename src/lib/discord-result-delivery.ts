import { db } from "@/db";
import {
  discordResultDeliveries as deliveries,
  discordResultSettings as settings,
} from "@/db/schema";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { fetch as discordFetch } from "undici";
import { z } from "zod";
import { getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { discordWebhookUrl } from "./discord-result-contract";
import { discordResultMessage } from "./discord-result-message";
import {
  discordResultRuntime,
  openDiscordWebhook,
} from "./discord-result-secret";
import { publicCompetition } from "./public-competition";

type Delivery = typeof deliveries.$inferSelect;
type Job = Delivery & { leaseId: string };
type Failure = NonNullable<Delivery["failure"]>;
type Outcome =
  | { status: "sent"; messageId: string }
  | { status: "attention" | "cancelled"; failure: Failure }
  | { status: "retry"; failure: Failure; delay: number }
  | { status: "superseded" };

type WebhookResponse = {
  ok: boolean;
  status: number;
  headers: Pick<Headers, "get">;
  body: { cancel(): Promise<void> } | null;
  json(): Promise<unknown>;
};
type WebhookFetch = (
  url: string,
  init: {
    method: "PATCH" | "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    redirect: "error";
  },
) => Promise<WebhookResponse>;

const messageReceipt = z.object({ id: z.string().regex(/^[1-9]\d{16,19}$/) });
const rateLimitReceipt = z.object({ retry_after: z.number().nonnegative() });
function retryMilliseconds(seconds: number) {
  const delay = Math.ceil(seconds * 1000);
  return Number.isSafeInteger(delay) && Date.now() + delay <= 8.64e15
    ? Math.max(1_000, delay)
    : 30_000;
}

const claimKey = (job: Job) =>
  and(
    eq(deliveries.fixtureId, job.fixtureId),
    eq(deliveries.destinationId, job.destinationId),
    eq(deliveries.leaseId, job.leaseId),
  );

async function claimDiscordResult(now: Date): Promise<Job | null> {
  return db().transaction(async (tx) => {
    await tx
      .update(deliveries)
      .set({
        status: "attention",
        failure: "uncertain",
        leaseId: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveries.status, "sending"),
          lte(deliveries.leaseExpiresAt, now),
        ),
      );
    const [row] = await tx
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.status, "pending"),
          lte(deliveries.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(deliveries.nextAttemptAt), asc(deliveries.fixtureId))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const leaseId = randomUUID();
    await tx
      .update(deliveries)
      .set({
        status: "sending",
        leaseId,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
        attempts: row.attempts + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveries.fixtureId, row.fixtureId),
          eq(deliveries.destinationId, row.destinationId),
        ),
      );
    return { ...row, leaseId, attempts: row.attempts + 1 };
  });
}

async function retryDelay(response: WebhookResponse) {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? NaN : Number(header);
  if (seconds >= 0 && Number.isFinite(seconds)) {
    await response.body?.cancel().catch(() => undefined);
    return retryMilliseconds(seconds);
  }
  const at = header ? Date.parse(header) : NaN;
  if (Number.isFinite(at)) {
    await response.body?.cancel().catch(() => undefined);
    return retryMilliseconds((at - Date.now()) / 1000);
  }
  const parsed = rateLimitReceipt.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? retryMilliseconds(parsed.data.retry_after) : 30_000;
}

async function deliver(
  url: string,
  payload: ReturnType<typeof discordResultMessage>,
  messageId: string | null,
  request: WebhookFetch,
): Promise<Outcome> {
  let response: WebhookResponse;
  try {
    response = await request(
      messageId ? `${url}/messages/${messageId}` : `${url}?wait=true`,
      {
        method: messageId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(7_000),
        redirect: "error",
      },
    );
  } catch (error) {
    const code =
      error instanceof Error
        ? (error.cause as { code?: string } | undefined)?.code
        : null;
    // A connection that was never established cannot have created a message.
    return code &&
      [
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
        "UND_ERR_CONNECT_TIMEOUT",
      ].includes(code)
      ? { status: "retry", failure: "unavailable", delay: 30_000 }
      : { status: "attention", failure: "uncertain" };
  }
  if (response.ok) {
    const parsed = messageReceipt.safeParse(
      await response.json().catch(() => null),
    );
    return parsed.success && (!messageId || parsed.data.id === messageId)
      ? { status: "sent", messageId: parsed.data.id }
      : { status: "attention", failure: "uncertain" };
  }
  if (response.status === 429)
    return {
      status: "retry",
      failure: "rate_limited",
      delay: await retryDelay(response),
    };
  await response.body?.cancel().catch(() => undefined);
  if (response.status >= 500)
    return messageId
      ? { status: "retry", failure: "unavailable", delay: 30_000 }
      : { status: "attention", failure: "uncertain" };
  return {
    status: "attention",
    failure:
      response.status === 404 && messageId ? "missing_message" : "rejected",
  };
}

type Runtime = NonNullable<ReturnType<typeof discordResultRuntime>>;

async function sendDiscordResult(
  job: Job,
  runtime: Runtime,
  request: WebhookFetch,
): Promise<Outcome> {
  const edition =
    job.publishedRevision === null
      ? null
      : await getPublicEdition(job.editionSlug);
  const competition = edition ? await publicCompetition(job.editionSlug) : null;
  const fixture = competition?.fixtures.find(
    (item) => item.id === job.fixtureId,
  );
  const publicScore =
    fixture?.result?.revision === job.publishedRevision &&
    fixture?.home.team &&
    fixture.away.team
      ? fixture
      : undefined;

  // Revalidate the claim and destination immediately before calling Discord.
  const [current] = await db()
    .select({
      version: deliveries.resultVersion,
      destinationId: settings.destinationId,
      enabled: settings.enabled,
      locale: settings.locale,
      sealedUrl: settings.sealedUrl,
    })
    .from(deliveries)
    .leftJoin(settings, eq(settings.editionSlug, deliveries.editionSlug))
    .where(and(claimKey(job), gt(deliveries.leaseExpiresAt, new Date())));
  if (!current) return { status: "attention", failure: "uncertain" };
  if (current.version !== job.resultVersion) return { status: "superseded" };
  if (current.destinationId !== job.destinationId || !current.enabled)
    return {
      status: job.messageId ? "attention" : "cancelled",
      failure: "destination_changed",
    };
  if (!publicScore && !job.messageId) return { status: "superseded" };
  let url: string | null = null;
  try {
    if (current.sealedUrl)
      url = discordWebhookUrl(
        openDiscordWebhook(
          current.sealedUrl,
          runtime.key,
          `${job.editionSlug}/${job.destinationId}`,
        ),
      );
  } catch {
    // Cipher errors and HTTP errors never reach the status surface.
  }
  if (!url || !current.locale)
    return { status: "attention", failure: "credential" };
  const payload = discordResultMessage({
    origin: runtime.origin,
    locale: current.locale,
    slug: job.editionSlug,
    fixtureId: job.fixtureId,
    editionName: edition?.name,
    fixture: publicScore,
    correcting: Boolean(job.messageId),
  });
  return deliver(url, payload, job.messageId, request);
}

async function completeDiscordResult(job: Job, outcome: Outcome) {
  await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(deliveries)
      .where(claimKey(job))
      .for("update");
    if (!current) return;
    const changed = current.resultVersion !== job.resultVersion;
    const [destination] = await tx
      .select({ id: settings.destinationId, enabled: settings.enabled })
      .from(settings)
      .where(eq(settings.editionSlug, current.editionSlug));
    const disabled =
      destination?.id !== job.destinationId || !destination.enabled;
    const now = new Date();
    const messageId =
      outcome.status === "sent" ? outcome.messageId : current.messageId;
    let status: Delivery["status"] = "cancelled";
    let failure: Delivery["failure"] = null;
    let delay = 0;
    if (outcome.status === "attention") {
      status = "attention";
      failure = outcome.failure;
    } else if (disabled) {
      if (messageId) status = "attention";
      failure = "destination_changed";
    } else if (outcome.status === "retry" && (changed || job.attempts < 8)) {
      status = "pending";
      failure = outcome.failure;
      delay =
        outcome.failure === "rate_limited"
          ? outcome.delay
          : Math.max(outcome.delay, 1000 * 2 ** job.attempts);
    } else if (changed) {
      status = "pending";
    } else if (outcome.status === "sent") {
      status = "sent";
    } else if (outcome.status === "retry") {
      status = "attention";
      failure = outcome.failure;
    } else if (outcome.status === "cancelled") {
      failure = outcome.failure;
    }
    await tx
      .update(deliveries)
      .set({
        messageId,
        status,
        failure,
        leaseId: null,
        leaseExpiresAt: null,
        updatedAt: now,
        nextAttemptAt: new Date(now.getTime() + delay),
      })
      .where(claimKey(job));
  });
}

// Direct Undici avoids Next's fetch tracing, which records complete URLs.
export async function drainDiscordResults(
  request: WebhookFetch = discordFetch,
) {
  const runtime = discordResultRuntime();
  if (!runtime || remoteMode() || !process.env.DATABASE_URL) return;
  for (let index = 0; index < 8; index++) {
    const job = await claimDiscordResult(new Date());
    if (!job) return;
    let outcome: Outcome;
    try {
      outcome = await sendDiscordResult(job, runtime, request);
    } catch {
      outcome = { status: "retry", failure: "unavailable", delay: 30_000 };
    }
    await completeDiscordResult(job, outcome);
  }
}

export function startDiscordResultDelivery() {
  if (!discordResultRuntime() || remoteMode() || !process.env.DATABASE_URL)
    return;
  const server = globalThis as typeof globalThis & {
    oclrDiscordResultTimer?: NodeJS.Timeout;
  };
  if (server.oclrDiscordResultTimer) return;
  let draining = false;
  server.oclrDiscordResultTimer = setInterval(async () => {
    if (draining) return;
    draining = true;
    try {
      await drainDiscordResults();
    } catch {
      console.error(
        "Discord result delivery worker could not complete a database operation.",
      );
    } finally {
      draining = false;
    }
  }, 10_000).unref();
}
