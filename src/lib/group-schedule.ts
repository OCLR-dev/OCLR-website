import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  fixtures,
  resultAuditEvents,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import type { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { configurationTeams } from "./fixture-reads";
import {
  groupSchedulePreviewInput,
  type fixtureCommandInput,
  type GroupSchedulePreview,
} from "./fixture-write-contracts";
import { planGroupSchedule } from "./group-schedule-model";
import { HttpError } from "./http-error";
import { readTournament } from "./tournament-reads";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type ScheduleFields = Omit<z.infer<typeof groupSchedulePreviewInput>, "action">;
type CreateSchedule = Extract<
  z.infer<typeof fixtureCommandInput>,
  { action: "create_group_schedule" }
>;

async function readGroupSchedule(
  tx: Tx,
  slug: string,
  fields: ScheduleFields,
): Promise<GroupSchedulePreview> {
  const { stageId, expectedVersion, roundId, startDate, endDate, times } =
    fields;
  const [stage] = await tx
    .select()
    .from(tournamentStages)
    .where(
      and(
        eq(tournamentStages.id, stageId),
        eq(tournamentStages.editionSlug, slug),
        eq(tournamentStages.kind, "group"),
      ),
    );
  if (!stage) throw new HttpError(404, "Choose this edition's Group Stage.");
  if (stage.version !== expectedVersion)
    throw new HttpError(
      409,
      "Group configuration changed. Refresh before continuing.",
    );
  const groups = stage.groupConfiguration?.groups ?? [];
  if (!groups.some((group) => group.teamIds.length >= 2))
    throw new HttpError(
      400,
      "Save at least one group with two teams before scheduling.",
    );
  const assigned = groups.flatMap((group) => group.teamIds);
  const active = new Set(
    (await configurationTeams(tx, slug)).map((team) => team.id),
  );
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.some((id) => !active.has(id))
  )
    throw new HttpError(
      409,
      "Save updated group assignments before scheduling.",
    );

  const rounds = await tx
    .select({ id: tournamentRounds.id, version: tournamentRounds.version })
    .from(tournamentRounds)
    .where(
      and(
        eq(tournamentRounds.editionSlug, slug),
        eq(tournamentRounds.stageId, stageId),
      ),
    );
  const round = rounds.find((entry) => entry.id === roundId);
  if (!round) throw new HttpError(404, "Choose a round from this Group Stage.");
  const saved = await readTournament(slug, tx);
  if (!saved) throw new HttpError(404, "Tournament not found.");
  const timeZone = saved.edition.timeZone;
  const existing = await tx
    .select({
      id: fixtures.id,
      roundId: fixtures.roundId,
      position: fixtures.position,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
      scheduledAt: fixtures.scheduledAt,
      status: fixtures.status,
    })
    .from(fixtures)
    .where(eq(fixtures.editionSlug, slug))
    .orderBy(fixtures.id);
  const matches = planGroupSchedule({
    groups,
    existing,
    groupRoundIds: new Set(rounds.map((entry) => entry.id)),
    roundId,
    startDate,
    endDate,
    times,
    timeZone,
  });
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        slug,
        stageId,
        expectedVersion,
        round,
        timeZone,
        startDate,
        endDate,
        times,
        existing,
        matches,
      }),
    )
    .digest("hex");
  return { timeZone, matches, fingerprint };
}

export async function previewGroupSchedule(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_fixtures", slug);
  const parsed = groupSchedulePreviewInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose a round, start and end dates, and distinct match times.",
    );
  return db().transaction(
    async (tx) => {
      await assertCapability(actor, "manage_fixtures", slug, tx);
      await assertOperationalEdition(slug, tx);
      return readGroupSchedule(tx, slug, parsed.data);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Called by fixtureCommand with the edition lock and the write capability checked. */
export async function createGroupSchedule(
  tx: Tx,
  actor: User,
  slug: string,
  command: CreateSchedule,
) {
  const { fingerprint, matches, timeZone } = await readGroupSchedule(
    tx,
    slug,
    command,
  );
  if (fingerprint !== command.expectedFingerprint)
    throw new HttpError(
      409,
      "The fixtures changed. Preview the group schedule again.",
    );
  if (!matches.length) return;
  const created = await tx
    .insert(fixtures)
    .values(
      matches.map((match) => ({
        editionSlug: slug,
        roundId: command.roundId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        scheduledAt: new Date(match.scheduledAt),
        timeZone,
        label: `${match.group} · ${match.position}`,
        position: match.position,
      })),
    )
    .returning();
  await tx.insert(resultAuditEvents).values(
    created.map((after) => ({
      fixtureId: after.id,
      actorId: actor.osuId,
      action: "fixture_create",
      detail: {
        entity: { type: "fixture", id: after.id },
        before: null,
        after,
        refereeIds: [],
      },
    })),
  );
}
