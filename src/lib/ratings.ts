import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { fixtures as fixtureTable } from "@/db/schema";
import { approvedRatingGames } from "./approved-rating-games";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { publicCompetition } from "./public-competition";
import { ratingIdentities } from "./rating-data";
import { ratingSnapshot, type RatingSnapshot } from "./rating-snapshot";
import { readTournament } from "./tournament-reads";

type PublicMatchRating = ExplicitReadData<"publicMatchRating">;
type PublicRoundRatings = ExplicitReadData<"publicRoundRatings">;

async function databaseMatchRatingWorkspace(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RatingSnapshot> {
  await assertReadCapability(actor, "approve_results", slug);
  return db().transaction(
    async (tx) => {
      await assertReadCapability(actor, "approve_results", slug, tx);
      if (!(await readTournament(slug, tx)))
        throw new HttpError(404, "Tournament not found.");
      const games = (await approvedRatingGames(slug, tx)).filter(
        (g) => g.fixtureId === fixtureId,
      );
      return ratingSnapshot(games, await ratingIdentities(slug, tx));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function matchRatingWorkspace(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RatingSnapshot> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<RatingSnapshot>("matchRatingWorkspace", {
      slug,
      fixtureId,
    });
  }
  return databaseMatchRatingWorkspace(actor, slug, fixtureId);
}

async function databasePublicMatchRating(
  slug: string,
  fixtureId: string,
): Promise<PublicMatchRating> {
  if (!process.env.DATABASE_URL) return null;
  return db().transaction(
    async (tx) => {
      const competition = await publicCompetition(slug, tx);
      const fixture = competition?.fixtures.find(
        (f) => f.id === fixtureId && f.result && f.stage !== "exhibition",
      );
      if (!fixture?.result) return null;
      const identities = await ratingIdentities(slug, tx, [
        fixture.home.team!.id,
        fixture.away.team!.id,
      ]);
      const games = (await approvedRatingGames(slug, tx)).filter(
        (g) =>
          g.fixtureId === fixtureId && g.revision === fixture.result!.revision,
      );
      // No public record may identify a private substitute, even via the source evidence.
      if (games.some((g) => g.scores.some((s) => !identities.has(s.userId))))
        return null;
      return ratingSnapshot(games, identities);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicMatchRating(
  slug: string,
  fixtureId: string,
): Promise<PublicMatchRating> {
  if (remoteMode()) {
    return frontendResource<PublicMatchRating>("publicMatchRating", {
      slug,
      fixtureId,
    });
  }
  return databasePublicMatchRating(slug, fixtureId);
}

/** Same population and approval gates as single fixtures, with raw-game reaggregation. */
async function databasePublicRoundRatings(
  slug: string,
): Promise<PublicRoundRatings> {
  if (!process.env.DATABASE_URL) return [];
  return db().transaction(
    async (tx) => {
      const competition = await publicCompetition(slug, tx);
      if (!competition) return [];
      const fixtures = competition.fixtures.filter(
        (f) => f.status !== "cancelled" && f.stage !== "exhibition",
      );
      const identities = await ratingIdentities(slug, tx, [
        ...new Set(
          fixtures.flatMap((f) =>
            [f.home.team?.id, f.away.team?.id].filter(
              (id): id is string => !!id,
            ),
          ),
        ),
      ]);
      const games = await approvedRatingGames(slug, tx);
      const allFixtures = await tx
        .select({ id: fixtureTable.id, roundId: fixtureTable.roundId })
        .from(fixtureTable)
        .where(
          and(
            eq(fixtureTable.editionSlug, slug),
            ne(fixtureTable.status, "cancelled"),
          ),
        );
      return [...new Set(fixtures.map((f) => f.roundId))].flatMap((roundId) => {
        const round = fixtures.filter((f) => f.roundId === roundId);
        const scopes = [
          { key: "", name: "", teamIds: null as string[] | null },
          ...competition.groups.map((g) => ({
            key: g.key,
            name: g.name,
            teamIds: g.rows.map((r) => r.team.id),
          })),
        ];
        return scopes
          .filter((scope) => !scope.key || round[0].stage === "group")
          .flatMap((scope) => {
            const selected = round.filter(
              (f) =>
                !scope.teamIds ||
                (scope.teamIds.includes(f.home.team?.id ?? "") &&
                  scope.teamIds.includes(f.away.team?.id ?? "")),
            );
            if (!selected.length) return [];
            const available = selected.filter((f) => f.result);
            const ids = new Set(available.map((f) => f.id));
            const source = games.filter((g) => ids.has(g.fixtureId));
            const withheld = source.some((g) =>
              g.scores.some((s) => !identities.has(s.userId)),
            );
            const report = ratingSnapshot(withheld ? [] : source, identities);
            const complete =
              available.length === selected.length &&
              !report.issues.length &&
              !withheld &&
              available.every((f) =>
                source.some((g) => g.fixtureId === f.id),
              ) &&
              allFixtures
                .filter((f) => f.roundId === roundId)
                .every((f) => round.some((p) => p.id === f.id));
            return [
              {
                roundId,
                roundName: round[0].roundName,
                stage: round[0].stage,
                groupKey: scope.key,
                groupName: scope.name,
                publishedFixtures: selected.length,
                ratedFixtures: withheld
                  ? 0
                  : available.filter((f) =>
                      source.some((g) => g.fixtureId === f.id),
                    ).length,
                complete,
                report,
              },
            ];
          });
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicRoundRatings(
  slug: string,
): Promise<PublicRoundRatings> {
  if (remoteMode()) {
    return frontendResource<PublicRoundRatings>("publicRoundRatings", { slug });
  }
  return databasePublicRoundRatings(slug);
}
