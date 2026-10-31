import { and, eq, isNull, inArray, or, asc } from "drizzle-orm";
import { z } from "zod";
import { db, readOnlyData } from "@/db";
import {
  fixtures,
  fixtureReferees,
  staffRoles,
  editionState,
  tournamentRounds,
  teams,
  matchResults,
} from "@/db/schema";
import { DesktopError, digest, requireDesktopUser } from "./desktop-auth";
import { refereeWorkspace } from "./referee";
import { appUrl } from "./http";
export async function assignedDesktopFixture(
  actor: { osuId: number },
  id: string,
) {
  if (!z.uuid().safeParse(id).success)
    throw new DesktopError(404, "FIXTURE_NOT_AVAILABLE");
  const [row] = await db()
    .select({ fixture: fixtures })
    .from(fixtures)
    .innerJoin(
      fixtureReferees,
      and(
        eq(fixtureReferees.fixtureId, fixtures.id),
        eq(fixtureReferees.userId, actor.osuId),
      ),
    )
    .innerJoin(
      staffRoles,
      and(
        eq(staffRoles.userId, actor.osuId),
        isNull(staffRoles.revokedAt),
        inArray(staffRoles.role, ["referee", "admin"]),
        or(
          isNull(staffRoles.editionSlug),
          eq(staffRoles.editionSlug, fixtures.editionSlug),
        ),
      ),
    )
    .where(eq(fixtures.id, id))
    .limit(1);
  if (!row) throw new DesktopError(404, "FIXTURE_NOT_AVAILABLE");
  return row.fixture;
}
export async function desktopPanel(request: Request, id: string) {
  return readOnlyData(async () => {
    if (new URL(request.url).search)
      throw new DesktopError(400, "INVALID_REQUEST");
    const actor = await requireDesktopUser(request, "referee:panel:read"),
      fixture = await assignedDesktopFixture(actor, id);
    const workspace = await refereeWorkspace(actor, fixture.editionSlug, id);
    const [edition] = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, fixture.editionSlug));
    if (
      workspace.events.length > 2000 ||
      Buffer.byteLength(JSON.stringify(workspace)) > 490000
    )
      throw new DesktopError(413, "RESPONSE_TOO_LARGE");
    const capturedAt = new Date();
    return {
      viewer: { osuId: actor.osuId, username: actor.username },
      edition: {
        slug: fixture.editionSlug,
        name: edition.configuration?.name ?? fixture.editionSlug,
      },
      capturedAt: capturedAt.toISOString(),
      freshUntil: new Date(capturedAt.getTime() + 30000).toISOString(),
      workspace,
    };
  });
}
export async function desktopFixtures(request: Request) {
  return readOnlyData(async () => {
    const actor = await requireDesktopUser(request, "referee:fixtures:read");
    const q = new URL(request.url).searchParams;
    if (
      [...q.keys()].some((k) => !["view", "limit", "cursor"].includes(k)) ||
      [...q.keys()].some((k) => q.getAll(k).length > 1) ||
      q.get("view") !== "active"
    )
      throw new DesktopError(400, "INVALID_REQUEST");
    const limit = Number(q.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new DesktopError(400, "INVALID_REQUEST");
    const rows = await db()
      .select({
        fixture: fixtures,
        edition: editionState,
        round: tournamentRounds,
        result: matchResults,
      })
      .from(fixtures)
      .innerJoin(
        fixtureReferees,
        and(
          eq(fixtureReferees.fixtureId, fixtures.id),
          eq(fixtureReferees.userId, actor.osuId),
        ),
      )
      .innerJoin(editionState, eq(editionState.slug, fixtures.editionSlug))
      .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtures.roundId))
      .leftJoin(matchResults, eq(matchResults.fixtureId, fixtures.id))
      .orderBy(asc(fixtures.id))
      .limit(501);
    if (rows.length > 500) throw new DesktopError(413, "RESPONSE_TOO_LARGE");
    const allowed = [];
    for (const row of rows) {
      try {
        await assignedDesktopFixture(actor, row.fixture.id);
        allowed.push(row);
      } catch (e) {
        if (!(e instanceof DesktopError)) throw e;
      }
    }
    const collectionRevision = digest(
      JSON.stringify(
        allowed.map((r) => [
          r.fixture,
          r.result?.state,
          r.edition.configurationVersion,
          r.round.name,
        ]),
      ),
    );
    let offset = 0;
    if (q.has("cursor")) {
      try {
        const c = JSON.parse(
          Buffer.from(q.get("cursor")!, "base64url").toString(),
        ) as { subject: number; revision: string; offset: number };
        if (c.subject !== actor.osuId || c.revision !== collectionRevision)
          throw new DesktopError(409, "COLLECTION_CHANGED");
        if (!Number.isInteger(c.offset) || c.offset < 0 || c.offset > 500)
          throw new Error();
        offset = c.offset;
      } catch (e) {
        if (e instanceof DesktopError) throw e;
        throw new DesktopError(400, "INVALID_REQUEST");
      }
    }
    const items = [];
    for (const row of allowed.slice(offset, offset + limit)) {
      const f = row.fixture;
      const slots = [];
      for (const slot of ["home", "away"] as const) {
        const id = slot === "home" ? f.homeTeamId : f.awayTeamId;
        const [team] = id
          ? await db()
              .select({ id: teams.id, name: teams.name })
              .from(teams)
              .where(
                and(eq(teams.id, id), eq(teams.editionSlug, f.editionSlug)),
              )
          : [];
        slots.push({
          slot,
          resolution: team ? "resolved" : "unresolved",
          team: team ?? null,
          sourceLabel: team ? null : "TBD",
        });
      }
      items.push({
        fixtureId: f.id,
        fixtureRevision: `fixture:${f.version}:${f.assignmentRevision}`,
        edition: {
          slug: f.editionSlug,
          name: row.edition.configuration?.name ?? f.editionSlug,
        },
        round: { id: row.round.id, name: row.round.name },
        label: f.label,
        scheduledAt: f.scheduledAt?.toISOString() ?? null,
        timeZone: f.timeZone,
        status: f.status,
        resultReviewState: row.result?.state ?? null,
        operational:
          f.status !== "cancelled" && slots.every((s) => s.team !== null),
        teams: slots,
        streamingState: "unavailable",
        reviewUrl: `${appUrl()}/admin/tournaments/${encodeURIComponent(f.editionSlug)}/matches/${f.id}`,
      });
    }
    return {
      items,
      collectionRevision,
      nextCursor:
        offset + limit < allowed.length
          ? Buffer.from(
              JSON.stringify({
                subject: actor.osuId,
                revision: collectionRevision,
                offset: offset + limit,
              }),
            ).toString("base64url")
          : null,
    };
  });
}
