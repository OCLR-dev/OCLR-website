import { compareTournamentSeasons } from "./tournament-order";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { draftSessions } from "@/db/schema";
import {
  readTournament,
  readTournaments,
  publicEditionSummary,
} from "./tournaments";
import { registrationAvailability } from "./registrations";
import { privacyContact } from "./auth/config";
import { readSiteSettings } from "./site-settings";
import { type Edition } from "./editions";
import { publicPlayers } from "./players";
import { publicPlayerIntroductions } from "./player-messages";
import { cachedDirectoryStatistics } from "./osu-profiles";
import { parseOsuProfile, type ProfileMode } from "./osu-profile-model";
import { readSavedPlayerProfile } from "./player-profiles";
import { defaultLocale, locales } from "@/i18n/config";
import { profileBws } from "./bws";
import { publishedTeams } from "./teams";
import { publicMappools } from "./mappools";
import { publicStaff } from "./public-staff";
import { publicDraft } from "./draft";
import { publicCompetition } from "./public-competition";
import { draftAwardTiers, awardTierLabel } from "./award-tiers";
import { archiveCounts, type HistoricalArchive } from "./historical-archive";
import {
  historicalRulebook,
  historicalRulebookSeason,
} from "./historical-rulebooks";
import { archiveKeyVisual } from "./archive-key-visual";
import { informationPreview } from "./tournament-information";
import { eventPreview } from "./event-preview";
import { DeveloperApiError } from "./developer-api";
import {
  historicalOverviewSchema,
  publicTournamentSchema,
  publicTournamentSummarySchema,
  publicPlayerSchema,
  publicPlayerProfileSchema,
  privateTournamentSchema,
  privateTournamentSummarySchema,
  savedProfileSchema,
  savedOsuProfileSchema,
  siteSchema,
  type ReadDataSource,
  type PublicPlayer,
  type PublicTournament,
} from "./read-api-contract";

type StoredTournament = NonNullable<Awaited<ReturnType<typeof readTournament>>>;
export function editionDataSource(row: StoredTournament): ReadDataSource {
  return {
    kind: row.edition.archive
      ? "historical_archive"
      : informationPreview(row.edition.slug)
        ? "preview"
        : "database",
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    capturedOn: row.edition.archive?.capturedOn ?? null,
  };
}
/** Server-only common context. API callers must project through the schemas below. */
export async function publicEditionContext(slug: string) {
  if (!process.env.DATABASE_URL)
    throw new DeveloperApiError(404, "NOT_FOUND", "Tournament not found.");
  const row = await readTournament(slug, db(), true);
  if (!row)
    throw new DeveloperApiError(404, "NOT_FOUND", "Tournament not found.");
  return { ...row, source: editionDataSource(row) };
}
export function historicalTournamentOverview(
  edition: Edition,
  archive: HistoricalArchive,
) {
  const { teams, players, results, pools, maps } = archiveCounts(archive);
  return historicalOverviewSchema.parse({
    kind: "historical_archive",
    counts: { teams, players, results, pools, maps },
    keyVisual: archiveKeyVisual(archive, edition.branding.keyVisual) ?? null,
    rulebook: historicalRulebook(archive, edition.rules),
    rulebookSeason: historicalRulebook(archive, edition.rules)
      ? (historicalRulebookSeason(
          historicalRulebook(archive, edition.rules)!,
        ) ?? null)
      : null,
  });
}
async function summary(row: StoredTournament) {
  const fields = publicEditionSummary(
    row.edition,
    await registrationAvailability(row.edition),
  );
  return publicTournamentSummarySchema.parse({
    source: editionDataSource(row),
    slug: fields.slug,
    name: fields.name,
    season: fields.season,
    summary: fields.summary,
    status: fields.status,
    timeZone: fields.timeZone,
    branding: {
      ...fields.branding,
      logo:
        fields.branding.logo ??
        (row.edition.archive
          ? (archiveKeyVisual(row.edition.archive, null)?.src ?? null)
          : null),
    },
    defaultAppearance: row.edition.defaultAppearance ?? null,
    registration: fields.registration,
  });
}
export async function publicTournamentListModel() {
  const rows = await readTournaments(true);
  const output = [];
  for (const row of rows) output.push(await summary(row));
  return output.sort(compareTournamentSeasons);
}
export async function privateTournamentListModel() {
  const output = [];
  for (const row of await readTournaments())
    output.push(
      privateTournamentSummarySchema.parse({
        ...(await summary(row)),
        published: row.edition.published,
        registrationPaused: row.registrationPaused,
      }),
    );
  return output.sort(compareTournamentSeasons);
}
export async function privateTournamentModel(slug: string) {
  const row = await readTournament(slug);
  if (!row)
    throw new DeveloperApiError(404, "NOT_FOUND", "Tournament not found.");
  const { archive, ...configuration } = row.edition;
  return privateTournamentSchema.parse({
    source: editionDataSource(row),
    configuration,
    registrationPaused: row.registrationPaused,
    archive: archive
      ? {
          sourceUrl: archive.sourceUrl,
          capturedOn: archive.capturedOn,
          counts: historicalTournamentOverview(row.edition, archive).counts,
        }
      : null,
  });
}
export async function publicSiteModel() {
  const settings = await readSiteSettings();
  return siteSchema.parse({
    name: "osu! Chinese League Rookie (OCLR)",
    defaultAppearance: settings.defaultAppearance,
    defaultLocale,
    locales: [...locales],
    privacyContact: privacyContact(),
  });
}
/** Calls may contain nested transactions. Serial execution preserves savepoint isolation. */
async function databaseOverview(
  slug: string,
): Promise<Extract<PublicTournament["overview"], { kind: "database" }>> {
  const unavailable: Extract<
    PublicTournament["overview"],
    { kind: "database" }
  >["unavailable"] = [];
  async function load<T>(
    name: (typeof unavailable)[number],
    read: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await read();
    } catch {
      unavailable.push(name);
      return fallback;
    }
  }
  const teams = await load("teams", () => publishedTeams(slug), []);
  const pools = await load("pools", () => publicMappools(slug), []);
  const staff = await load("staff", publicStaff, []);
  const draft = await load("draft", () => publicDraft(slug), null);
  const competition = await load(
    "competition",
    () => publicCompetition(slug),
    null,
  );
  const next = competition?.fixtures
    .filter((fixture) => !fixture.result && fixture.status !== "cancelled")
    .sort((a, b) =>
      (a.scheduledAt ?? "9999").localeCompare(b.scheduledAt ?? "9999"),
    )[0];
  const organization = new Map<string, { name: string; href: string }[]>();
  for (const person of staff)
    for (const grant of person.roles) {
      if (grant.edition && grant.edition.slug !== slug) continue;
      const members = organization.get(grant.role) ?? [];
      const href = `https://osu.ppy.sh/users/${person.osuId}`;
      if (!members.some((member) => member.href === href))
        members.push({ name: person.username, href });
      organization.set(grant.role, members);
    }
  return {
    kind: "database",
    unavailable,
    hasFixtures: Boolean(competition?.fixtures.length),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      captainId: team.captainId,
      captainName: team.captainName,
      members:
        team.members?.map((person) => ({
          osuId: person.osuId,
          username: person.username,
        })) ?? null,
    })),
    pools: pools.map((pool) => ({
      id: pool.id,
      roundName: pool.roundName,
      entries: pool.entries.map((entry) => ({
        category: entry.category,
        title: `${entry.metadata.artist} — ${entry.metadata.title} [${entry.metadata.difficulty}]`,
        href: `https://osu.ppy.sh/beatmaps/${entry.beatmapId}`,
      })),
    })),
    organization: [...organization].map(([role, members]) => ({
      role,
      members,
    })),
    draft: draft ? { state: draft.state } : null,
    nextFixture: next
      ? {
          id: next.id,
          roundName: next.roundName,
          scheduledAt: next.scheduledAt,
        }
      : null,
  };
}
export async function publicTournamentModel(slug: string) {
  const row = await publicEditionContext(slug);
  const preview = informationPreview(slug);
  const overview = row.edition.archive
    ? historicalTournamentOverview(row.edition, row.edition.archive)
    : preview
      ? { kind: "preview" as const, document: preview }
      : await databaseOverview(slug);
  const publicFields = publicEditionSummary(
    row.edition,
    await registrationAvailability(row.edition),
  );
  return publicTournamentSchema.parse({
    ...(await summary(row)),
    rules: publicFields.rules,
    eligibility: publicFields.eligibility,
    automaticEligibility: publicFields.automaticEligibility,
    rankGraceRange: publicFields.rankGraceRange,
    schedule: publicFields.schedule,
    overview,
  });
}
/** Source choice is shared with historical SSR; current cache never overwrites history. */
export function historicalPlayerModel(
  edition: Edition,
  archive: HistoricalArchive,
  source: ReadDataSource,
) {
  return archive.players.map((player) =>
    publicPlayerSchema.parse({
      source,
      osuId: player.osuId,
      username: player.username,
      editionSlug: edition.slug,
      editionName: edition.name,
      team: player.teamId
        ? {
            id: player.teamId,
            name: archive.teams.find((team) => team.id === player.teamId)!.name,
          }
        : null,
      captain: player.role === "captain",
      role: player.role,
      participation: "historical",
      coachedTeams: [],
      tier: player.tier,
      tierLabel: player.tier === null ? null : awardTierLabel(player.tier),
      bio: null,
      statistics: {
        globalRank: null,
        pp: null,
        fetchedAt: null,
        state: "not_recorded",
      },
    }),
  );
}
async function releasedTiers(
  slug: string,
  identities: { osuId: number; captain: boolean }[],
) {
  const captainIds = identities
    .filter((player) => player.captain)
    .map((player) => player.osuId);
  const snapshot = await publicDraft(slug);
  if (!snapshot) return new Map(captainIds.map((id) => [id, 0]));
  const [session] = await db()
    .select({
      turnSequence: draftSessions.turnSequence,
      revision: draftSessions.version,
      publishedRevision: draftSessions.publishedRevision,
    })
    .from(draftSessions)
    .where(eq(draftSessions.editionSlug, slug));
  // Older held-back snapshots do not establish the current custom turn sequence.
  const picks =
    snapshot && session?.revision === session.publishedRevision
      ? snapshot.picks.map((pick) => ({
          playerId: pick.player.osuId,
          teamId: pick.team.id,
          turnIndex: pick.turnIndex,
        }))
      : [];
  return new Map(
    draftAwardTiers(session?.turnSequence ?? [], picks, captainIds).map(
      (tier) => [tier.userId, tier.tier],
    ),
  );
}
/** Full SSR list, with bounded saved-cache reads and no provider refresh/claims. */
export async function publicPlayerDirectoryModel(slug: string, q = "") {
  const row = await publicEditionContext(slug);
  if (row.edition.archive) {
    const all = historicalPlayerModel(
      row.edition,
      row.edition.archive,
      row.source,
    );
    const aliases = await (
      await import("./player-identity")
    ).visiblePlayerNames(all.map((p) => p.osuId));
    return {
      source: row.source,
      rows: all
        .map((player) => ({
          ...player,
          previousUsernames: [
            ...new Set(
              aliases
                .filter((n) => n.osuId === player.osuId)
                .map((n) => n.username),
            ),
          ],
        }))
        .filter(
          (player) =>
            `${player.username} ${player.osuId} ${player.team?.name ?? ""}`
              .toLowerCase()
              .includes(q.trim().toLowerCase()) ||
            aliases.some(
              (n) =>
                n.osuId === player.osuId &&
                n.username.toLowerCase().includes(q.trim().toLowerCase()),
            ),
        ),
      refreshIds: [] as number[],
      order: "archive-source" as const,
    };
  }
  const preview = eventPreview(slug);
  if (preview)
    return {
      source: row.source,
      rows: preview.players
        .filter((p) =>
          `${p.name} ${p.id} ${p.team ?? ""}`
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
        )
        .map((p) =>
          publicPlayerSchema.parse({
            source: row.source,
            osuId: p.id,
            username: p.name,
            editionSlug: slug,
            editionName: row.edition.name,
            team: p.team ? { id: p.team, name: p.team } : null,
            captain: p.captain,
            role: p.captain ? "captain" : "player",
            participation: "accepted",
            coachedTeams: [],
            tier: null,
            tierLabel: null,
            bio: p.bio ?? null,
            statistics: {
              globalRank: p.rank,
              pp: p.pp,
              fetchedAt: null,
              state: "preview",
            },
          }),
        ),
      refreshIds: [] as number[],
      order: "preview-source" as const,
    };
  const result = await publicPlayers({ edition: slug, q });
  const aliases = await (
    await import("./player-identity")
  ).visiblePlayerNames(result.rows.map((p) => p.osuId));
  let statisticsUnavailable = false;
  const { statistics, refreshIds } = await cachedDirectoryStatistics(
    result.rows.map((player) => player.osuId),
  ).catch(() => {
    statisticsUnavailable = true;
    return { statistics: new Map(), refreshIds: [] as number[] };
  });
  const introductions = await publicPlayerIntroductions(
    slug,
    result.rows.map((player) => player.osuId),
    row.edition.registration?.publicIntroductionQuestionId,
  );
  const tiers = await releasedTiers(slug, result.rows);
  return {
    source: row.source,
    refreshIds,
    order: "username-then-osu-id" as const,
    rows: result.rows.map((player): PublicPlayer => {
      const saved = statistics.get(player.osuId);
      const tier = tiers.get(player.osuId) ?? null;
      return publicPlayerSchema.parse({
        ...player,
        previousUsernames: aliases
          .filter((n) => n.osuId === player.osuId)
          .map((n) => n.username),
        role:
          player.participation === "coach"
            ? "coach"
            : player.captain
              ? "captain"
              : "player",
        source: row.source,
        coachedTeams: player.coachedTeams ?? [],
        tier,
        tierLabel: tier === null ? null : awardTierLabel(tier),
        bio: introductions.get(player.osuId) ?? null,
        statistics: {
          globalRank:
            saved?.globalRank && saved.globalRank > 0 ? saved.globalRank : null,
          pp: saved?.pp ?? null,
          fetchedAt: saved?.fetchedAt ?? null,
          state: saved
            ? saved.stale
              ? "stale"
              : "fresh"
            : statisticsUnavailable
              ? "unavailable"
              : "missing",
        },
      });
    }),
  };
}
export async function savedProfileModel(osuId: number, mode: ProfileMode) {
  const snapshot = await readSavedPlayerProfile(osuId, mode);
  const parsed = savedOsuProfileSchema.safeParse(snapshot?.profile);
  if (
    !snapshot ||
    !parsed.success ||
    parsed.data.osuId !== osuId ||
    parsed.data.ruleset !== mode
  )
    throw new DeveloperApiError(
      404,
      "PROFILE_SNAPSHOT_NOT_FOUND",
      "No saved profile is available.",
    );
  return savedProfileSchema.parse({
    source: {
      kind: "saved_profile",
      revision: null,
      updatedAt: parsed.data.fetchedAt,
      capturedOn: null,
    },
    state: snapshot.stale ? "stale" : "fresh",
    profile: parsed.data,
  });
}
export async function publicPlayerProfileModel(
  slug: string,
  input: string,
  mode: ProfileMode,
) {
  const identity = parseOsuProfile(input, mode);
  const { rows } = await publicPlayerDirectoryModel(slug);
  const player = rows.find((candidate) => candidate.osuId === identity.osuId);
  if (!player)
    throw new DeveloperApiError(
      404,
      "NOT_FOUND",
      "Published player not found.",
    );
  let snapshot = null;
  let bws = null;
  if (player.source.kind === "database") {
    try {
      snapshot = await savedProfileModel(identity.osuId, mode);
    } catch (error) {
      if (
        !(error instanceof DeveloperApiError) ||
        error.code !== "PROFILE_SNAPSHOT_NOT_FOUND"
      )
        throw error;
    }
    if (snapshot && mode === "osu")
      bws = await profileBws(
        {
          profile: snapshot.profile,
          stale: snapshot.state === "stale",
          notice: null,
        },
        slug,
      );
  }
  return publicPlayerProfileSchema.parse({
    player,
    requestedMode: mode,
    snapshot,
    bws,
  });
}
