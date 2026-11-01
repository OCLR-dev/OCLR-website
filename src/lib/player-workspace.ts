import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { db, readOnlyData } from "@/db";
import {
  captains,
  editionState,
  memberships,
  teams,
  users,
  registrations,
  mappools,
  mappoolEntries,
  playerPracticeRecords,
  playerSeasonAvailability,
  playerWorkspaceEvents,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertBusinessWrite } from "./auth/staff";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";
import { HttpError } from "./http";
import { publicMappools } from "./mappools";
import {
  practiceCommandSchema,
  practiceContextValue,
  timetableCommandSchema,
  normalizeSeasonAvailability,
} from "./player-workspace-model";
import { z } from "zod";

type Reader = Pick<ReturnType<typeof db>, "select">;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertDirectPlayerWorkspace() {
  if (remoteMode() || inReadChannel())
    throw new HttpError(
      403,
      "Player workspace requires a direct browser session.",
    );
}
export async function playerWorkspaceEligible(
  actor: User,
  slug: string,
  reader: Reader = db(),
) {
  const [registration] = await reader
    .select({ status: registrations.status })
    .from(registrations)
    .where(
      and(
        eq(registrations.userId, actor.osuId),
        eq(registrations.editionSlug, slug),
      ),
    );
  const [appointment] = await reader
    .select({ userId: captains.userId })
    .from(captains)
    .where(
      and(eq(captains.userId, actor.osuId), eq(captains.editionSlug, slug)),
    );
  return {
    eligible: registration?.status === "accepted" || Boolean(appointment),
    appointed: Boolean(appointment),
  };
}
async function context(reader: Reader, actor: User, slug: string) {
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state?.configuration?.published || state.configuration.archive)
    throw new HttpError(
      404,
      "Player workspace is unavailable for this tournament.",
    );
  const eligibility = await playerWorkspaceEligible(actor, slug, reader);
  if (!eligibility.eligible)
    throw new HttpError(
      403,
      "Player workspace requires an accepted registration or captain appointment.",
    );
  const [own] = await reader
    .select({ team: teams })
    .from(memberships)
    .innerJoin(
      teams,
      and(
        eq(teams.id, memberships.teamId),
        eq(teams.editionSlug, memberships.editionSlug),
      ),
    )
    .where(
      and(
        eq(memberships.editionSlug, slug),
        eq(memberships.userId, actor.osuId),
        isNull(memberships.leftAt),
        isNull(teams.archivedAt),
      ),
    );
  const roster = own
    ? await reader
        .select({ osuId: users.osuId, username: users.username })
        .from(memberships)
        .innerJoin(users, eq(users.osuId, memberships.userId))
        .leftJoin(
          registrations,
          and(
            eq(registrations.userId, memberships.userId),
            eq(registrations.editionSlug, slug),
            eq(registrations.status, "accepted"),
          ),
        )
        .leftJoin(
          captains,
          and(
            eq(captains.userId, memberships.userId),
            eq(captains.editionSlug, slug),
          ),
        )
        .where(
          and(
            eq(memberships.teamId, own.team.id),
            eq(memberships.editionSlug, slug),
            isNull(memberships.leftAt),
            or(isNotNull(registrations.id), isNotNull(captains.userId)),
          ),
        )
        .orderBy(users.username, users.osuId)
    : [{ osuId: actor.osuId, username: actor.username }];
  return {
    state,
    team: own?.team ?? null,
    roster,
    captain: Boolean(
      own && eligibility.appointed && own.team.captainId === actor.osuId,
    ),
  };
}
async function readOnly(
  actor: User,
  c: Awaited<ReturnType<typeof context>>,
  reader: Reader,
) {
  if (c.state.lockedAt || c.state.configuration?.status === "completed")
    return true;
  try {
    await assertBusinessWrite(actor, c.state.slug, reader);
    return false;
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) return true;
    throw error;
  }
}
function checkWritable(c: Awaited<ReturnType<typeof context>>) {
  if (c.state.lockedAt || c.state.configuration?.status === "completed")
    throw new HttpError(409, "This player workspace is read-only.");
}

export async function playerPracticeWorkspace(
  actor: User,
  slug: string,
  poolId?: string,
) {
  assertDirectPlayerWorkspace();
  if (poolId && !z.uuid().safeParse(poolId).success)
    throw new HttpError(400, "Choose a valid published mappool.");
  return readOnlyData(async () => {
    const c = await context(db(), actor, slug);
    const pools = await publicMappools(slug);
    const selected = poolId
      ? pools.find((p) => p.id === poolId)
      : pools.toSorted(
          (a, b) =>
            (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
        )[0];
    if (poolId && !selected)
      throw new HttpError(404, "Published mappool not found.");
    const ownerIds = [
      ...new Set([actor.osuId, ...c.roster.map((p) => p.osuId)]),
    ];
    const records = selected?.entries.length
      ? await db()
          .select()
          .from(playerPracticeRecords)
          .where(
            and(
              eq(playerPracticeRecords.editionSlug, slug),
              inArray(playerPracticeRecords.userId, ownerIds),
              inArray(
                playerPracticeRecords.entryId,
                selected.entries.map((e) => e.id),
              ),
            ),
          )
      : [];
    return {
      actorId: actor.osuId,
      team: c.team ? { id: c.team.id, name: c.team.name } : null,
      participants: c.roster,
      readOnly: await readOnly(actor, c, db()),
      pools: pools.map((p) => ({
        id: p.id,
        name: p.name,
        roundName: p.roundName,
        stage: p.stage,
      })),
      pool: selected
        ? {
            id: selected.id,
            name: selected.name,
            fmMode: selected.fmMode,
            fmRestrictions: selected.fmRestrictions,
            roundName: selected.roundName,
            stage: selected.stage,
            entries: selected.entries.map((e) => {
              const key = digest(
                practiceContextValue({
                  ...e,
                  fmMode: selected.fmMode,
                  fmRestrictions: selected.fmRestrictions,
                }),
              );
              return {
                ...e,
                context: key,
                ownVersion:
                  records.find(
                    (r) => r.entryId === e.id && r.userId === actor.osuId,
                  )?.version ?? 0,
                records: records
                  .filter((r) => r.entryId === e.id && !r.deletedAt)
                  .map((r) => ({
                    userId: r.userId,
                    score: r.score,
                    rating: r.rating,
                    comment: r.comment,
                    version: r.version,
                    updatedAt: r.updatedAt.toISOString(),
                    stale: r.contextKey !== key,
                  })),
              };
            }),
          }
        : null,
    };
  });
}

export async function playerTimetableWorkspace(
  actor: User,
  slug: string,
  ownerId = actor.osuId,
) {
  assertDirectPlayerWorkspace();
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0)
    throw new HttpError(400, "Choose a valid player.");
  return readOnlyData(async () => {
    const c = await context(db(), actor, slug);
    const visible = c.captain
      ? c.roster
      : [{ osuId: actor.osuId, username: actor.username }];
    const owner = visible.find((p) => p.osuId === ownerId);
    if (!owner)
      throw new HttpError(
        403,
        "You may only view your own timetable or your current team's timetable as captain.",
      );
    const [row] = await db()
      .select()
      .from(playerSeasonAvailability)
      .where(
        and(
          eq(playerSeasonAvailability.editionSlug, slug),
          eq(playerSeasonAvailability.userId, ownerId),
        ),
      );
    return {
      actorId: actor.osuId,
      owner,
      players: visible,
      timeZone: c.state.configuration!.timeZone,
      canEdit: ownerId === actor.osuId && !(await readOnly(actor, c, db())),
      intervals: row?.intervals ?? [],
      version: row?.version ?? 0,
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
  });
}

export async function playerPracticeCommand(
  actor: User,
  slug: string,
  input: unknown,
) {
  assertDirectPlayerWorkspace();
  const parsed = practiceCommandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Enter a valid practice score, rating and comment.",
    );
  const p = parsed.data,
    hash = digest(p);
  return db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    const c = await context(tx, actor, slug);
    checkWritable(c);
    await assertBusinessWrite(actor, slug, tx);
    const [entry] = await tx
      .select({ entry: mappoolEntries, pool: mappools })
      .from(mappoolEntries)
      .innerJoin(mappools, eq(mappools.id, mappoolEntries.poolId))
      .where(
        and(
          eq(mappoolEntries.id, p.entryId),
          eq(mappools.editionSlug, slug),
          isNotNull(mappools.publishedAt),
        ),
      );
    if (!entry) throw new HttpError(404, "Published mappool entry not found.");
    const [receipt] = await tx
      .select()
      .from(playerWorkspaceEvents)
      .where(
        and(
          eq(playerWorkspaceEvents.editionSlug, slug),
          eq(playerWorkspaceEvents.actorId, actor.osuId),
          eq(playerWorkspaceEvents.requestKey, p.requestKey),
        ),
      );
    if (receipt) {
      if (receipt.payloadHash !== hash)
        throw new HttpError(
          409,
          "This request key was already used for another change.",
        );
      return { saved: true, version: receipt.after.version };
    }
    const key = digest(
      practiceContextValue({
        ...entry.entry,
        fmMode: entry.pool.fmMode,
        fmRestrictions: entry.pool.fmRestrictions,
      }),
    );
    if (key !== p.expectedContext)
      throw new HttpError(
        409,
        "The mappool entry changed. Reload before saving practice.",
      );
    const [before] = await tx
      .select()
      .from(playerPracticeRecords)
      .where(
        and(
          eq(playerPracticeRecords.editionSlug, slug),
          eq(playerPracticeRecords.userId, actor.osuId),
          eq(playerPracticeRecords.entryId, p.entryId),
        ),
      )
      .for("update");
    if ((before?.version ?? 0) !== p.expectedVersion)
      throw new HttpError(
        409,
        "Practice records changed. Reload before saving.",
      );
    if (p.action === "delete_practice" && (!before || before.deletedAt))
      throw new HttpError(404, "Practice record not found.");
    const values = {
      ...(p.action === "save_practice"
        ? { score: p.score, rating: p.rating, comment: p.comment }
        : { score: null, rating: null, comment: "" }),
      accuracy: null,
      deletedAt: p.action === "delete_practice" ? new Date() : null,
      beatmapId: entry.entry.beatmapId,
      contextKey: key,
      version: p.expectedVersion + 1,
      updatedAt: new Date(),
    };
    const [after] = before
      ? await tx
          .update(playerPracticeRecords)
          .set(values)
          .where(eq(playerPracticeRecords.id, before.id))
          .returning()
      : await tx
          .insert(playerPracticeRecords)
          .values({
            ...values,
            editionSlug: slug,
            userId: actor.osuId,
            entryId: p.entryId,
          })
          .returning();
    await tx.insert(playerWorkspaceEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      resource: "practice",
      entityId: after.id,
      requestKey: p.requestKey,
      payloadHash: hash,
      before: before ?? null,
      after,
    });
    return { saved: true, version: after.version };
  });
}

export async function playerTimetableCommand(
  actor: User,
  slug: string,
  input: unknown,
) {
  assertDirectPlayerWorkspace();
  const parsed = timetableCommandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Choose valid availability time slots.");
  const p = {
      ...parsed.data,
      intervals: normalizeSeasonAvailability(parsed.data.intervals),
    },
    hash = digest(p);
  return db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    const c = await context(tx, actor, slug);
    checkWritable(c);
    await assertBusinessWrite(actor, slug, tx);
    const [receipt] = await tx
      .select()
      .from(playerWorkspaceEvents)
      .where(
        and(
          eq(playerWorkspaceEvents.editionSlug, slug),
          eq(playerWorkspaceEvents.actorId, actor.osuId),
          eq(playerWorkspaceEvents.requestKey, p.requestKey),
        ),
      );
    if (receipt) {
      if (receipt.payloadHash !== hash)
        throw new HttpError(
          409,
          "This request key was already used for another change.",
        );
      return { saved: true, version: receipt.after.version };
    }
    const [before] = await tx
      .select()
      .from(playerSeasonAvailability)
      .where(
        and(
          eq(playerSeasonAvailability.editionSlug, slug),
          eq(playerSeasonAvailability.userId, actor.osuId),
        ),
      )
      .for("update");
    if ((before?.version ?? 0) !== p.expectedVersion)
      throw new HttpError(409, "Availability changed. Reload before saving.");
    const values = {
      intervals: p.intervals,
      version: p.expectedVersion + 1,
      updatedAt: new Date(),
    };
    const [after] = before
      ? await tx
          .update(playerSeasonAvailability)
          .set(values)
          .where(
            and(
              eq(playerSeasonAvailability.editionSlug, slug),
              eq(playerSeasonAvailability.userId, actor.osuId),
            ),
          )
          .returning()
      : await tx
          .insert(playerSeasonAvailability)
          .values({ ...values, editionSlug: slug, userId: actor.osuId })
          .returning();
    await tx.insert(playerWorkspaceEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      resource: "availability",
      entityId: String(actor.osuId),
      requestKey: p.requestKey,
      payloadHash: hash,
      before: before ?? null,
      after,
    });
    return { saved: true, version: after.version };
  });
}

export type PracticeWorkspace = Awaited<
  ReturnType<typeof playerPracticeWorkspace>
>;
export type TimetableWorkspace = Awaited<
  ReturnType<typeof playerTimetableWorkspace>
>;
