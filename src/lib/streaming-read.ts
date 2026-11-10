import { isActiveFixtureStatus } from "./fixture-status";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, readOnlyData } from "@/db";
import {
  fixtures,
  fixtureStreams,
  resultRevisions,
  tournamentRounds,
  tournamentStages,
  refereeSessions,
  refereeEvents,
} from "@/db/schema";
import { publicCompetition, type PublicFixture } from "./public-competition";
import { publicMappools } from "./mappool-reads";
import { assertStreamer } from "./streaming-api";
import { projectReferee } from "./referee-model";
import { editionSchema } from "./editions";
import { HttpError } from "./http-error";
import type { ExplicitReadData } from "./explicit-read-contracts";
type NextStreamingRead = ExplicitReadData<"nextStreamingRead">;

export const streamingNextQuery = z
  .object({ afterFixtureId: z.uuid().optional() })
  .strict();
export function selectNextStreamingFixture(
  rows: PublicFixture[],
  assigned: Set<string>,
  completed: Set<string>,
  afterFixtureId?: string,
) {
  const ordered = rows
    .filter((f) => assigned.has(f.id) && f.scheduledAt !== null)
    .sort(
      (a, b) =>
        Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  const anchor = afterFixtureId
    ? ordered.findIndex((f) => f.id === afterFixtureId)
    : -1;
  if (afterFixtureId && anchor < 0)
    throw new HttpError(404, "Streaming fixture was not found.");
  return (
    ordered
      .slice(anchor + 1)
      .find(
        (f) =>
          isActiveFixtureStatus(f.status) && !f.result && !completed.has(f.id),
      ) ?? null
  );
}
/** A public round becomes visible through its published fixture; group configuration is excluded. */
export async function publicStreamingStage(
  slug: string,
  fixture: PublicFixture,
) {
  const [stage] = await db()
    .select({
      id: tournamentStages.id,
      kind: tournamentStages.kind,
      round: {
        id: tournamentRounds.id,
        name: tournamentRounds.name,
        position: tournamentRounds.position,
        scoringRules: tournamentRounds.scoringRules,
      },
    })
    .from(tournamentStages)
    .innerJoin(
      tournamentRounds,
      eq(tournamentRounds.stageId, tournamentStages.id),
    )
    .where(
      and(
        eq(tournamentStages.editionSlug, slug),
        eq(tournamentRounds.editionSlug, slug),
        eq(tournamentRounds.id, fixture.roundId),
        eq(tournamentStages.id, fixture.stageId),
      ),
    );
  return stage ?? null;
}
/** Shared Developer/Streamer projection, one read-only repeatable-read snapshot. */
export async function nextStreamingRead(
  subject: { osuId: number },
  slug: string,
  input: unknown = {},
): Promise<NextStreamingRead> {
  const parsed = streamingNextQuery.safeParse(input);
  if (!parsed.success || !editionSchema.shape.slug.safeParse(slug).success)
    throw new HttpError(400, "Choose valid streaming query parameters.");
  return readOnlyData(async () => {
    await assertStreamer(subject.osuId, slug);
    const competition = await publicCompetition(slug, db());
    if (!competition) throw new HttpError(404, "Tournament not found.");
    const assignments = await db()
      .select({ id: fixtureStreams.fixtureId })
      .from(fixtureStreams)
      .innerJoin(fixtures, eq(fixtures.id, fixtureStreams.fixtureId))
      .where(
        and(
          eq(fixtures.editionSlug, slug),
          eq(fixtureStreams.userId, subject.osuId),
        ),
      );
    const completed = await db()
      .select({ id: resultRevisions.fixtureId })
      .from(resultRevisions)
      .innerJoin(fixtures, eq(fixtures.id, resultRevisions.fixtureId))
      .where(
        and(
          eq(fixtures.editionSlug, slug),
          isNotNull(resultRevisions.approvedAt),
        ),
      );
    const completedIds = new Set(completed.map((f) => f.id));
    const sessions = await db()
      .select()
      .from(refereeSessions)
      .where(eq(refereeSessions.editionSlug, slug));
    for (const session of sessions) {
      if (!assignments.some((f) => f.id === session.fixtureId)) continue;
      const events = await db()
        .select()
        .from(refereeEvents)
        .where(eq(refereeEvents.fixtureId, session.fixtureId))
        .orderBy(refereeEvents.ordinal);
      if (
        projectReferee({
          ...session.basis,
          orders: session.exhibitionOrder ?? {
            firstBanTeamId: session.firstBanTeamId,
            firstPickTeamId: session.firstPickTeamId,
          },
          events: events.map((e) => ({
            ...e,
            createdAt: e.createdAt.toISOString(),
          })),
        }).complete
      )
        completedIds.add(session.fixtureId);
    }
    const nextFixture = selectNextStreamingFixture(
      competition.fixtures,
      new Set(assignments.map((f) => f.id)),
      completedIds,
      parsed.data.afterFixtureId,
    );
    const stage = nextFixture
      ? await publicStreamingStage(slug, nextFixture)
      : null;
    // Use the fixture's explicit pool relation; never substitute another pool in the same round.
    const mappools = nextFixture?.pool
      ? await publicMappools(slug, nextFixture.pool.id)
      : [];
    return { nextFixture, stage, mappools };
  });
}
