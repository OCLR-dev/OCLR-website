import { z } from "zod";
import { publicCompetitionReadContract } from "../lib/competition-read-contracts";
import { editionSlugSchema } from "../lib/editions";
import { explicitReadContracts } from "../lib/explicit-read-contracts";
import { historicalArchiveSchema } from "../lib/historical-archive";
import {
  oclrProfileSchema,
  paginationSchema,
  publicTournamentSchema,
  publicTournamentSummarySchema,
  usernameOwnerSchema,
} from "../lib/read-api-contract";
import { publicPlayerParticipationReadContract } from "../lib/player-participation-contract";

const participation = publicPlayerParticipationReadContract.element
  .omit({ bio: true, previousUsernames: true, statistics: true })
  .extend({ editionSlug: editionSlugSchema })
  .strip();
const { identity, snapshot } = oclrProfileSchema.shape;
const { profile } = snapshot.unwrap().shape;
const playerProfile = z.object({
  identity: identity
    .pick({ osuId: true, username: true, currentUsername: true })
    .strip(),
  participation: z.array(participation),
  snapshot: snapshot
    .unwrap()
    .pick({ stale: true })
    .extend({
      profile: profile
        .pick({ fetchedAt: true })
        .extend({
          statistics: profile.shape.statistics
            .pick({ globalRank: true, pp: true })
            .strip(),
        })
        .strip(),
    })
    .strip()
    .nullable(),
});

const fixture = publicCompetitionReadContract.options[1].shape.fixtures.element;
const slot = fixture.shape.home
  .pick({ label: true })
  .extend({
    team: fixture.shape.home.shape.team.options[1]
      .pick({ id: true, name: true })
      .strip()
      .nullable(),
  })
  .strip();
const competition = z
  .object({
    fixtures: z.array(
      fixture
        .pick({
          id: true,
          label: true,
          roundName: true,
          publishedAt: true,
          stage: true,
          confirmed: true,
          scheduledAt: true,
          status: true,
        })
        .extend({
          home: slot,
          away: slot,
          result: fixture.shape.result.options[1]
            .pick({ homeWins: true, awayWins: true, updatedAt: true })
            .strip()
            .nullable(),
        })
        .strip(),
    ),
  })
  .nullable();
const archiveMatch = historicalArchiveSchema.shape.matches.element;
const archivedTournament = z.object({
  edition: z.object({
    slug: editionSlugSchema,
    archive: z
      .object({
        matches: z.array(
          archiveMatch
            .pick({
              id: true,
              label: true,
              teamA: true,
              teamB: true,
              scheduledAt: true,
              score: true,
              forfeitWinner: true,
            })
            .extend({
              review: z
                .object({
                  status: archiveMatch.shape.review.unwrap().shape.status,
                })
                .optional(),
            })
            .strip(),
        ),
        teams: z.array(
          historicalArchiveSchema.shape.teams.element
            .pick({
              id: true,
              name: true,
            })
            .strip(),
        ),
      })
      .optional(),
  }),
});
const tournament = publicTournamentSchema
  .pick({ slug: true, name: true, registration: true })
  .extend({
    rules: z.object({}).nullable(),
    overview: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("database") }),
      z.object({
        kind: z.literal("historical_archive"),
        rulebook: z.object({}).nullable(),
      }),
      z.object({
        kind: z.literal("preview"),
        document: z.object({ rules: z.array(z.unknown()) }),
      }),
    ]),
  })
  .strip();
const tournamentList = z.array(
  publicTournamentSummarySchema.pick({ slug: true }).strip(),
);
const errorEnvelope = z.object({ error: z.object({ code: z.string() }) });
const meta = z.object({
  apiVersion: z.literal("1"),
  pagination: paginationSchema.strip().optional(),
});

export type Participation = z.infer<typeof participation>;
export type Fixture = NonNullable<
  z.infer<typeof competition>
>["fixtures"][number];
export type Fetch = typeof fetch;

export class ReadFailure extends Error {
  constructor(readonly kind: "missing" | "limited" | "unavailable") {
    super(kind);
  }
}

export function publicReads(
  origin: string,
  signal: AbortSignal,
  request: Fetch,
) {
  async function read<T extends z.ZodType>(
    path: string,
    schema: T,
    query?: URLSearchParams,
  ) {
    const url = new URL(`/api/v1${path}`, origin);
    if (query) url.search = query.toString();
    try {
      const response = await request(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (response.status === 429) {
        await response.body?.cancel();
        throw new ReadFailure("limited");
      }
      if (!response.ok) {
        if (response.status === 404) {
          const envelope = errorEnvelope.safeParse(await response.json());
          if (envelope.success && envelope.data.error.code === "NOT_FOUND")
            throw new ReadFailure("missing");
        } else {
          await response.body?.cancel();
        }
        throw new ReadFailure("unavailable");
      }
      return z.object({ data: schema, meta }).parse(await response.json());
    } catch (error) {
      throw error instanceof ReadFailure
        ? error
        : new ReadFailure("unavailable");
    }
  }

  return {
    async name(name: string) {
      return (
        await read(
          "/players/by-username",
          usernameOwnerSchema.strip(),
          new URLSearchParams({ name }),
        )
      ).data;
    },
    async profile(osuId: number, season?: string) {
      const { data } = await read(
        `/players/${osuId}/oclr-profile`,
        playerProfile,
        season ? new URLSearchParams({ edition: season }) : undefined,
      );
      if (data.identity.osuId !== osuId) throw new ReadFailure("unavailable");
      return data;
    },
    async participations(osuId: number, season?: string) {
      return (
        await read(
          `/players/${osuId}/participations`,
          z.array(participation),
          season ? new URLSearchParams({ edition: season }) : undefined,
        )
      ).data.filter(
        (row) => row.osuId === osuId && (!season || row.editionSlug === season),
      );
    },
    async recentSeasons(wanted: ReadonlySet<string>, limit: number) {
      const seasons: string[] = [];
      const query = new URLSearchParams({ pageSize: "100" });
      let page: number | null = 1;
      while (page !== null && page <= 100 && seasons.length < limit) {
        query.set("page", String(page));
        const { data, meta } = await read(
          "/tournaments",
          tournamentList,
          query,
        );
        const pagination = meta.pagination;
        if (!pagination || pagination.page !== page)
          throw new ReadFailure("unavailable");
        for (const { slug } of data) {
          if (wanted.has(slug) && !seasons.includes(slug)) seasons.push(slug);
          if (seasons.length === limit) break;
        }
        if (pagination.nextPage !== null && pagination.nextPage !== page + 1)
          throw new ReadFailure("unavailable");
        page = pagination.nextPage;
        query.set("version", pagination.collectionVersion);
      }
      return seasons;
    },
    async tournament(season: string) {
      const { data } = await read(`/tournaments/${season}`, tournament);
      if (data.slug !== season) throw new ReadFailure("unavailable");
      return data;
    },
    async enrollment(season: string) {
      return (
        await read(
          `/tournaments/${season}/enrollment-state`,
          explicitReadContracts.publicEnrollmentState,
        )
      ).data;
    },
    async fixtures(season: string) {
      return (
        (await read(`/tournaments/${season}/competition`, competition)).data
          ?.fixtures ?? []
      );
    },
    async archive(season: string) {
      const { data } = await read(
        `/tournaments/${season}/configuration`,
        archivedTournament,
      );
      if (data.edition.slug !== season || !data.edition.archive)
        throw new ReadFailure("unavailable");
      return data.edition.archive;
    },
    async mra(osuId: number) {
      return (
        await read(
          `/players/${osuId}/mra`,
          explicitReadContracts.publicPlayerMra.strip(),
        )
      ).data;
    },
  };
}
