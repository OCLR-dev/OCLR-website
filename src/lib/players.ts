import { archiveTeamPlacement } from "./archive-placement";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, readOnlyData } from "@/db";
import {
  captains,
  editionState,
  memberships,
  registrations,
  teams,
  teamCoaches,
  users,
} from "@/db/schema";
import { getPublicEditions } from "./content";
import type { Edition } from "./editions";
import { readTournament } from "./tournaments";
import { HttpError } from "./http-error";
import { parseOsuProfile } from "./osu-profile-model";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import type { ExplicitReadData } from "./explicit-read-contracts";
const filtersSchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    edition: z
      .string()
      .regex(/^[a-z0-9-]*$/)
      .max(80)
      .default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
type PublicPlayerParticipation = ExplicitReadData<"publicPlayerParticipation">;
export type PublishedPlayer = PublicPlayerParticipation[number];
export function publicPlayerFilters(input: unknown, exactOsuId?: number) {
  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Choose a valid player search, edition and page.");
  const filters = parsed.data;
  // A directory always belongs to one edition. Only an individual profile can
  // enumerate that one player's accepted, public tournament participation.
  if (!filters.edition && !exactOsuId)
    throw new HttpError(400, "Choose a tournament to browse its players.");
  if (filters.q.startsWith("https://"))
    filters.q = String(parseOsuProfile(filters.q).osuId);
  return filters;
}
export async function publicPlayers(input: unknown, exactOsuId?: number) {
  const filters = publicPlayerFilters(input, exactOsuId);
  if (!process.env.DATABASE_URL)
    return { rows: [] as PublishedPlayer[], total: 0, filters };
  return readOnlyData(async () => {
    // Post-response callers must recheck the selected edition against saved data.
    const row = filters.edition
      ? await readTournament(filters.edition, db(), true)
      : null;
    const editions = filters.edition
      ? row
        ? [row.edition]
        : []
      : await getPublicEditions();
    return publicPlayersForEditions(filters, editions, exactOsuId);
  });
}

/** Reuse editions already checked in the caller's current read snapshot. */
export async function publicPlayersForEditions(
  filters: ReturnType<typeof publicPlayerFilters>,
  editions: Pick<Edition, "slug" | "name" | "published">[],
  exactOsuId?: number,
) {
  const slugs = editions
    .filter(
      (edition) =>
        edition.published &&
        (!filters.edition || edition.slug === filters.edition),
    )
    .map((edition) => edition.slug);
  if (!slugs.length)
    return { rows: [] as PublishedPlayer[], total: 0, filters };
  return readOnlyData(async () => {
    const tx = db();
    // Acceptance releases minimal identity, not private application contents or
    // unpublished captain/team metadata. Select only the fields intended for release.
    const accepted = await tx
      .select({
        osuId: users.osuId,
        username: users.username,
        editionSlug: registrations.editionSlug,
      })
      .from(registrations)
      .innerJoin(users, eq(users.osuId, registrations.userId))
      .where(
        and(
          inArray(registrations.editionSlug, slugs),
          eq(registrations.status, "accepted"),
          exactOsuId ? eq(registrations.userId, exactOsuId) : undefined,
        ),
      );
    const publishedCaptains = await tx
      .select({
        osuId: users.osuId,
        username: users.username,
        editionSlug: captains.editionSlug,
        teamId: teams.id,
        teamName: teams.name,
      })
      .from(captains)
      .innerJoin(users, eq(users.osuId, captains.userId))
      .leftJoin(
        teams,
        and(
          eq(teams.editionSlug, captains.editionSlug),
          eq(teams.captainId, captains.userId),
          eq(teams.identityPublished, true),
          isNull(teams.archivedAt),
        ),
      )
      .where(
        and(inArray(captains.editionSlug, slugs), eq(captains.published, true)),
      );
    const roster = await tx
      .select({
        osuId: users.osuId,
        username: users.username,
        editionSlug: teams.editionSlug,
        teamId: teams.id,
        teamName: teams.name,
        captainId: teams.captainId,
      })
      .from(teams)
      .innerJoin(
        captains,
        and(
          eq(captains.editionSlug, teams.editionSlug),
          eq(captains.userId, teams.captainId),
          eq(captains.published, true),
        ),
      )
      .innerJoin(
        memberships,
        and(eq(memberships.teamId, teams.id), isNull(memberships.leftAt)),
      )
      .innerJoin(users, eq(users.osuId, memberships.userId))
      .where(
        and(
          inArray(teams.editionSlug, slugs),
          eq(teams.identityPublished, true),
          eq(teams.rosterPublished, true),
          isNotNull(teams.finalizedAt),
          isNull(teams.archivedAt),
        ),
      );
    const byIdentity = new Map<string, PublishedPlayer>(
      accepted.map((p) => [
        `${p.editionSlug}:${p.osuId}`,
        {
          ...p,
          editionName: editions.find((e) => e.slug === p.editionSlug)!.name,
          team: null,
          captain: false,
          participation: "accepted",
        },
      ]),
    );
    for (const p of publishedCaptains) {
      if (!byIdentity.has(`${p.editionSlug}:${p.osuId}`)) continue;
      byIdentity.set(`${p.editionSlug}:${p.osuId}`, {
        osuId: p.osuId,
        username: p.username,
        editionSlug: p.editionSlug,
        editionName: editions.find((e) => e.slug === p.editionSlug)!.name,
        team: p.teamId ? { id: p.teamId, name: p.teamName! } : null,
        captain: true,
        participation: "captain",
      });
    }
    for (const p of roster) {
      if (!byIdentity.has(`${p.editionSlug}:${p.osuId}`)) continue;
      byIdentity.set(`${p.editionSlug}:${p.osuId}`, {
        osuId: p.osuId,
        username: p.username,
        editionSlug: p.editionSlug,
        editionName: editions.find((e) => e.slug === p.editionSlug)!.name,
        team: { id: p.teamId, name: p.teamName },
        captain: p.osuId === p.captainId,
        participation: "finalized_roster",
      });
    }
    const coaches = await tx
      .select({
        osuId: users.osuId,
        username: users.username,
        editionSlug: teams.editionSlug,
        teamId: teams.id,
        teamName: teams.name,
      })
      .from(teamCoaches)
      .innerJoin(users, eq(users.osuId, teamCoaches.userId))
      .innerJoin(teams, eq(teams.id, teamCoaches.teamId))
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
          inArray(teams.editionSlug, slugs),
          eq(teams.identityPublished, true),
          eq(teams.rosterPublished, true),
          isNotNull(teams.finalizedAt),
          isNull(teams.archivedAt),
        ),
      );
    for (const c of coaches) {
      const key = `${c.editionSlug}:${c.osuId}`,
        previous = byIdentity.get(key);
      const team = { id: c.teamId, name: c.teamName };
      byIdentity.set(key, {
        ...(previous ?? {
          osuId: c.osuId,
          username: c.username,
          editionSlug: c.editionSlug,
          editionName: editions.find((e) => e.slug === c.editionSlug)!.name,
          team,
          captain: false,
          participation: "coach" as const,
        }),
        coachedTeams: [...(previous?.coachedTeams ?? []), team],
      });
    }
    const q = filters.q.toLowerCase();
    const aliases = q
      ? await (
          await import("./player-identity")
        ).visiblePlayerNames([...byIdentity.values()].map((p) => p.osuId))
      : [];
    const matching = [...byIdentity.values()]
      .filter((p) =>
        exactOsuId
          ? p.osuId === exactOsuId
          : p.username.toLowerCase().includes(q) ||
            String(p.osuId) === q ||
            aliases.some(
              (n) =>
                n.osuId === p.osuId && n.username.toLowerCase().includes(q),
            ),
      )
      .sort(
        (a, b) =>
          a.editionName.localeCompare(b.editionName) ||
          a.username.localeCompare(b.username) ||
          a.osuId - b.osuId,
      );
    return {
      // Legacy page parameters remain valid, but never hide directory entries.
      rows: matching,
      total: matching.length,
      filters,
    };
  });
}
async function databasePublicPlayer(
  osuId: number,
  edition?: string,
): Promise<PublicPlayerParticipation> {
  const rows = (await publicPlayers(edition ? { edition } : {}, osuId)).rows;
  const byEdition = new Map(rows.map((p) => [p.editionSlug, [p]]));
  for (const e of await getPublicEditions()) {
    if ((edition && e.slug !== edition) || !e.archive) continue;
    const people = [
      ...e.archive.players.filter((p) => p.osuId === osuId),
      ...(e.archive.rosterReplacements ?? []).flatMap((r) =>
        r.people
          .filter((p) => p.osuId === osuId)
          .map((p) => ({
            ...p,
            teamId: r.teamId,
            role: "player" as const,
            tier: r.tier,
            sourceRole: undefined,
          })),
      ),
    ];
    if (!people.length) continue;
    // Archives are authoritative for their editions. Never double-count a UID
    // that also occurs in imported/native tables, and retain the literal name.
    const facts = new Map<string, PublishedPlayer>();
    for (const person of people) {
      const team = e.archive.teams.find((t) => t.id === person.teamId);
      const key = JSON.stringify([person.username, person.role, person.teamId]);
      if (facts.has(key)) continue;
      facts.set(key, {
        osuId,
        username: person.username,
        editionSlug: e.slug,
        editionName: e.name,
        team: team ? { id: team.id, name: team.name } : null,
        captain: person.role === "captain",
        participation: "historical",
        role: person.role,
        source: {
          kind: "historical_archive",
          revision: null,
          updatedAt: null,
          capturedOn: e.archive.capturedOn,
        },
        tier: person.tier,
        sourceRole: person.sourceRole,
        sourceReference: person.source,
        placingRange: archiveTeamPlacement(e.archive, person.teamId),
        placing: (() => {
          const p = archiveTeamPlacement(e.archive!, person.teamId);
          if (p) return p.start === p.end ? p.start : null;
          const legacy = e.archive!.standings.find(
            (s) => s.teamId === person.teamId,
          );
          return legacy && legacy.scope === undefined ? legacy.rank : null;
        })(),
      });
    }
    byEdition.set(e.slug, [...facts.values()]);
  }
  return [...byEdition.values()].flat();
}
/** Publication can be withdrawn while provider I/O runs. Re-check only whether
 * the same public listing still exists, without rebuilding the full record.
 * Mirrors the identity sources in `publicPlayers`: accepted registrations,
 * archived people, or a published team's coach. Captains and roster members
 * only augment identities that already exist and cannot create one. */
export async function publicPlayerStillListed(
  osuId: number,
  edition?: string,
): Promise<boolean> {
  if (remoteMode()) return (await publicPlayer(osuId, edition)).length > 0;
  const editions = (await getPublicEditions()).filter(
    (e) => !edition || e.slug === edition,
  );
  if (!editions.length) return false;
  const archived = editions.some(
    (e) =>
      e.archive &&
      (e.archive.players.some((p) => p.osuId === osuId) ||
        (e.archive.rosterReplacements ?? []).some((r) =>
          r.people.some((p) => p.osuId === osuId),
        )),
  );
  if (archived) return true;
  const slugs = editions.map((e) => e.slug);
  return db().transaction(
    async (tx) => {
      const [accepted] = await tx
        .select({ osuId: registrations.userId })
        .from(registrations)
        .innerJoin(users, eq(users.osuId, registrations.userId))
        .where(
          and(
            inArray(registrations.editionSlug, slugs),
            eq(registrations.status, "accepted"),
            eq(registrations.userId, osuId),
          ),
        )
        .limit(1);
      if (accepted) return true;
      const [coach] = await tx
        .select({ osuId: teamCoaches.userId })
        .from(teamCoaches)
        .innerJoin(users, eq(users.osuId, teamCoaches.userId))
        .innerJoin(teams, eq(teams.id, teamCoaches.teamId))
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
            inArray(teams.editionSlug, slugs),
            eq(teams.identityPublished, true),
            eq(teams.rosterPublished, true),
            isNotNull(teams.finalizedAt),
            isNull(teams.archivedAt),
            eq(teamCoaches.userId, osuId),
          ),
        )
        .limit(1);
      return Boolean(coach);
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function publicPlayer(
  osuId: number,
  edition?: string,
): Promise<PublicPlayerParticipation> {
  return remoteMode()
    ? frontendResource("publicPlayerParticipation", {
        osuId,
        ...(edition ? { edition } : {}),
      })
    : databasePublicPlayer(osuId, edition);
}

/** Same accepted/public boundary as the directory; never count private applications. */
export async function publicParticipantCount(slug: string) {
  if (!process.env.DATABASE_URL) return null;
  const [row] = await db()
    .select({ total: count(registrations.id) })
    .from(editionState)
    .leftJoin(
      registrations,
      and(
        eq(registrations.editionSlug, editionState.slug),
        eq(registrations.status, "accepted"),
      ),
    )
    .where(
      and(
        eq(editionState.slug, slug),
        sql`${editionState.configuration}->>'published' = 'true'`,
      ),
    )
    .groupBy(editionState.slug);
  return row?.total ?? null;
}
