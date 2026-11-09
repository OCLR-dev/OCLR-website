import { db } from "@/db";
import { draftSessions, editionState, registrations, teams } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { tournamentNavigation } from "./admin-navigation";
import { archiveEditionStates } from "./archive-relations";
import { supportsArchiveStatistics } from "./archive-statistics-model";
import { privacyReady } from "./auth/config";
import type { User } from "./auth/sessions";
import { assertReadCapability, canRead, permits, staffAccess } from "./auth/staff";
import type { SavedTournament } from "./configuration-read-contracts";
import { remoteMode } from "./data-source";
import {
  editionSchema,
  enrollmentState,
  normalizeEditionBranding,
  type Edition,
} from "./editions";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { publicHistoricalArchive } from "./historical-archive";
import { HttpError } from "./http-error";
import { compareTournamentSeasons } from "./tournament-order";

type Reader = Pick<ReturnType<typeof db>, "select">;
export function storedEdition(
  row: typeof editionState.$inferSelect,
): SavedTournament | undefined {
  if (!row.configuration) return undefined;
  return {
    edition: editionSchema.parse(
      normalizeEditionBranding({ ...row.configuration, slug: row.slug }),
    ),
    revision: row.configurationVersion,
    createdAt: row.createdAt,
    updatedAt: row.configurationUpdatedAt,
    registrationPaused: Boolean(row.registrationPausedAt),
  };
}
export async function readTournament(
  slug: string,
  reader?: Reader,
  publicOnly = false,
): Promise<SavedTournament | undefined> {
  if (remoteMode())
    return frontendResource<SavedTournament | undefined>(
      publicOnly ? "publicEnrollment" : "privateSavedTournament",
      { slug },
    );
  const [row] = await archiveEditionStates(reader ?? db(), publicOnly, slug);
  const saved = row ? storedEdition(row) : undefined;
  return saved && publicOnly && saved.edition.archive
    ? {
        ...saved,
        edition: {
          ...saved.edition,
          archive: publicHistoricalArchive(saved.edition.archive),
        },
      }
    : saved;
}
export async function readTournaments(publicOnly = false) {
  if (!process.env.DATABASE_URL) return [];
  const rows = await archiveEditionStates(db(), publicOnly);
  const result: SavedTournament[] = [];
  for (const row of rows) {
    const saved = storedEdition(row)!;
    result.push(
      publicOnly && saved.edition.archive
        ? {
            ...saved,
            edition: {
              ...saved.edition,
              archive: publicHistoricalArchive(saved.edition.archive),
            },
          }
        : saved,
    );
  }
  return result;
}

export function tournamentReadiness(e: Edition, locked = false) {
  return [
    { label: "Registration dates", ready: Boolean(e.registration) },
    { label: "Privacy configuration", ready: privacyReady() },
    {
      label: "Registration unlocked",
      ready: !locked && e.status !== "completed",
    },
  ];
}
export function tournamentLinks(
  grants: Awaited<ReturnType<typeof staffAccess>>,
  slug: string,
) {
  const can = (cap: Parameters<typeof permits>[1]) =>
    canRead(grants, cap, slug);
  return tournamentNavigation.flatMap((group) =>
    group.items
      .filter(
        (item) =>
          (!item.capabilities || item.capabilities.some(can)) &&
          (item.path !== "statistics" || supportsArchiveStatistics(slug)),
      )
      .map((item) => ({
        href: `/admin/tournaments/${slug}${item.path ? `/${item.path}` : ""}`,
        label: item.label,
        group: group.label,
        exact: item.path === "",
      })),
  );
}
type TournamentList =
  import("./explicit-read-contracts").ExplicitReadData<"tournamentList">;
async function databaseTournamentList(actor: User): Promise<TournamentList> {
  const grants = await staffAccess(actor);
  if (!grants.length) throw new HttpError(403, "Staff access is required.");
  const rows = await readTournaments();
  return {
    canCreate: permits(grants, "configure_tournament"),
    rows: rows
      .filter((row) =>
        grants.some(
          (g) => !g.editionSlug || g.editionSlug === row.edition.slug,
        ),
      )
      .map((row) => ({
        slug: row.edition.slug,
        name: row.edition.name,
        season: row.edition.season,
        status: row.edition.status,
        published: row.edition.published,
        registrationState: !row.edition.registration
          ? "not_configured"
          : row.registrationPaused || row.edition.status === "completed"
            ? "closed"
            : row.edition.registration.enabled === false
              ? "paused"
              : enrollmentState(row.edition) === "open" && !privacyReady()
                ? "unavailable"
                : enrollmentState(row.edition),
        registration: row.edition.registration
          ? {
              opensAt: row.edition.registration.opensAt,
              closesAt: row.edition.registration.closesAt,
            }
          : null,
        timeZone: row.edition.timeZone,
        updatedAt: row.updatedAt,
        links: tournamentLinks(grants, row.edition.slug),
      }))
      .sort(compareTournamentSeasons),
  };
}
export async function tournamentList(actor: User): Promise<TournamentList> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<TournamentList>("tournamentList");
  }
  return databaseTournamentList(actor);
}

export async function competitionStructureProtected(
  slug: string,
  locked: boolean,
  reader: Reader,
) {
  if (locked) return true;
  const [session] = await reader
    .select({ state: draftSessions.state })
    .from(draftSessions)
    .where(eq(draftSessions.editionSlug, slug));
  const [finalTeam] = await reader
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.editionSlug, slug), isNotNull(teams.finalizedAt)))
    .limit(1);
  return (
    Boolean(finalTeam) ||
    Boolean(session && !["setup", "aborted"].includes(session.state))
  );
}
type TournamentForAdmin = ExplicitReadData<"tournamentForAdmin">;
async function databaseTournamentForAdmin(
  actor: User,
  slug: string,
): Promise<TournamentForAdmin> {
  await assertReadCapability(actor, "configure_tournament", slug);
  const row = await readTournament(slug);
  if (!row) throw new HttpError(404, "Tournament not found.");
  const [applications] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .where(eq(registrations.editionSlug, slug));
  return {
    ...row,
    applications: applications.count,
    readiness: tournamentReadiness(row.edition, row.registrationPaused),
    links: tournamentLinks(await staffAccess(actor), slug),
  };
}
export async function tournamentForAdmin(
  actor: User,
  slug: string,
): Promise<TournamentForAdmin> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<TournamentForAdmin>("tournamentForAdmin", { slug });
  }
  return databaseTournamentForAdmin(actor, slug);
}

export function publicEditionSummary(
  e: Edition,
  availability: ReturnType<typeof enrollmentState> | "unavailable",
) {
  return {
    slug: e.slug,
    name: e.name,
    season: e.season,
    summary: e.summary,
    status: e.status,
    timeZone: e.timeZone,
    branding: e.branding,
    rules: e.rules,
    eligibility: e.eligibility,
    automaticEligibility: e.automaticEligibility ?? null,
    rankGraceRange: e.rankGraceRange ?? null,
    schedule: e.schedule,
    registration: e.registration
      ? {
          opensAt: e.registration.opensAt,
          closesAt: e.registration.closesAt,
          withdrawUntil: e.registration.withdrawUntil,
          state: availability,
        }
      : null,
  };
}

/** Only public or actor-authorized cosmetic defaults leave the server. */
export async function tournamentAppearanceScopes(actor: User | null) {
  if (!process.env.DATABASE_URL) return [];
  try {
    const grants = actor ? await staffAccess(actor) : [];
    return (await readTournaments()).flatMap(({ edition }) => {
      const staff = grants.some(
        (g) => !g.editionSlug || g.editionSlug === edition.slug,
      );
      return edition.published || staff
        ? [
            {
              slug: edition.slug,
              defaultAppearance: edition.defaultAppearance ?? null,
              published: edition.published,
              staff,
            },
          ]
        : [];
    });
  } catch {
    console.error(
      "Tournament appearance defaults are temporarily unavailable.",
    );
    return [];
  }
}
