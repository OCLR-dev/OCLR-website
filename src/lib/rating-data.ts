import { and, eq, inArray, ne } from "drizzle-orm";
import {
  captains,
  fixtures as fixtureTable,
  memberships,
  registrations,
  tournamentRounds,
  tournamentStages,
  users,
} from "@/db/schema";
import type { RatingReader } from "./approved-rating-games";
import { ratingSnapshot } from "./rating-snapshot";
import type { RatingGame } from "./yumu-rating";

export async function ratingIdentities(
  slug: string,
  reader: RatingReader,
  publicTeamIds?: string[],
) {
  const identities = await reader
    .select({ userId: registrations.userId, username: users.username })
    .from(registrations)
    .innerJoin(users, eq(users.osuId, registrations.userId))
    .where(
      and(
        eq(registrations.editionSlug, slug),
        publicTeamIds ? eq(registrations.status, "accepted") : undefined,
      ),
    );
  if (publicTeamIds) {
    identities.push(
      ...(await reader
        .select({ userId: captains.userId, username: users.username })
        .from(captains)
        .innerJoin(users, eq(users.osuId, captains.userId))
        .where(
          and(eq(captains.editionSlug, slug), eq(captains.published, true)),
        )),
    );
    if (publicTeamIds.length)
      identities.push(
        ...(await reader
          .select({ userId: memberships.userId, username: users.username })
          .from(memberships)
          .innerJoin(users, eq(users.osuId, memberships.userId))
          .where(
            and(
              eq(memberships.editionSlug, slug),
              inArray(memberships.teamId, publicTeamIds),
            ),
          )),
      );
  }
  return new Map(identities.map((p) => [p.userId, p.username]));
}

export async function staffRoundRatings(
  slug: string,
  reader: RatingReader,
  games: RatingGame[],
  identities: Map<number, string>,
) {
  const rows = await reader
    .select({
      fixture: fixtureTable,
      round: tournamentRounds,
      stage: tournamentStages.kind,
    })
    .from(fixtureTable)
    .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtureTable.roundId))
    .innerJoin(
      tournamentStages,
      eq(tournamentStages.id, tournamentRounds.stageId),
    )
    .where(
      and(
        eq(fixtureTable.editionSlug, slug),
        ne(fixtureTable.status, "cancelled"),
        ne(tournamentStages.kind, "exhibition"),
      ),
    );
  return [...new Set(rows.map((r) => r.round.id))].map((roundId) => {
    const round = rows.filter((r) => r.round.id === roundId);
    const source = games.filter((g) =>
      round.some((r) => r.fixture.id === g.fixtureId),
    );
    const report = ratingSnapshot(source, identities);
    const ratedFixtures = new Set(source.map((g) => g.fixtureId)).size;
    return {
      roundId,
      roundName: round[0].round.name,
      stage: round[0].stage,
      groupKey: "",
      groupName: "",
      publishedFixtures: round.filter((r) => r.fixture.publishedAt).length,
      ratedFixtures,
      complete: ratedFixtures === round.length && !report.issues.length,
      report,
    };
  });
}
