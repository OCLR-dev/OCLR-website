import { createHash } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { db } from "@/db";
import {
  awardSettings,
  captains,
  draftPicks,
  draftSessions,
  fixtures,
  registrations,
  teams,
  tournamentRounds,
  tournamentStages,
  users,
  weeklyAwardReleases,
} from "@/db/schema";
import { approvedRatingGames } from "./approved-rating-games";
import { awardConfigurationSchema, weeklyStandings } from "./award-model";
import { draftAwardTiers } from "./award-tiers";
import { HttpError } from "./http-error";
import { draftTurnSequence } from "./live-season-columns";
import { classifyPlayer, PLAYER_CLASS_POLICY } from "./player-class";
import { staffRoundRatings } from "./rating-data";
import type { AwardReport } from "./staff-workspace-read-contracts";
import { readTournament } from "./tournament-reads";
import { YUMU_POLICY } from "./yumu-rating";

type Reader = Pick<ReturnType<typeof db>, "select">;
export async function calculateAwardWorkspace(slug: string, reader: Reader) {
  const tournament = await readTournament(slug, reader);
  if (!tournament) throw new HttpError(404, "Tournament not found.");
  const [stored] = await reader
    .select()
    .from(awardSettings)
    .where(eq(awardSettings.editionSlug, slug));
  const configuration = awardConfigurationSchema.parse({
    weeks: stored?.weeks ?? [],
    policy: stored?.policy ?? YUMU_POLICY,
  });
  const [session] = await reader
    .select({
      id: draftSessions.id,
      state: draftSessions.state,
      turnSequence: draftTurnSequence,
      publicSnapshot: draftSessions.publicSnapshot,
    })
    .from(draftSessions)
    .where(eq(draftSessions.editionSlug, slug));
  const appointed = await reader
    .select({ id: captains.userId, published: captains.published })
    .from(captains)
    .where(eq(captains.editionSlug, slug));
  const captainTeams = await reader
    .select({ id: teams.captainId })
    .from(teams)
    .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
  const captainIds = [...appointed, ...captainTeams].map((c) => c.id);
  const picks =
    session && session.state !== "aborted"
      ? await reader
          .select()
          .from(draftPicks)
          .where(
            and(
              eq(draftPicks.sessionId, session.id),
              isNull(draftPicks.voidedAt),
            ),
          )
      : [];
  const tiers = draftAwardTiers(session?.turnSequence ?? [], picks, captainIds);
  const released = session?.publicSnapshot?.picks ?? [];
  const releasedTiers = draftAwardTiers(
    session?.turnSequence ?? [],
    picks.filter((p) =>
      released.some(
        (r) =>
          r.id === p.id &&
          r.turnIndex === p.turnIndex &&
          r.player.osuId === p.playerId &&
          r.team.id === p.teamId,
      ),
    ),
    appointed.filter((c) => c.published).map((c) => c.id),
  );
  const participants = await reader
    .select({
      userId: registrations.userId,
      username: users.username,
      status: registrations.status,
    })
    .from(registrations)
    .innerJoin(users, eq(users.osuId, registrations.userId))
    .where(eq(registrations.editionSlug, slug));
  const games = await approvedRatingGames(slug, reader);
  const scheduledFixtures =
    configuration.policy === YUMU_POLICY
      ? await reader
          .select({ id: fixtures.id, at: fixtures.scheduledAt })
          .from(fixtures)
          .innerJoin(
            tournamentRounds,
            eq(tournamentRounds.id, fixtures.roundId),
          )
          .innerJoin(
            tournamentStages,
            eq(tournamentStages.id, tournamentRounds.stageId),
          )
          .where(
            and(
              eq(fixtures.editionSlug, slug),
              ne(fixtures.status, "cancelled"),
              ne(tournamentStages.kind, "exhibition"),
            ),
          )
      : [];
  const reports = weeklyStandings(
    configuration.weeks,
    tiers,
    games,
    configuration.policy,
  ).map((standing): AwardReport => {
    const identities = standing.candidates.map((c) => {
      const participant = participants.find((p) => p.userId === c.userId);
      return {
        userId: c.userId,
        username: participant?.username ?? String(c.userId),
        public: participant?.status === "accepted",
      };
    });
    const report = {
      ...standing,
      ...(configuration.policy === YUMU_POLICY
        ? {
            classificationPolicy: PLAYER_CLASS_POLICY,
            candidates: standing.candidates.map((c) => ({
              ...c,
              ratingClass: c.rating
                ? classifyPlayer(c.rating, c.ratingPlayerCount ?? 0)
                : null,
            })),
            ratingContext: games
              .filter((g) =>
                standing.evidence.some((e) => e.gameId === g.gameId),
              )
              .map((g) => ({
                gameId: g.gameId,
                roundId: g.roundId,
                approvalFingerprint: g.approvalFingerprint,
              })),
          }
        : {}),
      policy: configuration.policy,
      timeZone: tournament.edition.timeZone,
      identities,
      issues: [
        ...standing.issues,
        ...(configuration.policy === YUMU_POLICY &&
        scheduledFixtures.some(
          (f) =>
            f.at &&
            f.at.getTime() >= Date.parse(standing.startsAt) &&
            f.at.getTime() < Date.parse(standing.endsAt) &&
            !games.some((g) => g.fixtureId === f.id && !g.problem),
        )
          ? [
              "This award week still has fixtures awaiting approved published game data.",
            ]
          : []),
        ...(standing.candidates.some(
          (c) =>
            c.tier !== null &&
            !releasedTiers.some(
              (t) => t.userId === c.userId && t.tier === c.tier,
            ),
        )
          ? ["Release draft Tier sources before publishing awards."]
          : []),
      ],
    };
    return {
      ...report,
      fingerprint: createHash("sha256")
        .update(JSON.stringify(report))
        .digest("hex"),
    };
  });
  const releases = await reader
    .select()
    .from(weeklyAwardReleases)
    .where(
      and(
        eq(weeklyAwardReleases.editionSlug, slug),
        eq(weeklyAwardReleases.active, true),
      ),
    );
  return {
    roundRatings: await staffRoundRatings(
      slug,
      reader,
      games,
      new Map(participants.map((p) => [p.userId, p.username])),
    ),
    edition: {
      slug,
      name: tournament.edition.name,
      timeZone: tournament.edition.timeZone,
    },
    version: stored?.version ?? 0,
    ...configuration,
    tiers,
    participants,
    reports,
    releases,
  };
}
