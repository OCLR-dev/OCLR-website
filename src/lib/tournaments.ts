import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { editionState } from "@/db/schema";
import { editionSchema } from "./editions";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { suggestEditionSlug } from "./editions";
import {
  editionEvents,
  editionRevisions,
  registrations,
  draftSessions,
  teams,
  tournamentStages,
} from "@/db/schema";
import {
  assertReadCapability,
  assertCapability,
  staffAccess,
  permits,
  canRead,
} from "./auth/staff";
import type { User } from "./auth/sessions";
import { privacyReady } from "./auth/config";
import { HttpError } from "./http";
import {
  enrollmentState,
  registrationBlockers,
  type Edition,
} from "./editions";
import { compareTournamentSeasons } from "./tournament-order";
import { tournamentNavigation } from "./admin-navigation";
type Reader = Pick<ReturnType<typeof db>, "select">;
export function storedEdition(row: typeof editionState.$inferSelect) {
  if (!row.configuration) return undefined;
  return {
    edition: editionSchema.parse({ ...row.configuration, slug: row.slug }),
    revision: row.configurationVersion,
    createdAt: row.createdAt,
    updatedAt: row.configurationUpdatedAt,
    registrationPaused: Boolean(row.registrationPausedAt),
  };
}
export async function readTournament(
  slug: string,
  reader: Reader = db(),
  publicOnly = false,
) {
  const [row] = await reader
    .select()
    .from(editionState)
    .where(
      and(
        eq(editionState.slug, slug),
        isNotNull(editionState.configuration),
        publicOnly
          ? sql`${editionState.configuration}->>'published' = 'true'`
          : undefined,
      ),
    );
  return row ? storedEdition(row) : undefined;
}
export async function readTournaments(publicOnly = false) {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db()
    .select()
    .from(editionState)
    .where(
      and(
        isNotNull(editionState.configuration),
        publicOnly
          ? sql`${editionState.configuration}->>'published' = 'true'`
          : undefined,
      ),
    )
    .orderBy(desc(editionState.configurationUpdatedAt), editionState.slug);
  return rows.map((row) => storedEdition(row)!);
}

const shape = editionSchema.shape;
const identity = {
  name: shape.name,
  season: shape.season,
  summary: shape.summary,
  timeZone: shape.timeZone,
  branding: shape.branding,
  defaultAppearance: shape.defaultAppearance,
};
const version = {
  expectedRevision: z.number().int().nonnegative(),
  confirmed: z.literal(true),
};
const createSchema = z
  .object({
    ...identity,
    slug: shape.slug
      .refine((s) => s !== "new", "This slug is reserved")
      .optional(),
    summary: shape.summary.default(""),
    timeZone: shape.timeZone.default("UTC"),
    confirmed: z.literal(true),
  })
  .strict();
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...version,
      action: z.literal("archive"),
      archive: shape.archive.unwrap(),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("enrollment"),
      paused: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("general"),
      ...identity,
      status: shape.status,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("rules"),
      rules: shape.rules,
      eligibility: shape.eligibility,
      automaticEligibility: shape.automaticEligibility,
      rankGraceRange: shape.rankGraceRange,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("registration"),
      registration: shape.registration,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("schedule"),
      schedule: shape.schedule,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("publication"),
      published: z.boolean(),
    })
    .strict(),
]);
function invalid(parsed: { success: boolean; error?: z.ZodError }) {
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error?.issues[0]
        ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
        : "Check the tournament settings.",
    );
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
          (item.path !== "statistics" ||
            ["s7", "s8", "s9", "s10"].includes(slug)),
      )
      .map((item) => ({
        href: `/admin/tournaments/${slug}${item.path ? `/${item.path}` : ""}`,
        label: item.label,
        group: group.label,
        exact: item.path === "",
      })),
  );
}
export async function tournamentList(actor: User) {
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
export async function tournamentForAdmin(actor: User, slug: string) {
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
export async function createTournament(actor: User, input: unknown) {
  await assertCapability(actor, "configure_tournament");
  const parsed = createSchema.safeParse(input);
  invalid(parsed);
  if (!parsed.success) throw new HttpError(400, "Invalid tournament.");
  const { slug: requestedSlug, confirmed: _confirmed, ...fields } = parsed.data;
  const slug =
    requestedSlug ??
    (suggestEditionSlug(fields.name) || `oclr-${randomUUID().slice(0, 8)}`);
  void _confirmed;
  const e = editionSchema.parse({
    slug,
    ...fields,
    published: false,
    status: "upcoming",
    rules: null,
    eligibility: null,
    registration: null,
    schedule: [],
  });
  const { slug: _slug, ...configuration } = e;
  void _slug;
  try {
    await db().transaction(async (tx) => {
      await assertCapability(actor, "configure_tournament", undefined, tx);
      await tx.insert(editionState).values({ slug, configuration });
      await tx
        .insert(editionRevisions)
        .values({ editionSlug: slug, version: 0, configuration });
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "tournament_create",
        detail: {
          entity: { type: "tournament", id: slug },
          before: null,
          after: { configuration, revision: 0 },
        },
      });
    });
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505")
      throw new HttpError(409, "That tournament slug already exists.");
    throw error;
  }
  return tournamentForAdmin(actor, slug);
}
export async function tournamentCommand(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "configure_tournament", slug);
  const parsed = commandSchema.safeParse(input);
  invalid(parsed);
  if (!parsed.success) throw new HttpError(400, "Invalid settings.");
  const c = parsed.data;
  await db().transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    const current = state && storedEdition(state);
    if (!current) throw new HttpError(404, "Tournament not found.");
    await assertCapability(actor, "configure_tournament", slug, tx);
    if (current.revision !== c.expectedRevision)
      throw new HttpError(
        409,
        "Tournament settings changed. Refresh before saving your changes.",
      );
    // Draft locks protect roster/pick structure, not versioned tournament content.
    // Existing applications keep their original revision and acknowledgments.
    const e = current.edition;
    let next: Edition = e;
    let registrationPausedAt = state.registrationPausedAt;
    if (c.action === "archive") {
      if (e.published || e.status !== "completed" || e.registration)
        throw new HttpError(
          409,
          "Import archives into an unpublished, completed tournament without registration.",
        );
      // Serialize with live setup writers. Never disguise operational history as an archive.
      for (const table of [
        registrations,
        teams,
        draftSessions,
        tournamentStages,
      ]) {
        const rows = await tx
          .select({ slug: table.editionSlug })
          .from(table)
          .where(eq(table.editionSlug, slug))
          .limit(1);
        if (rows.length)
          throw new HttpError(
            409,
            "This tournament already has live competition data. Use a separate historical edition.",
          );
      }
      next = { ...e, archive: c.archive };
    }
    if (c.action === "enrollment") {
      if (!c.paused) {
        const blockers = registrationBlockers(e, privacyReady());
        if (blockers.length || !e.registration)
          throw new HttpError(
            409,
            blockers.join(" ") || "Configure registration dates first.",
          );
      }
      registrationPausedAt = c.paused
        ? (state.registrationPausedAt ?? new Date())
        : null;
    }
    const revisions = await tx
      .select()
      .from(editionRevisions)
      .where(eq(editionRevisions.editionSlug, slug));
    if (c.action === "general")
      next = {
        ...e,
        name: c.name,
        season: c.season,
        summary: c.summary,
        status: c.status,
        timeZone: c.timeZone,
        branding: c.branding,
        ...(c.defaultAppearance !== undefined
          ? { defaultAppearance: c.defaultAppearance }
          : {}),
        registration:
          e.registration && c.status === "completed"
            ? { ...e.registration, enabled: false }
            : e.registration,
      };
    if (c.action === "rules") {
      if (
        c.rules &&
        revisions.some(
          (r) =>
            r.configuration.rules?.version === c.rules?.version &&
            !isDeepStrictEqual(r.configuration.rules, c.rules),
        )
      ) {
        throw new HttpError(
          409,
          "Use a new rules version when changing previously saved rules. Historical acknowledgments are preserved.",
        );
      }
      next = {
        ...e,
        rules: c.rules,
        eligibility: c.eligibility,
        automaticEligibility: c.automaticEligibility ?? null,
        rankGraceRange:
          c.rankGraceRange === undefined ? e.rankGraceRange : c.rankGraceRange,
      };
    }
    if (c.action === "registration") {
      if (c.registration?.enabled) {
        const blockers = registrationBlockers(e, privacyReady());
        if (blockers.length) throw new HttpError(409, blockers.join(" "));
      }
      next = { ...e, registration: c.registration };
    }
    if (c.action === "schedule") next = { ...e, schedule: c.schedule };
    if (c.action === "publication")
      next = {
        ...e,
        published: c.published,
        registration:
          e.registration && (!c.published || !e.published)
            ? { ...e.registration, enabled: false }
            : e.registration,
      };
    const validated = editionSchema.safeParse(next);
    invalid(validated);
    if (!validated.success)
      throw new HttpError(400, "Check the tournament settings.");
    next = validated.data;
    const { slug: _slug, ...configuration } = next;
    void _slug;
    if (
      isDeepStrictEqual(next, e) &&
      Boolean(registrationPausedAt) === Boolean(state.registrationPausedAt)
    )
      return;
    const revision = current.revision + 1;
    await tx
      .insert(editionRevisions)
      .values({ editionSlug: slug, version: revision, configuration });
    await tx
      .update(editionState)
      .set({
        configuration,
        configurationVersion: revision,
        configurationUpdatedAt: new Date(),
        registrationPausedAt,
      })
      .where(eq(editionState.slug, slug));
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: `tournament_${c.action}`,
      detail: {
        entity: { type: "tournament", id: slug },
        before: {
          configuration: state.configuration,
          revision: current.revision,
          registrationPaused: Boolean(state.registrationPausedAt),
        },
        after: {
          configuration,
          revision,
          registrationPaused: Boolean(registrationPausedAt),
        },
      },
    });
  });
  return tournamentForAdmin(actor, slug);
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
