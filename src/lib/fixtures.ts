import { db } from "@/db";
import {
  captains,
  editionEvents,
  editionState,
  fixtureReferees,
  fixtureStreams,
  fixtures,
  mappoolEntries,
  mappools,
  matchResults,
  memberships,
  resultAuditEvents,
  resultRevisions,
  staffRoles,
  teams,
  tournamentRounds,
  tournamentStages,
  users,
} from "@/db/schema";
import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  bootstrapAdminIds,
  canRead,
  hasCapability,
  isDeveloper,
  permits,
  staffAccess,
} from "./auth/staff";
import {
  groupConfigurationInputSchema,
  scoringRulesSchema,
  standingsRulesSchema,
  validTimeZone,
} from "./competition-model";
import { getEdition } from "./content";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
const confirmation = {
  confirmed: z.literal(true),
};
const fixtureFields = {
  label: z.string().trim().min(1).max(100),
  roundId: z.uuid(),
  homeTeamId: z.uuid().nullable(),
  awayTeamId: z.uuid().nullable(),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  timeZone: z.string().trim().max(80).refine(validTimeZone),
  status: z.enum(["scheduled", "in_progress", "cancelled"]),
  mappoolId: z.uuid().nullable(),
  position: z.number().int().min(1).max(999),
  homeSourceId: z.uuid().nullable(),
  homeSourceOutcome: z.enum(["winner", "loser"]).nullable(),
  awaySourceId: z.uuid().nullable(),
  awaySourceOutcome: z.enum(["winner", "loser"]).nullable(),
};
const refereeIdsSchema = z
  .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length);
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...confirmation,
      action: z.literal("delete"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      expectedAssignmentRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("stage_groups"),
      stageId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      configuration: groupConfigurationInputSchema.nullable(),
      published: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...fixtureFields,
      refereeIds: refereeIdsSchema.default([]),
      action: z.literal("create"),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...fixtureFields,
      action: z.literal("edit"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("publish"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      published: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("round_rules"),
      roundId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      scoringRules: scoringRulesSchema.partial({ version: true }).nullable(),
      standingsRules: standingsRulesSchema
        .partial({ version: true })
        .nullable(),
    })
    .strict(),
]);
type Reader = Pick<ReturnType<typeof db>, "select">;
// Keep stable policy identities on unchanged saves; changed policies get a new
// release without asking an organizer to invent a technical identifier.
function policyRelease<T extends { version: string }>(
  input: (Omit<T, "version"> & { version?: string }) | null,
  previous: T | null,
): T | null {
  if (!input) return null;
  const { version, ...fields } = input;
  const { version: previousVersion, ...previousFields } = previous ?? {};
  return {
    ...fields,
    version:
      version ??
      (isDeepStrictEqual(fields, previousFields)
        ? previousVersion
        : undefined) ??
      `release-${randomUUID()}`,
  } as T;
}
export async function officialTeams(reader: Reader, slug: string) {
  const rows = await reader
    .select({ id: teams.id, name: teams.name, captainId: teams.captainId })
    .from(teams)
    .innerJoin(
      captains,
      and(
        eq(captains.editionSlug, teams.editionSlug),
        eq(captains.userId, teams.captainId),
        eq(captains.published, true),
      ),
    )
    .where(
      and(
        eq(teams.editionSlug, slug),
        eq(teams.identityPublished, true),
        eq(teams.rosterPublished, true),
        isNotNull(teams.finalizedAt),
        isNull(teams.archivedAt),
      ),
    )
    .orderBy(teams.name);
  const members = rows.length
    ? await reader
        .select({
          teamId: memberships.teamId,
          osuId: users.osuId,
          username: users.username,
        })
        .from(memberships)
        .innerJoin(users, eq(users.osuId, memberships.userId))
        .where(
          and(
            inArray(
              memberships.teamId,
              rows.map((t) => t.id),
            ),
            isNull(memberships.leftAt),
          ),
        )
    : [];
  return rows.map((t) => ({
    ...t,
    members: members
      .filter((m) => m.teamId === t.id)
      .map(({ osuId, username }) => ({ osuId, username })),
  }));
}
async function configuredEdition(slug: string) {
  const edition = await getEdition(slug);
  if (!edition) throw new HttpError(404, "Edition not found.");
  return edition;
}
async function eligibleReferees(reader: Reader, slug: string) {
  // Existing policy permits Referee and Admin substitutes, including bootstrapped administrators.
  return reader
    .select({ osuId: users.osuId, username: users.username })
    .from(users)
    .leftJoin(
      staffRoles,
      and(
        eq(staffRoles.userId, users.osuId),
        isNull(staffRoles.revokedAt),
        inArray(staffRoles.role, ["referee", "admin"]),
        or(isNull(staffRoles.editionSlug), eq(staffRoles.editionSlug, slug)),
      ),
    )
    .where(
      or(isNotNull(staffRoles.id), inArray(users.osuId, bootstrapAdminIds())),
    )
    .groupBy(users.osuId, users.username)
    .orderBy(users.username);
}
const assignmentInput = z
  .object({
    expectedAssignmentRevision: z.number().int().nonnegative(),
    refereeIds: refereeIdsSchema,
  })
  .strict();
export async function assignFixtureReferees(
  actor: User,
  slug: string,
  id: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_fixtures", slug);
  await configuredEdition(slug);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Fixture not found.");
  const parsed = assignmentInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose a valid list of referees and the current assignment revision.",
    );
  await db().transaction(async (tx) => {
    // Share the role-management lock so a concurrent revocation cannot pass a stale eligibility check.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await assertCapability(actor, "manage_fixtures", slug, tx);
    await assertOperationalEdition(slug, tx);
    const [fixture] = await tx
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.id, id), eq(fixtures.editionSlug, slug)))
      .for("update");
    if (!fixture) throw new HttpError(404, "Fixture not found.");
    if (fixture.assignmentRevision !== parsed.data.expectedAssignmentRevision)
      throw new HttpError(
        409,
        "Referee assignments changed. Refresh and review the current assignments.",
      );
    const eligible = await eligibleReferees(tx, slug);
    if (
      parsed.data.refereeIds.some(
        (userId) => !eligible.some((u) => u.osuId === userId),
      )
    )
      throw new HttpError(
        400,
        "Every referee must have an active Referee or Admin role for this edition.",
      );
    const before = await tx
      .select()
      .from(fixtureReferees)
      .where(eq(fixtureReferees.fixtureId, id));
    const previousIds = before.map((r) => r.userId).sort((a, b) => a - b);
    const nextIds = [...parsed.data.refereeIds].sort((a, b) => a - b);
    if (isDeepStrictEqual(previousIds, nextIds)) return;
    await tx
      .delete(fixtureReferees)
      .where(
        and(
          eq(fixtureReferees.fixtureId, id),
          nextIds.length
            ? notInArray(fixtureReferees.userId, nextIds)
            : undefined,
        ),
      );
    const added = nextIds.filter((userId) => !previousIds.includes(userId));
    if (added.length)
      await tx.insert(fixtureReferees).values(
        added.map((userId) => ({
          fixtureId: id,
          userId,
          assignedBy: actor.osuId,
        })),
      );
    await tx
      .update(fixtures)
      .set({ assignmentRevision: fixture.assignmentRevision + 1 })
      .where(eq(fixtures.id, id));
    await tx.insert(resultAuditEvents).values({
      fixtureId: id,
      actorId: actor.osuId,
      action: "fixture_referees",
      detail: {
        entity: { type: "fixture", id },
        before: {
          refereeIds: previousIds,
          assignmentRevision: fixture.assignmentRevision,
        },
        after: {
          refereeIds: nextIds,
          assignmentRevision: fixture.assignmentRevision + 1,
        },
      },
    });
  });
  return staffFixtures(actor, slug);
}
async function databaseStaffFixtures(actor: User, slug: string) {
  const access = await staffAccess(actor);
  const canManage = permits(access, "manage_fixtures", slug);
  const viewAll = canRead(access, "manage_fixtures", slug);
  if (!viewAll && !canRead(access, "record_results", slug))
    throw new HttpError(403, "Fixture access is required.");
  const edition = await configuredEdition(slug);
  return db().transaction(
    async (tx) => {
      const assigned = await tx
        .select({ fixtureId: fixtureReferees.fixtureId })
        .from(fixtureReferees)
        .where(eq(fixtureReferees.userId, actor.osuId));
      const rows = await tx
        .select()
        .from(fixtures)
        .where(
          and(
            eq(fixtures.editionSlug, slug),
            viewAll
              ? undefined
              : inArray(
                  fixtures.id,
                  assigned.map((a) => a.fixtureId),
                ),
          ),
        )
        .orderBy(fixtures.scheduledAt, fixtures.position);
      const rounds = await tx
        .select({ round: tournamentRounds, stage: tournamentStages.kind })
        .from(tournamentRounds)
        .innerJoin(
          tournamentStages,
          eq(tournamentStages.id, tournamentRounds.stageId),
        )
        .where(
          and(
            eq(tournamentRounds.editionSlug, slug),
            viewAll
              ? undefined
              : inArray(
                  tournamentRounds.id,
                  rows.map((f) => f.roundId),
                ),
          ),
        )
        .orderBy(tournamentStages.kind, tournamentRounds.position);
      const official = await officialTeams(tx, slug);
      const assignments = rows.length
        ? await tx
            .select()
            .from(fixtureReferees)
            .where(
              inArray(
                fixtureReferees.fixtureId,
                rows.map((f) => f.id),
              ),
            )
        : [];
      const pools = viewAll
        ? await tx
            .select({
              id: mappools.id,
              name: mappools.name,
              roundId: mappools.roundId,
            })
            .from(mappools)
            .where(eq(mappools.editionSlug, slug))
            .orderBy(mappools.name)
        : [];
      const results = rows.length
        ? await tx
            .select()
            .from(matchResults)
            .where(
              inArray(
                matchResults.fixtureId,
                rows.map((f) => f.id),
              ),
            )
        : [];
      const stageRows = await tx
        .select()
        .from(tournamentStages)
        .where(
          and(
            eq(tournamentStages.editionSlug, slug),
            viewAll
              ? undefined
              : inArray(
                  tournamentStages.id,
                  rounds.map((r) => r.round.stageId),
                ),
          ),
        );
      const visibleTeams = new Set(
        rows.flatMap((f) => [f.homeTeamId, f.awayTeamId]),
      );
      const stages = viewAll
        ? stageRows
        : stageRows.map((s) => ({
            ...s,
            groupConfiguration: s.groupConfiguration
              ? {
                  ...s.groupConfiguration,
                  groups: s.groupConfiguration.groups
                    .map((g) => ({
                      ...g,
                      teamIds: g.teamIds.filter((id) => visibleTeams.has(id)),
                    }))
                    .filter((g) => g.teamIds.length),
                }
              : null,
          }));
      const refereeNames = assignments.length
        ? await tx
            .select({ osuId: users.osuId, username: users.username })
            .from(users)
            .where(
              inArray(
                users.osuId,
                assignments.map((a) => a.userId),
              ),
            )
        : [];
      return {
        eligibleReferees: viewAll ? await eligibleReferees(tx, slug) : [],
        stages,
        canManage,
        canViewAll: viewAll,
        timeZone: edition.timeZone,
        fixtures: rows.map((f) => ({
          ...f,
          referees: assignments
            .filter((a) => a.fixtureId === f.id)
            .map((a) => ({
              osuId: a.userId,
              username:
                refereeNames.find((u) => u.osuId === a.userId)?.username ??
                String(a.userId),
            })),
          refereeIds: assignments
            .filter((a) => a.fixtureId === f.id)
            .map((a) => a.userId),
          result: results.find((r) => r.fixtureId === f.id) ?? null,
        })),
        rounds,
        teams: viewAll
          ? official
          : official.filter((t) =>
              rows.some((f) => f.homeTeamId === t.id || f.awayTeamId === t.id),
            ),
        pools,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function staffFixtures(
  actor: User,
  slug: string,
): Promise<Awaited<ReturnType<typeof databaseStaffFixtures>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseStaffFixtures>>>(
      "staffFixtures",
      { slug },
    );
  }
  return databaseStaffFixtures(actor, slug);
}

export type FixtureWorkspace = Awaited<ReturnType<typeof staffFixtures>>;
/** Private typed contract used by the MP importer. No browser-provided identity is accepted. */
async function databaseFixtureForReview(
  actor: User,
  slug: string,
  id: string,
  reader?: Reader,
  readOnly = false,
) {
  if (readOnly)
    await assertReadCapability(actor, "record_results", slug, reader);
  else await assertCapability(actor, "record_results", slug, reader);
  await configuredEdition(slug);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Fixture not found.");
  const admin = await hasCapability(actor, "manage_fixtures", slug, reader);
  const developer = readOnly && isDeveloper(await staffAccess(actor, reader));
  const read = async (tx: Reader) => {
    const [fixture] = await tx
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.id, id), eq(fixtures.editionSlug, slug)));
    if (!fixture) throw new HttpError(404, "Fixture not found.");
    const [assignment] = await tx
      .select()
      .from(fixtureReferees)
      .where(
        and(
          eq(fixtureReferees.fixtureId, id),
          eq(fixtureReferees.userId, actor.osuId),
        ),
      );
    if (!admin && !developer && !assignment)
      throw new HttpError(403, "You are not assigned to this fixture.");
    const [round] = await tx
      .select({
        ...getTableColumns(tournamentRounds),
        stage: tournamentStages.kind,
      })
      .from(tournamentRounds)
      .innerJoin(
        tournamentStages,
        eq(tournamentStages.id, tournamentRounds.stageId),
      )
      .where(eq(tournamentRounds.id, fixture.roundId));
    const official = await officialTeams(tx, slug);
    const home = official.find((t) => t.id === fixture.homeTeamId);
    const away = official.find((t) => t.id === fixture.awayTeamId);
    if (!home || !away)
      throw new HttpError(
        409,
        "Both teams must have finalized published identities and rosters before reporting.",
      );
    const [pool] = fixture.mappoolId
      ? await tx
          .select()
          .from(mappools)
          .where(eq(mappools.id, fixture.mappoolId))
      : [];
    const maps = pool
      ? await tx
          .select({
            beatmapId: mappoolEntries.beatmapId,
            category: mappoolEntries.category,
            position: mappoolEntries.position,
          })
          .from(mappoolEntries)
          .where(eq(mappoolEntries.poolId, pool.id))
      : [];
    const [result] = await tx
      .select()
      .from(matchResults)
      .where(eq(matchResults.fixtureId, id));
    return {
      fixture: { ...fixture, homeTeamId: home.id, awayTeamId: away.id },
      round,
      teams: [home, away] as const,
      pool: pool
        ? {
            id: pool.id,
            version: pool.version,
            name: pool.name,
            fmMode: pool.fmMode,
            fmRestrictions: pool.fmRestrictions,
            entries: maps,
          }
        : null,
      result: result ?? null,
      canApprove: admin,
      canRecord:
        admin ||
        (Boolean(assignment) &&
          (await hasCapability(actor, "record_results", slug, tx))),
      canViewAll: admin || developer,
    };
  };
  return reader
    ? read(reader)
    : db().transaction(read, { isolationLevel: "repeatable read" });
}
export async function fixtureForReview(
  actor: User,
  slug: string,
  id: string,
  reader?: Reader,
  readOnly = false,
): Promise<Awaited<ReturnType<typeof databaseFixtureForReview>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseFixtureForReview>>
    >("fixtureForReview", { slug, id });
  }
  return databaseFixtureForReview(actor, slug, id, reader, readOnly);
}

export type FixtureReviewContext = Awaited<ReturnType<typeof fixtureForReview>>;
function validateSources(
  rows: (typeof fixtures.$inferSelect)[],
  kinds: Map<string, string>,
) {
  const byId = new Map(rows.map((f) => [f.id, f]));
  for (const f of rows)
    for (const [sourceId, outcome] of [
      [f.homeSourceId, f.homeSourceOutcome],
      [f.awaySourceId, f.awaySourceOutcome],
    ]) {
      if (Boolean(sourceId) !== Boolean(outcome))
        throw new HttpError(
          400,
          "A bracket source requires both a fixture and winner/loser selection.",
        );
      if (
        sourceId &&
        (!byId.has(sourceId) ||
          kinds.get(f.roundId) !== "knockout" ||
          kinds.get(byId.get(sourceId)!.roundId) !== "knockout")
      )
        throw new HttpError(
          400,
          "Bracket sources must be knockout fixtures in this edition.",
        );
    }
  const pending = new Map(
    rows.map((f) => [
      f.id,
      new Set(
        [f.homeSourceId, f.awaySourceId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ]),
  );
  while (pending.size) {
    const ready = [...pending].filter(([, sources]) =>
      [...sources].every((id) => !pending.has(id)),
    );
    if (!ready.length)
      throw new HttpError(400, "Bracket sources cannot contain a cycle.");
    ready.forEach(([id]) => pending.delete(id));
  }
}
export async function fixtureCommand(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_fixtures", slug);
  await configuredEdition(slug);
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm valid fixture fields and rules.");
  const c = parsed.data;
  try {
    await db().transaction(async (tx) => {
      await tx.insert(editionState).values({ slug }).onConflictDoNothing();
      await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug))
        .for("update");
      await assertCapability(actor, "manage_fixtures", slug, tx);
      await assertOperationalEdition(slug, tx);
      if (c.action === "stage_groups") {
        const [stage] = await tx
          .select()
          .from(tournamentStages)
          .where(
            and(
              eq(tournamentStages.id, c.stageId),
              eq(tournamentStages.editionSlug, slug),
            ),
          )
          .for("update");
        if (!stage || stage.kind !== "group")
          throw new HttpError(400, "Choose this edition's Group Stage.");
        if (stage.version !== c.expectedVersion)
          throw new HttpError(
            409,
            "Group configuration changed. Refresh before continuing.",
          );
        const groups = c.configuration?.groups.map((group) => {
          if (
            group.key &&
            !stage.groupConfiguration?.groups.some((g) => g.key === group.key)
          )
            throw new HttpError(
              400,
              "Choose an existing group or add a new group without an identifier.",
            );
          return { ...group, key: group.key ?? `g-${randomUUID()}` };
        });
        const configuration = policyRelease(
          c.configuration ? { ...c.configuration, groups: groups! } : null,
          stage.groupConfiguration,
        );
        if (c.published && !c.configuration)
          throw new HttpError(
            400,
            "Configure approved groups before publication.",
          );
        const official = await officialTeams(tx, slug);
        if (
          c.configuration?.groups.some((g) =>
            g.teamIds.some((id) => !official.some((t) => t.id === id)),
          )
        )
          throw new HttpError(
            400,
            "Groups may contain only this edition's finalized published teams.",
          );
        const [after] = await tx
          .update(tournamentStages)
          .set({
            groupConfiguration: configuration,
            groupsPublishedAt: c.published ? new Date() : null,
            version: stage.version + 1,
          })
          .where(eq(tournamentStages.id, stage.id))
          .returning();
        await tx.insert(editionEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          kind: "competition_groups",
          detail: {
            entity: { type: "tournament_stage", id: stage.id },
            before: stage,
            after,
          },
        });
        return;
      }
      if (c.action === "round_rules") {
        const [round] = await tx
          .select({
            ...getTableColumns(tournamentRounds),
            stage: tournamentStages.kind,
          })
          .from(tournamentRounds)
          .innerJoin(
            tournamentStages,
            eq(tournamentStages.id, tournamentRounds.stageId),
          )
          .where(
            and(
              eq(tournamentRounds.id, c.roundId),
              eq(tournamentRounds.editionSlug, slug),
            ),
          );
        if (!round) throw new HttpError(404, "Round not found.");
        if (round.version !== c.expectedVersion)
          throw new HttpError(
            409,
            "Round configuration changed. Refresh before continuing.",
          );
        const scoringRules = policyRelease(c.scoringRules, round.scoringRules);
        const standingsRules = policyRelease(
          c.standingsRules,
          round.standingsRules,
        );
        if (round.stage !== "group" && c.standingsRules)
          throw new HttpError(
            400,
            "Standings rules belong to Group Stage rounds.",
          );
        const completed = await tx
          .select({ id: fixtures.id })
          .from(fixtures)
          .innerJoin(
            resultRevisions,
            eq(resultRevisions.fixtureId, fixtures.id),
          )
          .where(
            and(
              eq(fixtures.roundId, round.id),
              isNotNull(resultRevisions.approvedAt),
            ),
          )
          .limit(1);
        if (
          completed.length &&
          !isDeepStrictEqual(scoringRules, round.scoringRules) &&
          (!scoringRules ||
            scoringRules.version ===
              (round.scoringRules as { version?: string } | null)?.version)
        )
          throw new HttpError(
            409,
            "A changed scoring policy needs a new release. Approved result snapshots remain unchanged until a fresh result is reviewed and published.",
          );
        const [updated] = await tx
          .update(tournamentRounds)
          .set({
            scoringRules,
            standingsRules,
            version: round.version + 1,
          })
          .where(eq(tournamentRounds.id, round.id))
          .returning();
        // Round configuration is audited using the existing edition audit stream.
        await tx.insert(editionEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          kind: "competition_round_rules",
          detail: {
            entity: { type: "tournament_round", id: round.id },
            before: round,
            after: updated,
          },
        });
        return;
      }
      const [before] =
        c.action === "create"
          ? []
          : await tx
              .select()
              .from(fixtures)
              .where(
                and(
                  eq(fixtures.id, c.fixtureId),
                  eq(fixtures.editionSlug, slug),
                ),
              )
              .for("update");
      if (c.action !== "create" && !before) {
        if (c.action === "delete") {
          const [deleted] = await tx
            .select({ id: editionEvents.id })
            .from(editionEvents)
            .where(
              and(
                eq(editionEvents.editionSlug, slug),
                eq(editionEvents.actorId, actor.osuId),
                eq(editionEvents.kind, "competition_fixture_delete"),
                sql`${editionEvents.detail}->'entity'->>'id' = ${c.fixtureId}`,
                sql`${editionEvents.detail}->'before'->>'version' = ${String(c.expectedVersion)}`,
                sql`${editionEvents.detail}->'before'->>'assignmentRevision' = ${String(c.expectedAssignmentRevision)}`,
              ),
            )
            .limit(1);
          if (deleted) return;
        }
        throw new HttpError(404, "Fixture not found.");
      }
      if (c.action !== "create" && before!.version !== c.expectedVersion)
        throw new HttpError(409, "Fixture changed. Refresh before continuing.");
      if (c.action === "delete") {
        if (before!.publishedAt)
          throw new HttpError(
            409,
            "Unpublish this fixture before deleting it from the schedule.",
          );
        if (before!.status === "in_progress")
          throw new HttpError(
            409,
            "An in-progress fixture cannot be deleted. Use the established match correction workflow.",
          );
        if (before!.assignmentRevision !== c.expectedAssignmentRevision)
          throw new HttpError(
            409,
            "Referee assignments changed. Refresh before deleting this fixture.",
          );
        const [dependent] = await tx
          .select({ label: fixtures.label })
          .from(fixtures)
          .where(
            or(
              eq(fixtures.homeSourceId, before!.id),
              eq(fixtures.awaySourceId, before!.id),
            ),
          )
          .limit(1);
        if (dependent)
          throw new HttpError(
            409,
            "Another fixture uses this match for bracket progression. Clear that fixture's source selection first.",
          );
        const [stream] = await tx
          .select()
          .from(fixtureStreams)
          .where(eq(fixtureStreams.fixtureId, before!.id));
        if (stream)
          throw new HttpError(
            409,
            "Cancel the streaming task before deleting this fixture.",
          );
        const protectedRows = await tx.execute(
          sql`SELECT 1 FROM match_imports WHERE fixture_id = ${before!.id} UNION ALL SELECT 1 FROM match_results WHERE fixture_id = ${before!.id} UNION ALL SELECT 1 FROM result_revisions WHERE fixture_id = ${before!.id} UNION ALL SELECT 1 FROM result_game_claims WHERE fixture_id = ${before!.id} LIMIT 1`,
        );
        if (protectedRows.rows.length)
          throw new HttpError(
            409,
            "This fixture has match records or result history. Use result review or cancellation; these records cannot be deleted.",
          );
        const history = await tx
          .select()
          .from(resultAuditEvents)
          .where(eq(resultAuditEvents.fixtureId, before!.id));
        const setupActions = [
          "fixture_create",
          "fixture_amend",
          "fixture_publish",
          "fixture_unpublish",
          "fixture_referees",
        ];
        if (history.some((event) => !setupActions.includes(event.action)))
          throw new HttpError(
            409,
            "This fixture has protected competition history and cannot be deleted.",
          );
        const referees = await tx
          .select()
          .from(fixtureReferees)
          .where(eq(fixtureReferees.fixtureId, before!.id));
        // Move harmless setup history to the existing edition stream before its
        // fixture FK disappears. Preserve original actors, IDs and timestamps.
        const knownActors = new Set(
          (history.length
            ? await tx
                .select({ id: users.osuId })
                .from(users)
                .where(
                  inArray(
                    users.osuId,
                    history.map((e) => e.actorId),
                  ),
                )
            : []
          ).map((u) => u.id),
        );
        if (history.length)
          await tx.insert(editionEvents).values(
            history.map((event) => ({
              id: event.id,
              editionSlug: slug,
              actorId: knownActors.has(event.actorId) ? event.actorId : null,
              kind: `competition_${event.action}`,
              createdAt: event.createdAt,
              reason: event.reason,
              detail: {
                ...event.detail,
                historicalActorOsuId: event.actorId,
                entity: { type: "fixture", id: before!.id },
              },
            })),
          );
        await tx.insert(editionEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          kind: "competition_fixture_delete",
          detail: {
            entity: { type: "fixture", id: before!.id },
            before,
            after: null,
            referees,
          },
        });
        await tx
          .delete(fixtureReferees)
          .where(eq(fixtureReferees.fixtureId, before!.id));
        await tx
          .delete(resultAuditEvents)
          .where(eq(resultAuditEvents.fixtureId, before!.id));
        await tx.delete(fixtures).where(eq(fixtures.id, before!.id));
        return;
      }
      if (c.action === "publish") {
        const official = await officialTeams(tx, slug);
        if (
          c.published &&
          ((before!.homeTeamId !== null &&
            !official.some((t) => t.id === before!.homeTeamId)) ||
            (before!.awayTeamId !== null &&
              !official.some((t) => t.id === before!.awayTeamId)))
        )
          throw new HttpError(
            409,
            "Publish finalized teams and rosters before publishing a fixture.",
          );
        const [after] = await tx
          .update(fixtures)
          .set({
            publishedAt: c.published ? new Date() : null,
            version: before!.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(fixtures.id, before!.id))
          .returning();
        await tx.insert(resultAuditEvents).values({
          fixtureId: after.id,
          actorId: actor.osuId,
          action: c.published ? "fixture_publish" : "fixture_unpublish",
          detail: { entity: { type: "fixture", id: after.id }, before, after },
        });
        return;
      }
      const official = await officialTeams(tx, slug);
      if (
        (c.homeTeamId !== null && c.homeTeamId === c.awayTeamId) ||
        (c.homeTeamId !== null &&
          !official.some((t) => t.id === c.homeTeamId)) ||
        (c.awayTeamId !== null && !official.some((t) => t.id === c.awayTeamId))
      )
        throw new HttpError(
          400,
          "Choose different finalized, published teams from this edition, or leave participants TBD.",
        );
      const [round] = await tx
        .select()
        .from(tournamentRounds)
        .where(
          and(
            eq(tournamentRounds.id, c.roundId),
            eq(tournamentRounds.editionSlug, slug),
          ),
        );
      if (!round) throw new HttpError(404, "Round not found in this edition.");
      if (c.mappoolId) {
        const [pool] = await tx
          .select()
          .from(mappools)
          .where(
            and(
              eq(mappools.id, c.mappoolId),
              eq(mappools.roundId, c.roundId),
              eq(mappools.editionSlug, slug),
            ),
          );
        if (!pool)
          throw new HttpError(
            400,
            "Choose a mappool from this fixture's edition and round.",
          );
      }
      for (const userId of c.action === "create" ? c.refereeIds : []) {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.osuId, userId));
        if (!user || !(await hasCapability(user, "record_results", slug, tx)))
          throw new HttpError(
            400,
            "Every assigned referee must have an active result-reporting role for this edition.",
          );
      }
      const [result] = before
        ? await tx
            .select()
            .from(matchResults)
            .where(eq(matchResults.fixtureId, before.id))
        : [];
      if (
        result &&
        (result.state !== "draft" || result.publishedRevision !== null) &&
        before &&
        (before.homeTeamId !== c.homeTeamId ||
          before.awayTeamId !== c.awayTeamId ||
          before.roundId !== c.roundId ||
          before.mappoolId !== c.mappoolId ||
          before.homeSourceId !== c.homeSourceId ||
          before.homeSourceOutcome !== c.homeSourceOutcome ||
          before.awaySourceId !== c.awaySourceId ||
          before.awaySourceOutcome !== c.awaySourceOutcome)
      )
        throw new HttpError(
          409,
          "Withdraw the active proposal before amending teams, round, pool or progression. Use result review for score corrections.",
        );
      if (
        before &&
        (before.homeTeamId !== c.homeTeamId ||
          before.awayTeamId !== c.awayTeamId ||
          before.roundId !== c.roundId ||
          before.mappoolId !== c.mappoolId ||
          before.homeSourceId !== c.homeSourceId ||
          before.homeSourceOutcome !== c.homeSourceOutcome ||
          before.awaySourceId !== c.awaySourceId ||
          before.awaySourceOutcome !== c.awaySourceOutcome)
      ) {
        const approved = await tx
          .select({ revision: resultRevisions.revision })
          .from(resultRevisions)
          .where(
            and(
              eq(resultRevisions.fixtureId, before.id),
              isNotNull(resultRevisions.approvedAt),
            ),
          )
          .limit(1);
        if (approved.length)
          throw new HttpError(
            409,
            "Approved result history protects this fixture's participants, round, pool and progression. Create a replacement fixture; use result review for score corrections.",
          );
      }
      if (
        before &&
        c.status === "cancelled" &&
        result &&
        (result.state !== "draft" || result.publishedRevision !== null)
      )
        throw new HttpError(
          409,
          "Withdraw the active result through result review before cancelling this fixture.",
        );
      const values = {
        label: c.label,
        roundId: c.roundId,
        homeTeamId: c.homeTeamId,
        awayTeamId: c.awayTeamId,
        scheduledAt: c.scheduledAt ? new Date(c.scheduledAt) : null,
        timeZone: c.timeZone,
        status: c.status,
        mappoolId: c.mappoolId,
        position: c.position,
        homeSourceId: c.homeSourceId,
        homeSourceOutcome: c.homeSourceOutcome,
        awaySourceId: c.awaySourceId,
        awaySourceOutcome: c.awaySourceOutcome,
        updatedAt: new Date(),
      };
      const candidateId = before?.id ?? randomUUID();
      const allBefore = await tx
        .select()
        .from(fixtures)
        .where(eq(fixtures.editionSlug, slug));
      const kindsBefore = await tx
        .select({ id: tournamentRounds.id, kind: tournamentStages.kind })
        .from(tournamentRounds)
        .innerJoin(
          tournamentStages,
          eq(tournamentStages.id, tournamentRounds.stageId),
        )
        .where(eq(tournamentRounds.editionSlug, slug));
      validateSources(
        [
          ...allBefore.filter((f) => f.id !== candidateId),
          {
            ...values,
            id: candidateId,
            editionSlug: slug,
            publishedAt: before?.publishedAt ?? null,
            assignmentRevision: before?.assignmentRevision ?? 0,
            streamRevision: before?.streamRevision ?? 0,
            version: before?.version ?? 0,
          },
        ],
        new Map(kindsBefore.map((r) => [r.id, r.kind])),
      );
      const [after] = before
        ? await tx
            .update(fixtures)
            .set({ ...values, version: before.version + 1 })
            .where(eq(fixtures.id, before.id))
            .returning()
        : await tx
            .insert(fixtures)
            .values({ ...values, id: candidateId, editionSlug: slug })
            .returning();
      if (c.action === "create" && c.refereeIds.length)
        await tx.insert(fixtureReferees).values(
          c.refereeIds.map((userId) => ({
            fixtureId: after.id,
            userId,
            assignedBy: actor.osuId,
          })),
        );
      await tx.insert(resultAuditEvents).values({
        fixtureId: after.id,
        actorId: actor.osuId,
        action: before ? "fixture_amend" : "fixture_create",
        detail: {
          entity: { type: "fixture", id: after.id },
          before: before ?? null,
          after,
          ...(c.action === "create" ? { refereeIds: c.refereeIds } : {}),
        },
      });
    });
  } catch (error) {
    if (
      (error instanceof Error ? (error.cause as { code?: string }) : undefined)
        ?.code === "23505"
    )
      throw new HttpError(
        409,
        "This fixture position already exists. Refresh before continuing.",
      );
    throw error;
  }
  return staffFixtures(actor, slug);
}
