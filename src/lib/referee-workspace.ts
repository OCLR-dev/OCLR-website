import { db } from "@/db";
import {
  fixtureReferees,
  fixtureStreams,
  fixtures,
  mappoolEntries,
  memberships,
  mappools,
  refereeEvents,
  refereeRoundPolicies,
  refereeSessions,
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
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { editionOperationState } from "./archive-guard";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  isDeveloper,
  permits,
  staffAccess,
} from "./auth/staff";
import { hashToken } from "./auth/tokens";
import { scoringRulesSchema } from "./competition-model";
import { remoteMode } from "./data-source";
import {
  exhibitionParticipants,
  openExhibitionSides,
} from "./exhibition-sides";
import type { ExplicitReadData } from "./explicit-read-contracts";
import type { RefereeBasis } from "./fixture-read-contracts";
import { HttpError } from "./http-error";
import {
  defaultRefereeRoomName,
  emptyRefereeSettings,
} from "./referee-commands";
import {
  projectReferee,
  refereePolicySchema,
  type RefereeEvent,
  type RefereeEventPayload,
} from "./referee-model";

type Reader = Pick<ReturnType<typeof db>, "select">;

/** Rechecked inside every transaction, including idempotent replay. No role is inferred from repository access. */
export async function assertRefereeAccess(
  reader: Reader,
  actor: User,
  slug: string,
  fixtureId: string,
  write = false,
) {
  if (!z.uuid().safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  if (write) await assertCapability(actor, "record_results", slug, reader);
  else await assertReadCapability(actor, "record_results", slug, reader);
  const [fixture] = await reader
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)));
  if (!fixture) throw new HttpError(404, "Fixture not found.");
  const grants = await staffAccess(actor, reader);
  const admin = permits(grants, "manage_fixtures", slug);
  const [assignment] = await reader
    .select()
    .from(fixtureReferees)
    .where(
      and(
        eq(fixtureReferees.fixtureId, fixtureId),
        eq(fixtureReferees.userId, actor.osuId),
      ),
    );
  if (!admin && !(isDeveloper(grants) && !write) && !assignment)
    throw new HttpError(403, "You are not assigned to this fixture.");
  return {
    fixture,
    canRecord:
      admin || (Boolean(assignment) && permits(grants, "record_results", slug)),
    canConfigure: admin,
  };
}

/** Saved-only, private workspace. Never inserts a session or contacts a provider. */
export async function readRefereeWorkspace(
  reader: Reader,
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RefereeWorkspace> {
  const access = await assertRefereeAccess(reader, actor, slug, fixtureId);
  const fixture = access.fixture;
  const edition = await editionOperationState(slug, reader);
  if (!edition?.configuration)
    throw new HttpError(404, "Tournament not found.");
  const [round] = await reader
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
        eq(tournamentRounds.id, fixture.roundId),
        eq(tournamentRounds.editionSlug, slug),
      ),
    );
  if (!round) throw new HttpError(404, "Round not found.");
  const parsedRules = scoringRulesSchema.safeParse(round.scoringRules);
  const rules = parsedRules.success ? parsedRules.data : null;
  const [savedPolicy] = await reader
    .select()
    .from(refereeRoundPolicies)
    .where(eq(refereeRoundPolicies.roundId, round.id));
  const parsedPolicy = refereePolicySchema.safeParse(savedPolicy?.policy);
  const policy = parsedPolicy.success ? parsedPolicy.data : null;
  // Only the current task's saved identity is needed by the referee workspace.
  const [streamer] = await reader
    .select({ username: users.username })
    .from(fixtureStreams)
    .innerJoin(users, eq(users.osuId, fixtureStreams.userId))
    .innerJoin(staffRoles, eq(staffRoles.userId, fixtureStreams.userId))
    .where(
      and(
        eq(fixtureStreams.fixtureId, fixtureId),
        eq(staffRoles.role, "streamer"),
        isNull(staffRoles.revokedAt),
        or(isNull(staffRoles.editionSlug), eq(staffRoles.editionSlug, slug)),
      ),
    )
    .limit(1);
  const sides = openExhibitionSides(fixture, round.stage);
  const ids = (
    sides
      ? [sides.redId, sides.blueId]
      : [fixture.homeTeamId, fixture.awayTeamId]
  ).filter((id): id is string => Boolean(id));
  const teamRows =
    !sides && ids.length
      ? await reader
          .select()
          .from(teams)
          .where(
            and(
              eq(teams.editionSlug, slug),
              inArray(teams.id, ids),
              isNull(teams.archivedAt),
            ),
          )
      : [];
  const names = teamRows.length
    ? await reader
        .select({ osuId: users.osuId, username: users.username })
        .from(users)
        .where(
          inArray(
            users.osuId,
            teamRows.map((t) => t.captainId),
          ),
        )
    : [];
  const orderedTeams = sides
    ? exhibitionParticipants(sides).map((side) => ({
        ...side,
        captainId: null,
        archivedAt: null,
        finalizedAt: null,
        identityPublished: true,
        rosterPublished: true,
      }))
    : ids.flatMap((id) => {
        const team = teamRows.find((t) => t.id === id);
        return team ? [team] : [];
      });
  const [pool] = fixture.mappoolId
    ? await reader
        .select()
        .from(mappools)
        .where(
          and(
            eq(mappools.id, fixture.mappoolId),
            eq(mappools.editionSlug, slug),
            eq(mappools.roundId, round.id),
          ),
        )
    : [];
  const maps = pool
    ? await reader
        .select({
          id: mappoolEntries.id,
          beatmapId: mappoolEntries.beatmapId,
          category: mappoolEntries.category,
          position: mappoolEntries.position,
          metadata: mappoolEntries.metadata,
        })
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, pool.id))
        .orderBy(
          mappoolEntries.category,
          mappoolEntries.position,
          mappoolEntries.id,
        )
    : [];
  const readiness: string[] = [];
  let officialDependencies: unknown = null;
  const commandRosters = new Map<
    string,
    { osuId: number; username: string }[]
  >();
  if (orderedTeams.length !== 2)
    readiness.push("Both fixture teams must be resolved.");
  else if (!sides) {
    // This private workspace already checked edition and fixture appointment.
    // BP and invitations use saved active memberships, including unpublished drafts.
    const members = await reader
      .select({
        teamId: memberships.teamId,
        osuId: users.osuId,
        username: users.username,
      })
      .from(memberships)
      .innerJoin(users, eq(users.osuId, memberships.userId))
      .where(and(inArray(memberships.teamId, ids), isNull(memberships.leftAt)));
    for (const team of orderedTeams)
      commandRosters.set(
        team.id,
        members
          .filter((m) => m.teamId === team.id)
          .map(({ osuId, username }) => ({ osuId, username })),
      );
    officialDependencies = orderedTeams.map((team) => ({
      id: team.id,
      members: (commandRosters.get(team.id) ?? [])
        .map((member) => member.osuId)
        .sort((a, b) => a - b),
    }));
  }
  if (!rules)
    readiness.push("The round scoring rules have not been configured.");
  if (!policy)
    readiness.push("The round referee policy has not been configured.");
  if (!pool || !maps.length)
    readiness.push("The fixture needs a saved round mappool.");
  if (fixture.status === "cancelled")
    readiness.push("Cancelled fixtures cannot record referee activity.");
  if (edition.hasArchive)
    readiness.push("Historical archives cannot record referee activity.");
  const basis: RefereeBasis = {
    policy,
    teamIds: orderedTeams.map((t) => t.id),
    maps: maps.map(({ id, beatmapId, category, position }) => ({
      id,
      beatmapId,
      category,
      position,
    })),
    series: rules?.series ?? null,
    tiedMapPolicy: rules?.tiedMapPolicy ?? "require_replay",
    exPlayersPerTeam: rules?.exPlayersPerTeam,
  };
  const dependencyFingerprint = hashToken(
    JSON.stringify({
      fixture: {
        version: fixture.version,
        roundId: fixture.roundId,
        home: sides?.redId ?? fixture.homeTeamId,
        away: sides?.blueId ?? fixture.awayTeamId,
        ...(sides ? { exhibitionSides: sides } : {}),
        poolId: fixture.mappoolId,
        status: fixture.status,
      },
      round: { version: round.version, rules },
      policyRevision: savedPolicy?.revision ?? 0,
      pool: pool
        ? {
            id: pool.id,
            version: pool.version,
            fmMode: pool.fmMode,
            fmRestrictions: pool.fmRestrictions,
          }
        : null,
      teams: orderedTeams.map((t) => ({
        id: t.id,
        captainId: t.captainId,
        archivedAt: t.archivedAt,
        finalizedAt: t.finalizedAt,
        identityPublished: t.identityPublished,
        rosterPublished: t.rosterPublished,
      })),
      officialDependencies,
      basis,
    }),
  );
  const [sessionRow] = await reader
    .select()
    .from(refereeSessions)
    .where(eq(refereeSessions.fixtureId, fixtureId));
  const eventRows = sessionRow
    ? await reader
        .select({
          id: refereeEvents.id,
          ordinal: refereeEvents.ordinal,
          actorId: refereeEvents.actorId,
          createdAt: refereeEvents.createdAt,
          resolvedPickId: refereeEvents.resolvedPickId,
          resolvedAttemptId: refereeEvents.resolvedAttemptId,
          resolvedStatus: refereeEvents.resolvedStatus,
          resolvedWinnerTeamId: refereeEvents.resolvedWinnerTeamId,
          rawPayload: sql<RefereeEventPayload | null>`
            CASE WHEN ${refereeEvents.resolvedAttemptId} IS NOT NULL
                 AND ${refereeEvents.resolvedPickId} IS NOT NULL
                 AND ${refereeEvents.resolvedStatus} IS NOT NULL
                 AND ${refereeEvents.payload} = jsonb_build_object(
                   'type', 'attempt_resolved',
                   'pickId', ${refereeEvents.resolvedPickId},
                   'attemptId', ${refereeEvents.resolvedAttemptId},
                   'status', ${refereeEvents.resolvedStatus},
                   'winnerTeamId', ${refereeEvents.resolvedWinnerTeamId}
                 )
              THEN NULL
              ELSE ${refereeEvents.payload}
            END`,
        })
        .from(refereeEvents)
        .where(eq(refereeEvents.fixtureId, fixtureId))
        .orderBy(refereeEvents.ordinal)
    : [];
  const events: RefereeEvent[] = eventRows.map((e) => ({
    id: e.id,
    ordinal: e.ordinal,
    actorId: e.actorId,
    createdAt: e.createdAt.toISOString(),
    payload: e.rawPayload ?? {
      type: "attempt_resolved",
      pickId: e.resolvedPickId!,
      attemptId: e.resolvedAttemptId!,
      status: e.resolvedStatus!,
      winnerTeamId: e.resolvedWinnerTeamId,
    },
  }));
  const stale = Boolean(
    sessionRow && sessionRow.dependencyFingerprint !== dependencyFingerprint,
  );
  if (stale)
    readiness.push(
      "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.",
    );
  const orders = sessionRow?.exhibitionOrder ?? {
    firstBanTeamId: sessionRow?.firstBanTeamId ?? null,
    firstPickTeamId: sessionRow?.firstPickTeamId ?? null,
  };
  const projection = projectReferee({
    ...(sessionRow?.basis ?? basis),
    orders,
    events,
  });
  const inheritedSettings = {
    ...emptyRefereeSettings,
    roomName: defaultRefereeRoomName(
      edition.configuration.season,
      orderedTeams,
    ),
    streamerUsername: streamer?.username ?? "",
    timerSeconds: policy?.commands?.prepareSeconds ?? null,
    startSeconds: policy?.commands?.startSeconds ?? null,
    roomSize: policy?.commands?.roomSize ?? null,
  };
  return {
    fixture: {
      id: fixture.id,
      label: fixture.label,
      roundId: fixture.roundId,
      status: fixture.status,
      homeTeamId: sides?.redId ?? fixture.homeTeamId,
      awayTeamId: sides?.blueId ?? fixture.awayTeamId,
      ...(sides ? { openExhibition: true as const } : {}),
      version: fixture.version,
    },
    round: {
      id: round.id,
      name: round.name,
      ...(round.stage === "exhibition" ? { exhibition: true as const } : {}),
    },
    teams: orderedTeams.map((t) => ({
      id: t.id,
      name: t.name,
      captainId: t.captainId,
      captainUsername:
        names.find((n) => n.osuId === t.captainId)?.username ?? null,
      members: commandRosters.get(t.id) ?? [],
    })),
    defaultSettings: inheritedSettings,
    maps,
    rules,
    series: rules?.series ?? null,
    policy,
    policyRevision: savedPolicy?.revision ?? 0,
    session: sessionRow
      ? {
          revision: sessionRow.revision,
          ...orders,
          // Effective settings always inherit current saved sources. Historical
          // settings_saved events and stored session snapshots are left intact.
          settings: inheritedSettings,
          dependencyFingerprint: sessionRow.dependencyFingerprint,
          basis: sessionRow.basis,
        }
      : null,
    events,
    projection,
    dependencyFingerprint,
    readiness,
    canRecord:
      access.canRecord && !edition.hasArchive && fixture.status !== "cancelled",
    canConfigure: access.canConfigure && !edition.hasArchive,
  };
}
export type RefereeWorkspace = ExplicitReadData<"refereeWorkspace">;
export async function refereeWorkspace(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RefereeWorkspace> {
  if (remoteMode()) {
    const { frontendResource, assertRemoteSubject } =
      await import("./frontend-resource");
    await assertRemoteSubject(actor.osuId);
    return frontendResource<RefereeWorkspace>("refereeWorkspace", {
      slug,
      fixtureId,
    });
  }
  return db().transaction(
    (tx) => readRefereeWorkspace(tx, actor, slug, fixtureId),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
