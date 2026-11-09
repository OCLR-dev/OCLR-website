import { db } from "@/db";
import {
  captains,
  fixtureReferees,
  fixtures,
  mappoolEntries,
  mappools,
  matchResults,
  memberships,
  refereeEvents,
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
  or,
} from "drizzle-orm";
import { z } from "zod";
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
import { getEdition } from "./content";
import { remoteMode } from "./data-source";
import {
  openExhibitionSides,
  exhibitionParticipants,
} from "./exhibition-sides";
import type { ExplicitReadData } from "./explicit-read-contracts";
import type { FixtureReviewContext } from "./fixture-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";

type Reader = Pick<ReturnType<typeof db>, "select">;
export type { FixtureReviewContext } from "./fixture-read-contracts";

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
/** Private setup choices; officialTeams remains the publication/result boundary. */
export async function configurationTeams(reader: Reader, slug: string) {
  const official = await officialTeams(reader, slug);
  const rows = await reader
    .select({ id: teams.id, name: teams.name, captainId: teams.captainId })
    .from(teams)
    .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)))
    .orderBy(teams.name);
  return rows.map((t) => ({
    ...t,
    members: official.find((o) => o.id === t.id)?.members ?? [],
    unpublished: !official.some((o) => o.id === t.id),
  }));
}
export async function configuredEdition(slug: string) {
  const edition = await getEdition(slug);
  if (!edition) throw new HttpError(404, "Edition not found.");
  return edition;
}
export async function eligibleReferees(reader: Reader, slug: string) {
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

async function databaseStaffFixtures(
  actor: User,
  slug: string,
): Promise<FixtureWorkspace> {
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
        fixtures: rows.map(({ exhibitionSides, ...f }) => ({
          ...f,
          ...(exhibitionSides ? { exhibitionSides } : {}),
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
          ? await configurationTeams(tx, slug)
          : official
              .map((t) => ({ ...t, unpublished: false }))
              .filter((t) =>
                rows.some(
                  (f) => f.homeTeamId === t.id || f.awayTeamId === t.id,
                ),
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
): Promise<FixtureWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<FixtureWorkspace>("staffFixtures", { slug });
  }
  return databaseStaffFixtures(actor, slug);
}

export type FixtureWorkspace = ExplicitReadData<"staffFixtures">;
/** Private typed contract used by the MP importer. No browser-provided identity is accepted. */
async function databaseFixtureForReview(
  actor: User,
  slug: string,
  id: string,
  reader?: Reader,
  readOnly = false,
): Promise<FixtureReviewContext> {
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
    const { exhibitionSides, ...fixtureRecord } = fixture;
    const sides = openExhibitionSides(
      { ...fixtureRecord, exhibitionSides },
      round?.stage,
    );
    const official = sides
      ? exhibitionParticipants(sides).map((side) => ({
          ...side,
          captainId: null,
          members: [] as { osuId: number; username: string }[],
        }))
      : await officialTeams(tx, slug);
    const home = official.find(
      (t) => t.id === (sides?.redId ?? fixture.homeTeamId),
    );
    const away = official.find(
      (t) => t.id === (sides?.blueId ?? fixture.awayTeamId),
    );
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
    const exEvents = await tx
      .select({ id: refereeEvents.id, payload: refereeEvents.payload })
      .from(refereeEvents)
      .where(eq(refereeEvents.fixtureId, id))
      .orderBy(refereeEvents.ordinal);
    const exPicks = new Map<
      string,
      { id: string; beatmapId: number; exMode: boolean }
    >();
    for (const event of exEvents) {
      const p = event.payload;
      if (p.type === "selection_recorded" && p.kind !== "ban")
        exPicks.set(event.id, {
          id: event.id,
          beatmapId: p.beatmapId,
          exMode: false,
        });
      else if (p.type === "ex_declared") {
        const pick = exPicks.get(p.pickId);
        if (pick) pick.exMode = p.enabled;
      } else if (p.type === "selection_voided") exPicks.delete(p.selectionId);
    }
    const [result] = await tx
      .select()
      .from(matchResults)
      .where(eq(matchResults.fixtureId, id));
    return {
      exDeclarations: [...exPicks.values()],
      fixture: {
        ...fixtureRecord,
        homeTeamId: home.id,
        awayTeamId: away.id,
        ...(sides
          ? { exhibitionSides: sides, openExhibition: true as const }
          : {}),
      },
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
): Promise<FixtureReviewContext> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<FixtureReviewContext>("fixtureForReview", {
      slug,
      id,
    });
  }
  return databaseFixtureForReview(actor, slug, id, reader, readOnly);
}
