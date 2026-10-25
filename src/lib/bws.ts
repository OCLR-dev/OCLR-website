import { frontendResource, assertRemoteSubject } from "./frontend-resource";
import { remoteMode } from "./data-source";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  badgeReviews,
  editionEvents,
  editionState,
  registrations,
  userProfileCache,
} from "@/db/schema";
import {
  assertReadCapability,
  assertCapability,
  isDeveloper,
  staffAccess,
  hasCapability,
} from "./auth/staff";
import type { User } from "./auth/sessions";
import { badgeClassifications, summarizeBws } from "./bws-model";
import { cachedOsuUserProfile, getOsuUserProfile } from "./osu-profiles";
import { type ProfileSnapshot } from "./osu-profile-model";
import { HttpError } from "./http";
const choices = z.array(z.enum(badgeClassifications)).max(100);
export function badgeFingerprint(snapshot: ProfileSnapshot) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        snapshot.profile.badges?.map((b) => [
          b.description,
          b.awardedAt,
          b.url,
        ]) ?? null,
      ),
    )
    .digest("hex");
}
const key = (slug: string, userId: number, mode: string) =>
  and(
    eq(badgeReviews.editionSlug, slug),
    eq(badgeReviews.userId, userId),
    eq(badgeReviews.mode, mode as ProfileSnapshot["profile"]["ruleset"]),
  );
/** Only aggregate calculation inputs leave this service in public responses. */
export async function profileBws(snapshot: ProfileSnapshot, edition?: string) {
  if (snapshot.profile.ruleset !== "osu") return null;
  const [review] = edition
    ? await db()
        .select()
        .from(badgeReviews)
        .where(key(edition, snapshot.profile.osuId, snapshot.profile.ruleset))
    : [];
  const parsed = choices.safeParse(review?.classifications);
  return summarizeBws(
    snapshot,
    review?.fingerprint === badgeFingerprint(snapshot) && parsed.success
      ? parsed.data
      : null,
    review?.fingerprint === badgeFingerprint(snapshot)
      ? review.reviewedAt.toISOString()
      : null,
  );
}
async function applicant(
  actor: User,
  slug: string,
  id: string,
  reader: Pick<ReturnType<typeof db>, "select"> = db(),
  readOnly = false,
) {
  const assert = readOnly ? assertReadCapability : assertCapability;
  await assert(actor, "manage_registrations", slug, reader);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Application not found.");
  const [row] = await reader
    .select()
    .from(registrations)
    .where(and(eq(registrations.id, id), eq(registrations.editionSlug, slug)));
  if (!row) throw new HttpError(404, "Application not found.");
  return row;
}
async function databaseStaffBws(
  actor: User,
  slug: string,
  id: string,
  mode: unknown,
) {
  const registration = await applicant(actor, slug, id, db(), true);
  const parsed = z.literal("osu").safeParse(mode ?? "osu");
  if (!parsed.success) throw new HttpError(400, "Select a ruleset for BWS.");
  const developer =
    isDeveloper(await staffAccess(actor)) &&
    !(await hasCapability(actor, "manage_registrations", slug));
  const snapshot = await (developer ? cachedOsuUserProfile : getOsuUserProfile)(
    registration.userId,
    parsed.data,
  );
  if (!snapshot) throw new HttpError(404, "No saved profile is available.");
  await applicant(actor, slug, id, db(), true);
  const [review] = await db()
    .select()
    .from(badgeReviews)
    .where(key(slug, registration.userId, parsed.data));
  const fingerprint = badgeFingerprint(snapshot);
  return {
    snapshot,
    fingerprint,
    version: review?.version ?? 0,
    classifications:
      review?.fingerprint === fingerprint
        ? review.classifications.map((c) =>
            c === "osu" || c === "unknown" ? c : "other",
          )
        : (snapshot.profile.badges ?? []).map(() => "unknown" as const),
    summary: (await profileBws(snapshot, slug))!,
  };
}
export async function staffBws(
  actor: User,
  slug: string,
  id: string,
  mode: unknown,
): Promise<Awaited<ReturnType<typeof databaseStaffBws>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseStaffBws>>>(
      "staffBws",
      { slug, id, mode },
    );
  }
  return databaseStaffBws(actor, slug, id, mode);
}

const command = z
  .object({
    mode: z.literal("osu"),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    expectedVersion: z.number().int().nonnegative(),
    classifications: z.array(z.enum(["unknown", "other", "osu"])).max(100),
    confirmed: z.literal(true),
  })
  .strict();
export async function reviewBws(
  actor: User,
  slug: string,
  id: string,
  input: unknown,
) {
  const registration = await applicant(actor, slug, id);
  const parsed = command.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Review each badge before saving.");
  const c = parsed.data;
  const snapshot = await getOsuUserProfile(registration.userId, c.mode);
  const badges = snapshot.profile.badges;
  if (
    snapshot.stale ||
    snapshot.notice ||
    !badges ||
    c.fingerprint !== badgeFingerprint(snapshot) ||
    c.classifications.length !== badges.length
  )
    throw new HttpError(
      409,
      "The badge inventory is missing or changed. Reload it before reviewing.",
    );
  await db().transaction(async (tx) => {
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await applicant(actor, slug, id, tx);
    const [cached] = await tx
      .select()
      .from(userProfileCache)
      .where(
        and(
          eq(userProfileCache.osuId, registration.userId),
          eq(userProfileCache.mode, c.mode),
        ),
      )
      .for("update");
    if (
      !cached?.profile ||
      cached.errorStatus ||
      badgeFingerprint({
        profile: cached.profile,
        stale: false,
        notice: null,
      }) !== c.fingerprint
    )
      throw new HttpError(
        409,
        "The badge inventory is missing or changed. Reload it before reviewing.",
      );
    const [before] = await tx
      .select()
      .from(badgeReviews)
      .where(key(slug, registration.userId, c.mode));
    if ((before?.version ?? 0) !== c.expectedVersion)
      throw new HttpError(
        409,
        "Badge review changed. Reload before continuing.",
      );
    const values = {
      editionSlug: slug,
      userId: registration.userId,
      mode: c.mode,
      fingerprint: c.fingerprint,
      classifications: c.classifications,
      version: (before?.version ?? 0) + 1,
      reviewedBy: actor.osuId,
      reviewedAt: new Date(),
    };
    const [after] = await tx
      .insert(badgeReviews)
      .values(values)
      .onConflictDoUpdate({
        target: [
          badgeReviews.editionSlug,
          badgeReviews.userId,
          badgeReviews.mode,
        ],
        set: values,
      })
      .returning();
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "registration_badge_review",
      detail: {
        entity: {
          type: "badge_review",
          id: `${registration.userId}:${c.mode}`,
        },
        before: before ?? null,
        after,
        badges,
      },
    });
  });
  return staffBws(actor, slug, id, c.mode);
}
