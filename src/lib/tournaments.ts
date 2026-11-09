import { db } from "@/db";
import {
  draftSessions,
  editionEvents,
  editionRevisions,
  editionState,
  registrations,
  memberships,
  teams,
  tournamentStages,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import { correctS2PoolArchive } from "./archive-pool-correction-model";
import { archiveEditionStates } from "./archive-relations";
import { syncArchiveRelations } from "./archive-relation-writes";
import { confirmArchiveStaffIdentity } from "./archive-staff-identity-model";
import { privacyReady } from "./auth/config";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { draftSetupProtection } from "./draft-setup";
import { refreshDraftSnapshot } from "./draft-snapshot";
import {
  editionSchema,
  registrationBlockers,
  suggestEditionSlug,
  type Edition,
} from "./editions";
import {
  addArchiveSubstitute,
  approveArchiveMatches,
  exchangeArchivePlayers,
  resolveArchiveIdentity,
} from "./historical-archive";
import { HttpError } from "./http-error";
import { storedEdition, tournamentForAdmin } from "./tournament-reads";
import {
  changeTournamentWrite,
  createTournamentWrite,
} from "./tournament-write-contracts";

function invalid(parsed: { success: boolean; error?: z.ZodError }) {
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error?.issues[0]
        ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
        : "Check the tournament settings.",
    );
}
export async function createTournament(actor: User, input: unknown) {
  await assertCapability(actor, "configure_tournament");
  const parsed = createTournamentWrite.request.safeParse(input);
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
    coachesEnabled: false,
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
  const parsed = changeTournamentWrite.request.safeParse(input);
  invalid(parsed);
  if (!parsed.success) throw new HttpError(400, "Invalid settings.");
  const c = parsed.data;
  if (c.action === "resolve-archive-staff") {
    const { lookupArchiveStaffIdentity } =
      await import("./archive-staff-identity");
    const candidate = await lookupArchiveStaffIdentity(actor, slug, {
      staffIndex: c.staffIndex,
      username: c.username,
      expectedRevision: c.expectedRevision,
    });
    if (candidate.osuId !== c.osuId)
      throw new HttpError(
        409,
        "The verified osu! ID changed. Look up the username again.",
      );
  }
  await db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    const [state] = await archiveEditionStates(tx, false, slug);
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
    if (c.action === "resolve-archive-staff") {
      if (!e.archive || e.status !== "completed" || e.registration)
        throw new HttpError(
          409,
          "Select a completed historical archive without registration.",
        );
      try {
        next = {
          ...e,
          archive: confirmArchiveStaffIdentity(e.archive, {
            staffIndex: c.staffIndex,
            username: c.username,
            osuId: c.osuId,
            expectedRevision: c.expectedRevision,
            source: c.source,
            identityConfirmed: c.identityConfirmed,
          }),
        };
      } catch {
        throw new HttpError(
          409,
          "Select an unresolved historical staff member without conflicting identity evidence.",
        );
      }
    }
    if (c.action === "add-archive-substitute") {
      if (!e.archive || e.status !== "completed" || e.registration)
        throw new HttpError(
          409,
          "Select a completed historical archive without registration.",
        );
      await assertCapability(actor, "approve_results", slug, tx);
      try {
        next = {
          ...e,
          archive: addArchiveSubstitute(e.archive, {
            osuId: c.osuId,
            username: c.username,
            teamId: c.teamId,
            source: c.source,
            confirmationSource: c.confirmationSource,
          }),
        };
      } catch {
        throw new HttpError(
          409,
          "Select an unused substitute identity and a recorded team in a final-Tier archive.",
        );
      }
      // The edition row is already locked, as for every statistics command.
      const { preserveStatisticsForRosterAddition } =
        await import("./archive-statistics");
      await preserveStatisticsForRosterAddition(
        tx,
        actor,
        e.archive,
        next.archive!,
      );
    }
    if (c.action === "exchange-archive-players") {
      if (!e.archive || e.status !== "completed" || e.registration)
        throw new HttpError(
          409,
          "Select a completed historical archive without registration.",
        );
      await assertCapability(actor, "approve_results", slug, tx);
      const {
        firstOsuId,
        firstTeamId,
        secondOsuId,
        secondTeamId,
        confirmationSource,
      } = c;
      const confirmation = {
        firstOsuId,
        firstTeamId,
        secondOsuId,
        secondTeamId,
        confirmationSource,
      };
      try {
        next = {
          ...e,
          archive: exchangeArchivePlayers(e.archive, confirmation),
        };
      } catch {
        throw new HttpError(
          409,
          "Select two recorded players from different teams in a final-Tier archive. Refresh if their teams changed.",
        );
      }
      const { preserveStatisticsForRosterExchange } =
        await import("./archive-statistics");
      await preserveStatisticsForRosterExchange(
        tx,
        actor,
        e.archive,
        next.archive!,
        confirmation,
      );
    }
    if (c.action === "resolve-archive-identity") {
      if (!e.archive || e.status !== "completed" || e.registration)
        throw new HttpError(
          409,
          "Select a completed historical archive without registration.",
        );
      try {
        next = {
          ...e,
          archive: resolveArchiveIdentity(e.archive, c),
        };
      } catch {
        throw new HttpError(
          409,
          "Select an unresolved archive identity and an unused osu! ID.",
        );
      }
    }
    if (c.action === "approve-archive-matches") {
      if (!e.archive || e.status !== "completed" || e.registration)
        throw new HttpError(
          409,
          "Select a completed historical archive without registration.",
        );
      try {
        next = {
          ...e,
          archive: approveArchiveMatches(e.archive, c.matchIds, {
            approvedOn: new Date().toISOString().slice(0, 10),
            source: "Admin approval",
          }),
        };
      } catch {
        throw new HttpError(
          409,
          "Only pending saved match reviews with a score can be approved.",
        );
      }
    }
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
      next = { ...e, archive: correctS2PoolArchive(c.archive) };
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
    const revisions =
      c.action === "rules"
        ? await tx
            .select({
              rules: sql<
                Edition["rules"]
              >`${editionRevisions.configuration}->'rules'`,
            })
            .from(editionRevisions)
            .where(eq(editionRevisions.editionSlug, slug))
        : [];
    if (
      c.action === "general" &&
      c.rosterCapacity !== undefined &&
      c.rosterCapacity !== e.rosterCapacity
    ) {
      if ((await draftSetupProtection(tx, slug)).locked)
        throw new HttpError(409, "Roster capacity is locked for the draft.");
      const active = await tx
        .select()
        .from(teams)
        .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
      for (const team of active) {
        const roster = await tx
          .select()
          .from(memberships)
          .where(
            and(eq(memberships.teamId, team.id), isNull(memberships.leftAt)),
          );
        if (
          team.finalizedAt ||
          (c.rosterCapacity !== null && roster.length > c.rosterCapacity)
        )
          throw new HttpError(
            409,
            "Capacity cannot be smaller than the current roster or changed for finalized teams.",
          );
      }
      await tx
        .update(teams)
        .set({ capacity: c.rosterCapacity })
        .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
      await tx
        .update(editionState)
        .set({ setupVersion: state.setupVersion + 1 })
        .where(eq(editionState.slug, slug));
      await refreshDraftSnapshot(tx, slug);
    }
    if (c.action === "general")
      next = {
        ...e,
        name: c.name,
        season: c.season,
        summary: c.summary,
        status: c.status,
        ...(c.rosterCapacity !== undefined
          ? { rosterCapacity: c.rosterCapacity }
          : {}),
        ...(c.coachesEnabled !== undefined
          ? { coachesEnabled: c.coachesEnabled }
          : {}),
        ...(c.ezScoreMultiplier !== undefined
          ? { ezScoreMultiplier: c.ezScoreMultiplier }
          : {}),
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
            r.rules?.version === c.rules?.version &&
            !isDeepStrictEqual(r.rules, c.rules),
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
        ...(c.action === "resolve-archive-staff"
          ? {
              identityConfirmation: {
                staffIndex: c.staffIndex,
                historicalName: e.archive!.staff[c.staffIndex].username,
                currentUsername: c.username,
                osuId: c.osuId,
                source: c.source,
              },
            }
          : {}),
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
    await syncArchiveRelations(
      tx,
      slug,
      false,
      configuration.archive ?? undefined,
    );
  });
  return tournamentForAdmin(actor, slug);
}
