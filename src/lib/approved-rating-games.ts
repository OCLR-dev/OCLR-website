import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  fixtures,
  tournamentRounds,
  tournamentStages,
  matchResults,
  resultRevisions,
  matchImports,
  matchGames,
  resultGameClaims,
} from "@/db/schema";
import { matchGameSchema, reviewedResultSchema } from "./match-model";
import type { RatingGame } from "./yumu-rating";
import { readTournament } from "./tournaments";
import { statisticsScore } from "./statistics-score";
import { slotLabel } from "./mappool-model";
export type RatingReader = Pick<ReturnType<typeof db>, "select">;
/** One authoritative adapter shared by ratings and awards. No imports/latest-pointer reads. */
export async function approvedRatingGames(
  slug: string,
  reader: RatingReader,
): Promise<RatingGame[]> {
  const ezScoreMultiplier =
    (await readTournament(slug, reader))?.edition.ezScoreMultiplier ?? 1;
  // Follow the published revision pointer, even while a newer correction awaits review.
  const sources = await reader
    .select({
      fixture: fixtures,
      revision: resultRevisions,
      fingerprint: matchImports.fingerprint,
    })
    .from(fixtures)
    .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtures.roundId))
    .innerJoin(
      tournamentStages,
      eq(tournamentStages.id, tournamentRounds.stageId),
    )
    .innerJoin(matchResults, eq(matchResults.fixtureId, fixtures.id))
    .innerJoin(
      resultRevisions,
      and(
        eq(resultRevisions.fixtureId, fixtures.id),
        eq(resultRevisions.revision, matchResults.publishedRevision),
      ),
    )
    .innerJoin(
      matchImports,
      and(
        eq(matchImports.id, resultRevisions.importId),
        eq(matchImports.fixtureId, fixtures.id),
      ),
    )
    .where(
      and(
        eq(fixtures.editionSlug, slug),
        ne(tournamentStages.kind, "exhibition"),
        isNotNull(fixtures.publishedAt),
        isNotNull(matchResults.publishedAt),
        isNotNull(resultRevisions.approvedAt),
        isNotNull(resultRevisions.approvedBy),
      ),
    );
  const importIds = sources.map((s) => s.revision.importId);
  const normalized = importIds.length
    ? await reader
        .select()
        .from(matchGames)
        .where(inArray(matchGames.importId, importIds))
    : [];
  const claims = await reader
    .select()
    .from(resultGameClaims)
    .where(eq(resultGameClaims.editionSlug, slug));
  const games: RatingGame[] = [];
  for (const source of sources.sort((a, b) =>
    a.fixture.id.localeCompare(b.fixture.id),
  )) {
    if (source.fixture.status === "cancelled") continue;
    const proposal = reviewedResultSchema.safeParse(source.revision.proposal);
    const common = {
      fixtureId: source.fixture.id,
      roundId: source.fixture.roundId,
      at: source.fixture.scheduledAt?.toISOString() ?? null,
      revision: source.revision.revision,
      fingerprint: source.fingerprint,
      approvalFingerprint: createHash("sha256")
        .update(JSON.stringify([source.fingerprint, source.revision.proposal]))
        .digest("hex"),
      teamIds: proposal.success ? proposal.data.teamIds : [],
      winnerTeamId: null as string | null,
      ...(ezScoreMultiplier === 1 ? {} : { ezScoreMultiplier }),
    };
    const rules = proposal.success ? proposal.data.rulesSnapshot : null;
    if (!proposal.success || !rules) {
      games.push({
        ...common,
        gameId: -games.length - 1,
        scores: [],
        problem: "Unsupported approved result; review required.",
      });
      continue;
    }
    for (const reviewed of proposal.data.games) {
      const row = normalized.find(
        (g) =>
          g.importId === source.revision.importId &&
          g.externalGameId === reviewed.gameId,
      );
      const parsed = matchGameSchema.safeParse(row?.data);
      let problem: string | undefined;
      const scores: RatingGame["scores"] = [];
      if (
        !parsed.success ||
        proposal.data.sourceFingerprint !== source.fingerprint ||
        !claims.some(
          (c) =>
            c.externalGameId === reviewed.gameId &&
            c.fixtureId === source.fixture.id,
        ) ||
        !source.fixture.homeTeamId ||
        !source.fixture.awayTeamId ||
        proposal.data.roundId !== source.fixture.roundId ||
        proposal.data.teamIds[0] !== source.fixture.homeTeamId ||
        proposal.data.teamIds[1] !== source.fixture.awayTeamId
      ) {
        problem = "Approved game source or team attribution needs review.";
      } else {
        const game = parsed.data;
        if (
          !game.endTime ||
          game.problems.length ||
          game.mode !== rules.mode ||
          game.teamType !== rules.teamType ||
          game.scoringType !== rules.scoringType
        )
          problem = "Unsupported or incomplete scored game.";
        for (const score of game.scores) {
          const id = score.osuId;
          const attribution = reviewed.attribution?.filter(
            (a) =>
              a.osuId === id &&
              a.evidence &&
              a.teamId &&
              proposal.data.teamIds.includes(a.teamId),
          );
          const rosterTeams = proposal.data.rosterSnapshot.filter((r) =>
            r.osuIds.includes(id ?? -1),
          );
          const substitution =
            rules.allowSubstitutions &&
            proposal.data.decisions
              .find((d) => d.gameId === game.id)
              ?.substitutions.filter(
                (s) =>
                  s.osuId === id && proposal.data.teamIds.includes(s.teamId),
              );
          const known = attribution
            ? attribution.length === 1
            : rosterTeams.length === 1 ||
              (substitution && substitution.length === 1);
          if (!id || score.total === null || score.problems.length || !known) {
            problem = "Player score or approved attribution needs review.";
            continue;
          }
          const mods = [...new Set([...game.mods, ...score.mods])].sort();
          const unadjustedTotal =
            score.passed === false && rules.failedScorePolicy === "zero"
              ? 0
              : score.total;
          const adjusted = statisticsScore(
            unadjustedTotal,
            mods,
            ezScoreMultiplier,
          );
          scores.push({
            userId: id,
            teamId: (attribution?.[0]?.teamId ??
              rosterTeams[0]?.teamId ??
              (substitution && substitution[0]?.teamId))!,
            total: adjusted.score,
            rawTotal: score.total,
            unadjustedTotal,
            scoreMultiplier: adjusted.scoreMultiplier,
            mods,
            accuracy: score.accuracy,
          });
        }
      }
      const entry = proposal.data.poolSnapshot?.entries.find(
        (entry) => parsed.success && entry.beatmapId === parsed.data.beatmapId,
      );
      games.push({
        ...common,
        gameId: reviewed.gameId,
        slot: entry ? slotLabel(entry.category, entry.position) : null,
        playedAt: parsed.success
          ? (parsed.data.startTime ?? parsed.data.endTime)
          : null,
        winnerTeamId: reviewed.winnerTeamId,
        beatmapId: parsed.success ? parsed.data.beatmapId : null,
        beatmap: parsed.success ? parsed.data.beatmap : null,
        scoringType: parsed.success ? parsed.data.scoringType : null,
        scores: scores.sort((a, b) => a.userId - b.userId),
        ...(problem ? { problem } : {}),
      });
    }
  }
  return games;
}
