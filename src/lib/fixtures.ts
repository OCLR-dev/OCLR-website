import { db } from "@/db";
import {
  editionEvents,
  editionState,
  fixtureReferees,
  fixtureStreams,
  fixtureCommentators,
  fixtures,
  mappools,
  matchResults,
  refereeSessions,
  refereeRoundPolicies,
  resultAuditEvents,
  resultRevisions,
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
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { forceDeleteFixtureRecords } from "./fixture-force-delete";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability, hasCapability } from "./auth/staff";
import {
  assignFixtureRefereesWrite,
  fixtureCommandInput,
} from "./fixture-write-contracts";
import {
  configurationTeams,
  configuredEdition,
  eligibleReferees,
  officialTeams,
  staffFixtures,
  type FixtureWorkspace,
} from "./fixture-reads";
import { HttpError } from "./http-error";
import { persistRoundRefereePolicy } from "./round-referee-policy";
import { refereePolicyForWins } from "./referee-series";
import { refereePolicySchema } from "./referee-model";
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
export async function assignFixtureReferees(
  actor: User,
  slug: string,
  id: string,
  input: unknown,
): Promise<FixtureWorkspace> {
  await assertCapability(actor, "manage_fixtures", slug);
  await configuredEdition(slug);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Fixture not found.");
  const parsed = assignFixtureRefereesWrite.request.safeParse(input);
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
): Promise<FixtureWorkspace> {
  await assertCapability(actor, "manage_fixtures", slug);
  await configuredEdition(slug);
  const parsed = fixtureCommandInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm valid fixture fields and rules.");
  const c = parsed.data;
  try {
    await db().transaction(async (tx) => {
      if (c.action === "force_delete" || c.action === "round_rules")
        await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
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
        const official = c.published
          ? await officialTeams(tx, slug)
          : await configurationTeams(tx, slug);
        if (
          c.configuration?.groups.some((g) =>
            g.teamIds.some((id) => !official.some((t) => t.id === id)),
          )
        )
          throw new HttpError(
            400,
            "Choose active teams from this edition. Publish finalized teams and rosters before publishing groups.",
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
        if (
          c.scoringRules?.series.type === "first_to" &&
          c.scoringRules.tiedMapPolicy === "count_as_draw"
        )
          throw new HttpError(
            400,
            "First-to series require tied maps to be replayed.",
          );
        if (
          c.scoringRules?.exPlayersPerTeam != null &&
          c.scoringRules.exPlayersPerTeam > c.scoringRules.playersPerTeam
        )
          throw new HttpError(
            400,
            "EX player count cannot exceed the normal player count.",
          );
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
        const seriesChanged =
          scoringRules?.series.type === "first_to" &&
          (round.scoringRules?.series.type !== "first_to" ||
            round.scoringRules.series.wins !== scoringRules.series.wins);
        const [refereePolicy] = seriesChanged
          ? await tx
              .select()
              .from(refereeRoundPolicies)
              .where(eq(refereeRoundPolicies.roundId, round.id))
          : [];
        if (
          seriesChanged &&
          (refereePolicy || c.expectedRefereePolicyRevision !== undefined) &&
          c.expectedRefereePolicyRevision !== (refereePolicy?.revision ?? 0)
        )
          throw new HttpError(
            409,
            "The round referee policy changed. Refresh before saving.",
          );
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
        if (seriesChanged && refereePolicy) {
          const next = refereePolicySchema.safeParse(
            refereePolicyForWins(
              refereePolicy.policy,
              scoringRules!.series.type === "first_to"
                ? scoringRules!.series.wins
                : 1,
            ),
          );
          if (!next.success)
            throw new HttpError(
              400,
              "Review the step order, tiebreak conditions and command settings.",
            );
          await persistRoundRefereePolicy(
            tx,
            actor,
            slug,
            round.id,
            refereePolicy.revision,
            next.data,
            undefined,
            true,
          );
        }
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
        if (c.action === "delete" || c.action === "force_delete") {
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
                c.action === "force_delete"
                  ? sql`${editionEvents.detail}->>'deletionFingerprint' = ${c.expectedDeletionFingerprint} AND ${editionEvents.detail}->>'force' = 'true' AND ${editionEvents.detail}->'before'->>'label' = ${c.confirmationLabel}`
                  : sql`COALESCE(${editionEvents.detail}->>'force','false') = 'false'`,
              ),
            )
            .limit(1);
          if (deleted) return;
        }
        throw new HttpError(404, "Fixture not found.");
      }
      if (c.action !== "create" && before!.version !== c.expectedVersion)
        throw new HttpError(409, "Fixture changed. Refresh before continuing.");
      if (c.action === "delete" || c.action === "force_delete") {
        if (c.action === "delete" && before!.publishedAt)
          throw new HttpError(
            409,
            "Unpublish this fixture before deleting it from the schedule.",
          );
        if (c.action === "delete" && before!.status === "in_progress")
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
        if (
          c.action === "force_delete" &&
          c.confirmationLabel !== before!.label
        )
          throw new HttpError(
            400,
            "Type the exact fixture label to confirm force deletion.",
          );
        const forced =
          c.action === "force_delete"
            ? await forceDeleteFixtureRecords(
                tx,
                before!,
                c.expectedDeletionFingerprint,
              )
            : null;
        if (c.action === "delete") {
          const [stream] = await tx
            .select()
            .from(fixtureStreams)
            .where(eq(fixtureStreams.fixtureId, before!.id));
          if (stream)
            throw new HttpError(
              409,
              "Cancel the streaming task before deleting this fixture.",
            );
          const [commentary] = await tx
            .select({ id: fixtureCommentators.fixtureId })
            .from(fixtureCommentators)
            .where(eq(fixtureCommentators.fixtureId, before!.id))
            .limit(1);
          if (commentary)
            throw new HttpError(
              409,
              "Cancel commentary tasks before deleting this fixture.",
            );
          const [refereeRecord] = await tx
            .select({ id: refereeSessions.fixtureId })
            .from(refereeSessions)
            .where(eq(refereeSessions.fixtureId, before!.id));
          if (refereeRecord)
            throw new HttpError(
              409,
              "This fixture has saved referee records and cannot be deleted.",
            );
          const protectedRows = await tx.execute(
            sql`SELECT 1 FROM match_imports WHERE fixture_id = ${before!.id} UNION ALL SELECT 1 FROM match_results WHERE fixture_id = ${before!.id} UNION ALL SELECT 1 FROM result_revisions WHERE fixture_id = ${before!.id} UNION ALL SELECT 1 FROM result_game_claims WHERE fixture_id = ${before!.id} LIMIT 1`,
          );
          if (protectedRows.rows.length)
            throw new HttpError(
              409,
              "This fixture has match records or result history. Use result review or cancellation; these records cannot be deleted.",
            );
        }
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
        if (
          c.action === "delete" &&
          history.some((event) => !setupActions.includes(event.action))
        )
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
            ...(forced
              ? {
                  force: true,
                  deletionFingerprint: forced.preview.fingerprint,
                  counts: forced.preview.counts,
                  archivedRecords: forced.snapshot,
                }
              : {}),
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
      const official = before?.publishedAt
        ? await officialTeams(tx, slug)
        : await configurationTeams(tx, slug);
      if (
        (c.homeTeamId !== null && c.homeTeamId === c.awayTeamId) ||
        (c.homeTeamId !== null &&
          !official.some((t) => t.id === c.homeTeamId)) ||
        (c.awayTeamId !== null && !official.some((t) => t.id === c.awayTeamId))
      )
        throw new HttpError(
          400,
          "Choose different active teams from this edition, or leave participants TBD. Published fixtures require finalized, published teams.",
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
      const [stage] = await tx
        .select({ kind: tournamentStages.kind })
        .from(tournamentStages)
        .where(eq(tournamentStages.id, round.stageId));
      if (c.exhibitionNames && stage?.kind !== "exhibition")
        throw new HttpError(
          400,
          "Custom side names are only available for exhibition fixtures.",
        );
      const open =
        stage?.kind === "exhibition" && !c.homeTeamId && !c.awayTeamId;
      if (
        (open && (c.homeSourceId || c.awaySourceId)) ||
        (c.exhibitionNames && !open)
      )
        throw new HttpError(
          400,
          "Open exhibitions use fixture-local red and blue sides without official teams or progression links.",
        );
      const exhibitionSides = open
        ? {
            redId: before?.exhibitionSides?.redId ?? randomUUID(),
            blueId: before?.exhibitionSides?.blueId ?? randomUUID(),
            redName:
              c.exhibitionNames?.red ??
              before?.exhibitionSides?.redName ??
              "紅隊",
            blueName:
              c.exhibitionNames?.blue ??
              before?.exhibitionSides?.blueName ??
              "藍隊",
          }
        : null;
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
        ((before.exhibitionSides?.redId ?? null) !==
          (exhibitionSides?.redId ?? null) ||
          (before.exhibitionSides?.blueId ?? null) !==
            (exhibitionSides?.blueId ?? null) ||
          before.homeTeamId !== c.homeTeamId ||
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
        ((before.exhibitionSides?.redId ?? null) !==
          (exhibitionSides?.redId ?? null) ||
          (before.exhibitionSides?.blueId ?? null) !==
            (exhibitionSides?.blueId ?? null) ||
          before.homeTeamId !== c.homeTeamId ||
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
        exhibitionSides,
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
