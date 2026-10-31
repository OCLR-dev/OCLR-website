import { db } from "@/db";
import {
  editionState,
  fixtureReferees,
  fixtureStreams,
  staffRoles,
  fixtures,
  mappoolEntries,
  memberships,
  mappools,
  refereeEvents,
  refereeRoundPolicies,
  refereeSessions,
  resultAuditEvents,
  teams,
  tournamentRounds,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  isDeveloper,
  permits,
  staffAccess,
} from "./auth/staff";
import { scoringRulesSchema } from "./competition-model";
import { remoteMode } from "./data-source";
import { persistRoundRefereePolicy } from "./round-referee-policy";
import { HttpError } from "./http";
import {
  defaultRefereeRoomName,
  emptyRefereeSettings,
  refereeSettingsSchema,
} from "./referee-commands";
import {
  projectReferee,
  refereeActionSchema,
  refereePolicySchema,
  validateRefereeAction,
  type RefereeEvent,
  type RefereeEventPayload,
  type RefereeModelInput,
} from "./referee-model";

type Reader = Pick<ReturnType<typeof db>, "select">;
export type RefereeBasis = Pick<
  RefereeModelInput,
  | "policy"
  | "teamIds"
  | "maps"
  | "series"
  | "tiedMapPolicy"
  | "exPlayersPerTeam"
>;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const common = {
  requestKey: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
};
export const refereeCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("save_settings"),
      settings: refereeSettingsSchema,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("configure_policy"),
      expectedPolicyRevision: z.number().int().nonnegative(),
      policy: refereePolicySchema,
    })
    .strict(),
  z.object({ ...common, action: z.literal("reconfirm_dependencies") }).strict(),
  ...refereeActionSchema.options.map((option) => option.extend(common)),
]);
export type RefereeCommand = z.infer<typeof refereeCommandSchema>;

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
) {
  const access = await assertRefereeAccess(reader, actor, slug, fixtureId);
  const fixture = access.fixture;
  const [edition] = await reader
    .select({ configuration: editionState.configuration })
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!edition?.configuration)
    throw new HttpError(404, "Tournament not found.");
  const [round] = await reader
    .select()
    .from(tournamentRounds)
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
  const ids = [fixture.homeTeamId, fixture.awayTeamId].filter(
    (id): id is string => Boolean(id),
  );
  const teamRows = ids.length
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
  const orderedTeams = ids.flatMap((id) => {
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
  else {
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
  if (edition.configuration.archive)
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
  const dependencyFingerprint = hash({
    fixture: {
      version: fixture.version,
      roundId: fixture.roundId,
      home: fixture.homeTeamId,
      away: fixture.awayTeamId,
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
  });
  const [sessionRow] = await reader
    .select()
    .from(refereeSessions)
    .where(eq(refereeSessions.fixtureId, fixtureId));
  const eventRows = sessionRow
    ? await reader
        .select()
        .from(refereeEvents)
        .where(eq(refereeEvents.fixtureId, fixtureId))
        .orderBy(refereeEvents.ordinal)
    : [];
  const events: RefereeEvent[] = eventRows.map((e) => ({
    id: e.id,
    ordinal: e.ordinal,
    actorId: e.actorId,
    createdAt: e.createdAt.toISOString(),
    payload: e.payload,
  }));
  const stale = Boolean(
    sessionRow && sessionRow.dependencyFingerprint !== dependencyFingerprint,
  );
  if (stale)
    readiness.push(
      "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.",
    );
  const orders = {
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
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      version: fixture.version,
    },
    round: { id: round.id, name: round.name },
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
          firstBanTeamId: sessionRow.firstBanTeamId,
          firstPickTeamId: sessionRow.firstPickTeamId,
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
      access.canRecord &&
      !edition.configuration.archive &&
      fixture.status !== "cancelled",
    canConfigure: access.canConfigure && !edition.configuration.archive,
  };
}
export type RefereeWorkspace = Awaited<ReturnType<typeof readRefereeWorkspace>>;
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

/** Writes share role, edition, and fixture locks with existing staff/result services. */
export async function refereeCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
  transaction?: Parameters<
    Parameters<ReturnType<typeof db>["transaction"]>[0]
  >[0],
) {
  await assertCapability(actor, "record_results", slug);
  const parsed = refereeCommandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose valid referee settings and the current workspace revision.",
    );
  const command = parsed.data;
  if (!z.uuid().safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  const execute = async (
    tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  ) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await tx
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
      .for("update");
    await assertRefereeAccess(tx, actor, slug, fixtureId, true);
    await assertOperationalEdition(slug, tx);
    const workspace = await readRefereeWorkspace(tx, actor, slug, fixtureId);
    const requestHash = hash(command);
    const [prior] = await tx
      .select()
      .from(refereeEvents)
      .where(
        and(
          eq(refereeEvents.fixtureId, fixtureId),
          eq(refereeEvents.actorId, actor.osuId),
          eq(refereeEvents.requestKey, command.requestKey),
        ),
      );
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return {
        receipt: {
          requestKey: command.requestKey,
          revision: prior.ordinal,
          eventId: prior.id,
        },
        workspace,
      };
    }
    if (!workspace.canRecord)
      throw new HttpError(409, "This fixture cannot record referee activity.");
    const revision = workspace.session?.revision ?? 0;
    if (command.expectedRevision !== revision)
      throw new HttpError(
        409,
        "The referee workspace changed. Refresh before saving.",
      );
    if (command.dependencyFingerprint !== workspace.dependencyFingerprint)
      throw new HttpError(
        409,
        "Fixture dependencies changed. Refresh before saving.",
      );
    const stale = Boolean(
      workspace.session &&
      workspace.session.dependencyFingerprint !==
        workspace.dependencyFingerprint,
    );
    if (
      stale &&
      !["void_last", "reconfirm_dependencies"].includes(command.action)
    )
      throw new HttpError(
        409,
        "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.",
      );
    const currentBasis: RefereeBasis = {
      policy: workspace.policy,
      teamIds: workspace.teams.map((t) => t.id),
      maps: workspace.maps.map(({ id, beatmapId, category, position }) => ({
        id,
        beatmapId,
        category,
        position,
      })),
      series: workspace.series,
      tiedMapPolicy: workspace.rules?.tiedMapPolicy ?? "require_replay",
      exPlayersPerTeam: workspace.rules?.exPlayersPerTeam,
    };
    let basis = workspace.session?.basis ?? currentBasis;
    let dependencyFingerprint =
      workspace.session?.dependencyFingerprint ??
      workspace.dependencyFingerprint;
    let settings = workspace.defaultSettings;
    let firstBanTeamId = workspace.session?.firstBanTeamId ?? null;
    let firstPickTeamId = workspace.session?.firstPickTeamId ?? null;
    let payload: RefereeEventPayload;
    if (command.action === "configure_policy") {
      const newRevision = await persistRoundRefereePolicy(
        tx,
        actor,
        slug,
        workspace.round.id,
        command.expectedPolicyRevision,
        command.policy,
      );
      const next = await readRefereeWorkspace(tx, actor, slug, fixtureId);
      // Every session inherits the newly saved policy.
      settings = next.defaultSettings;
      basis = { ...currentBasis, policy: command.policy };
      dependencyFingerprint = next.dependencyFingerprint;
      payload = {
        type: "policy_configured",
        policy: command.policy,
        revision: newRevision,
      };
    } else if (command.action === "save_settings") {
      // Retain the legacy action and idempotent receipts without allowing overrides.
      if (!isDeepStrictEqual(command.settings, workspace.defaultSettings))
        throw new HttpError(
          409,
          "Room settings inherit the saved round rules and streaming task. Reload the workspace.",
        );
      payload = { type: "settings_saved", settings };
    } else if (command.action === "reconfirm_dependencies") {
      if (workspace.projection.activeSelections.length)
        throw new HttpError(
          409,
          "Withdraw recorded steps before confirming changed dependencies.",
        );
      basis = currentBasis;
      dependencyFingerprint = workspace.dependencyFingerprint;
      if (!basis.teamIds.includes(firstBanTeamId ?? "")) firstBanTeamId = null;
      if (!basis.teamIds.includes(firstPickTeamId ?? ""))
        firstPickTeamId = null;
      payload = { type: "dependencies_reconfirmed" };
    } else {
      if (
        command.action !== "void_last" &&
        command.action !== "set_order" &&
        workspace.readiness.length
      )
        throw new HttpError(409, workspace.readiness[0]);
      try {
        payload = validateRefereeAction(
          {
            ...basis,
            orders: { firstBanTeamId, firstPickTeamId },
            events: workspace.events,
          },
          command,
        );
      } catch (error) {
        throw new HttpError(
          409,
          error instanceof Error
            ? error.message
            : "This referee action is not available.",
        );
      }
      if (payload.type === "order_set") {
        firstBanTeamId = payload.firstBanTeamId;
        firstPickTeamId = payload.firstPickTeamId;
      }
    }
    const nextRevision = revision + 1;
    const state = {
      revision: nextRevision,
      firstBanTeamId,
      firstPickTeamId,
      settings,
      basis,
      dependencyFingerprint,
      updatedAt: new Date(),
    };
    await tx
      .insert(refereeSessions)
      .values({ fixtureId, editionSlug: slug, ...state })
      .onConflictDoUpdate({ target: refereeSessions.fixtureId, set: state });
    const eventId = randomUUID();
    await tx.insert(refereeEvents).values({
      id: eventId,
      fixtureId,
      ordinal: nextRevision,
      actorId: actor.osuId,
      requestKey: command.requestKey,
      requestHash,
      payload,
    });
    await tx.insert(resultAuditEvents).values({
      fixtureId,
      actorId: actor.osuId,
      action: `referee_${command.action}`,
      detail: {
        entity: { type: "referee_session", id: fixtureId },
        before: {
          revision,
          dependencyFingerprint:
            workspace.session?.dependencyFingerprint ?? null,
          firstBanTeamId: workspace.session?.firstBanTeamId ?? null,
          firstPickTeamId: workspace.session?.firstPickTeamId ?? null,
        },
        after: {
          revision: nextRevision,
          eventId,
          payload,
          dependencyFingerprint,
          firstBanTeamId,
          firstPickTeamId,
        },
      },
    });
    return {
      receipt: {
        requestKey: command.requestKey,
        revision: nextRevision,
        eventId,
      },
      workspace: await readRefereeWorkspace(tx, actor, slug, fixtureId),
    };
  };
  return transaction ? execute(transaction) : db().transaction(execute);
}
