import {
  releasedArchiveStatistics,
  archiveStatisticsSummary,
} from "./archive-statistics-projection";
import { createHash } from "node:crypto";
import type * as S from "@/db/schema";
import {
  historicalArchiveSchema,
  publicHistoricalArchive,
  recordedArchiveMatch,
  type HistoricalArchive,
} from "./historical-archive";
import {
  archiveMpId,
  projectStatistics,
  supportsArchiveStatistics,
  type StatisticsPlay,
} from "./archive-statistics-model";
import {
  parseStatisticsSnapshot,
  statisticsSnapshotSchema,
} from "./statistics-snapshot";
import { STATISTICS_SCORE_POLICY } from "./statistics-score";

export const ARCHIVE_PROJECTOR_VERSION = 2;
export type StatisticsRow = typeof S.historicalStatistics.$inferSelect;
export type ArchiveState = typeof S.editionState.$inferSelect;
type Row<T> = Omit<T, "generationId">;
export type ArchiveReadData = {
  teams: Row<typeof S.archiveReadTeams.$inferInsert>[];
  people: Row<typeof S.archiveReadPeople.$inferInsert>[];
  picks: Row<typeof S.archiveReadPicks.$inferInsert>[];
  matches: Row<typeof S.archiveReadMatches.$inferInsert>[];
  mps: Row<typeof S.archiveReadMps.$inferInsert>[];
  pools: Row<typeof S.archiveReadPools.$inferInsert>[];
  maps: Row<typeof S.archiveReadMaps.$inferInsert>[];
  placements: Row<typeof S.archiveReadPlacements.$inferInsert>[];
  snapshots: Row<typeof S.archiveReadSnapshots.$inferInsert>[];
  games: Row<typeof S.archiveReadGames.$inferInsert>[];
  scores: Row<typeof S.archiveReadScores.$inferInsert>[];
  decisions: Row<typeof S.archiveReadDecisions.$inferInsert>[];
  plays: Row<typeof S.archiveReadPlays.$inferInsert>[];
};

/** JSONB object key order is insignificant; array order and null/absent are not. */
export function archiveContentHash(input: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, canonical(v)]),
      );
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
}
export function archiveSourceHash(state: ArchiveState, rows: StatisticsRow[]) {
  return archiveContentHash({
    archive: state.configuration?.archive,
    revision: state.configurationVersion,
    statistics: [...rows]
      .sort((a, b) => a.mpId - b.mpId)
      .map((row) => ({
        ...row,
        draft: parseStatisticsSnapshot(row.draft),
        published: row.published
          ? parseStatisticsSnapshot(row.published)
          : null,
      })),
    scorePolicy: STATISTICS_SCORE_POLICY,
    ezMultiplier: state.configuration?.ezScoreMultiplier ?? 1,
    projector: ARCHIVE_PROJECTOR_VERSION,
  });
}

export function buildArchiveReadData(
  state: ArchiveState,
  rows: StatisticsRow[],
) {
  const archive = historicalArchiveSchema.parse(state.configuration?.archive);
  if (archive.editionSlug !== state.slug)
    throw new Error("Archive edition scope mismatch.");
  const {
    teams,
    players,
    unresolvedPlayers,
    picks,
    staff,
    standings,
    finalPlacements,
    matches,
    pools,
    rosterReplacements,
    ...rest
  } = archive;
  const header: Record<string, unknown> = {
    ...rest,
    optionalArrays: {
      unresolvedPlayers: unresolvedPlayers !== undefined,
      finalPlacements: finalPlacements !== undefined,
      rosterReplacements: rosterReplacements !== undefined,
    },
    ...(rosterReplacements === undefined
      ? {}
      : {
          rosterReplacements: rosterReplacements.map(
            ({ people: _people, ...r }) => {
              void _people;
              return r;
            },
          ),
        }),
  };
  const data: ArchiveReadData = {
    teams: [],
    people: [],
    picks: [],
    matches: [],
    mps: [],
    pools: [],
    maps: [],
    placements: [],
    snapshots: [],
    games: [],
    scores: [],
    decisions: [],
    plays: [],
  };
  teams.forEach((t, position) =>
    data.teams.push({
      position,
      teamKey: t.id,
      name: t.name,
      payload: { ...t },
    }),
  );
  const person = (
    kind: string,
    value: {
      username: string;
      osuId?: number | null;
      teamId?: string | null;
      role?: string;
      tier?: number | null;
      position?: string;
    },
    sourcePosition: number,
    personPosition = 0,
  ) =>
    data.people.push({
      position: data.people.length,
      kind,
      sourcePosition,
      personPosition,
      osuId: value.osuId ?? null,
      username: value.username,
      teamId: value.teamId ?? null,
      role: value.role ?? value.position ?? "player",
      tier: value.tier ?? null,
      payload: { ...value },
    });
  players.forEach((p, i) => person("players", p, i));
  unresolvedPlayers?.forEach((p, i) => person("unresolvedPlayers", p, i));
  staff.forEach((p, i) => person("staff", p, i));
  rosterReplacements?.forEach((r, i) =>
    r.people.forEach((p, j) => {
      person("rosterReplacements", p, i, j);
      Object.assign(data.people.at(-1)!, {
        teamId: r.teamId,
        role: "player",
        tier: r.tier,
      });
    }),
  );
  picks.forEach((p, position) =>
    data.picks.push({
      position,
      round: p.round,
      pick: p.pick,
      teamId: p.teamId,
      osuId: p.osuId,
      payload: { ...p },
    }),
  );
  matches.forEach(({ mpUrls, ...m }, position) => {
    data.matches.push({
      position,
      fixtureId: m.id,
      label: m.label,
      scoreA: m.score?.[0] ?? null,
      scoreB: m.score?.[1] ?? null,
      forfeitWinner: m.forfeitWinner ?? null,
      adjudication: m.adjudication?.kind ?? null,
      stage: m.stage,
      phase: m.round?.phase ?? null,
      roundIndex: m.round?.index ?? null,
      teamA: m.teamA,
      teamB: m.teamB,
      scheduledAt: m.scheduledAt,
      recorded: recordedArchiveMatch({ ...m, mpUrls }),
      payload: m,
    });
    mpUrls.forEach((url) =>
      data.mps.push({
        position: data.mps.length,
        fixtureId: m.id,
        mpId: archiveMpId(url),
        url,
        payload: { url },
      }),
    );
  });
  pools.forEach(({ maps, ...p }, position) => {
    data.pools.push({ position, poolId: p.id, name: p.name, payload: p });
    maps.forEach((m) =>
      data.maps.push({
        position: data.maps.length,
        poolId: p.id,
        slot: m.slot,
        beatmapId: m.beatmapId,
        title: m.title,
        mapper: m.mapper,
        stars: m.stars,
        bpm: m.bpm,
        drainSeconds: m.drainSeconds,
        cs: m.cs,
        ar: m.ar,
        od: m.od,
        payload: { ...m },
      }),
    );
  });
  const placement = (
    kind: string,
    p:
      | HistoricalArchive["standings"][number]
      | NonNullable<HistoricalArchive["finalPlacements"]>[number],
  ) =>
    data.placements.push({
      position: data.placements.length,
      kind,
      teamId: p.teamId,
      scope: p.scope ?? "unknown",
      placementStart: p.placement?.start ?? null,
      placementEnd: p.placement?.end ?? null,
      rank: "rank" in p ? p.rank : null,
      wins: "wins" in p ? p.wins : null,
      losses: "losses" in p ? p.losses : null,
      mapsWon: "mapsWon" in p ? p.mapsWon : null,
      mapsLost: "mapsLost" in p ? p.mapsLost : null,
      tied: p.tied ?? null,
      qualified: p.qualified ?? null,
      official: p.official ?? null,
      payload: { ...p },
    });
  standings.forEach((p) => placement("standings", p));
  finalPlacements?.forEach((p) => placement("finalPlacements", p));
  for (const row of rows)
    for (const kind of ["draft", "published"] as const) {
      const snapshot = row[kind];
      if (!snapshot) continue;
      statisticsSnapshotSchema.parse(snapshot);
      const { source, ...review } = snapshot;
      const { games, ...sourceHeader } = source;
      data.snapshots.push({
        mpId: row.mpId,
        kind,
        fixtureId: row.fixtureId,
        rowVersion: row.version,
        snapshotHash: archiveContentHash(snapshot),
        archiveKey: snapshot.archiveKey,
        sourceFingerprint: source.fingerprint,
        poolId: snapshot.poolId,
        publishedAt: kind === "published" ? row.publishedAt : null,
        updatedAt: row.updatedAt,
        reviewedBy: snapshot.reviewedBy ?? null,
        reviewedAt: snapshot.reviewedAt ?? null,
        adjudication:
          snapshot.adjudication?.kind ??
          (snapshot.technicalAdjudication ? "technical" : null),
        payload: { ...review, source: sourceHeader },
      });
      games.forEach(({ scores, ...g }, position) => {
        data.games.push({
          mpId: row.mpId,
          kind,
          position,
          gameId: g.id,
          beatmapId: g.beatmapId,
          included: snapshot.included.includes(g.id),
          scoringType: g.scoringType,
          startTime: g.startTime,
          endTime: g.endTime,
          mode: g.mode,
          teamType: g.teamType,
          mods: g.mods,
          payload: g,
        });
        scores.forEach((score, i) =>
          data.scores.push({
            mpId: row.mpId,
            kind,
            gamePosition: position,
            position: i,
            osuId: score.osuId,
            total: score.total,
            accuracy: score.accuracy,
            combo: score.combo,
            passed: score.passed,
            rawTeam: score.team,
            mods: score.mods,
            hitGreat: score.hitCounts?.great ?? null,
            hitOk: score.hitCounts?.ok ?? null,
            hitMeh: score.hitCounts?.meh ?? null,
            hitMiss: score.hitCounts?.miss ?? null,
            payload: { ...score },
          }),
        );
      });
      const decisions = [
        ...snapshot.included.map((gameId) => ({
          gameId,
          decision: "included",
          osuId: null,
          reason: null,
        })),
        ...(snapshot.excludedGames ?? []).map((g) => ({
          ...g,
          decision: "excluded-game",
          osuId: null,
        })),
        ...(snapshot.excludedScores ?? []).map((g) => ({
          ...g,
          decision: "excluded-score",
          reason: g.reason ?? null,
        })),
        ...(snapshot.rosterTeamGames ?? []).map((gameId) => ({
          gameId,
          decision: "roster-team",
          osuId: null,
          reason: null,
        })),
      ];
      decisions.forEach((d, position) =>
        data.decisions.push({
          mpId: row.mpId,
          kind,
          position,
          ...d,
          payload: { ...d },
        }),
      );
    }
  // Use exactly the existing anonymous eligibility checks and score policy. Draft
  // decisions and source-only appendices never establish public plays.
  const publicArchive = supportsArchiveStatistics(archive.editionSlug)
    ? publicHistoricalArchive(archive)
    : null;
  const release = publicArchive
    ? releasedArchiveStatistics(publicArchive, rows)
    : null;
  if (publicArchive && release) {
    const { fixtures, published } = release;
    for (const fixture of fixtures) {
      const sources = published.filter((row) => row.fixtureId === fixture.id);
      for (const row of sources)
        for (const play of projectStatistics(
          publicArchive,
          fixture.id,
          row.published!,
          state.configuration?.ezScoreMultiplier ?? 1,
        ))
          data.plays.push({
            position: data.plays.length,
            fixtureId: play.fixtureId,
            mpId: play.mpId,
            gameId: play.gameId,
            osuId: play.osuId,
            teamId: play.teamId,
            stage: play.stage,
            title: play.title,
            slot: play.slot,
            beatmapId: play.beatmapId,
            score: play.score,
            rawScore: play.rawScore ?? play.score,
            scoreMultiplier: play.scoreMultiplier ?? 1,
            playedAt: play.at,
            scoringType: play.scoringType,
            winnerTeamId: play.winnerTeamId ?? null,
            accuracy: play.accuracy,
            combo: play.combo,
            passed: play.passed,
            relative: play.relative,
            mods: play.mods,
            hitGreat: play.hits?.great ?? null,
            hitOk: play.hits?.ok ?? null,
            hitMeh: play.hits?.meh ?? null,
            hitMiss: play.hits?.miss ?? null,
            optionalFields: [
              "winnerTeamId",
              "rawScore",
              "scoreMultiplier",
              "hits",
            ].filter((k) => play[k as keyof StatisticsPlay] !== undefined),
            payload: { ...play },
          });
    }
  }
  return {
    header,
    publicStatistics:
      publicArchive && release
        ? archiveStatisticsSummary(
            publicArchive,
            release,
            state.configuration?.ezScoreMultiplier ?? 1,
          )
        : null,
    data,
    archiveHash: archiveContentHash(archive),
    sourceHash: archiveSourceHash(state, rows),
  };
}

export function restoreArchiveReadData(
  header: Record<string, unknown>,
  data: ArchiveReadData,
): HistoricalArchive {
  const { optionalArrays, rosterReplacements, ...rest } = header;
  const flags = optionalArrays as Record<string, boolean>;
  const people = (kind: string) =>
    data.people
      .filter((p) => p.kind === kind)
      .sort(
        (a, b) =>
          a.sourcePosition - b.sourcePosition ||
          a.personPosition - b.personPosition,
      )
      .map((p) => p.payload);
  return historicalArchiveSchema.parse({
    ...rest,
    teams: data.teams.map((t) => t.payload),
    players: people("players"),
    picks: data.picks.map((p) => p.payload),
    staff: people("staff"),
    standings: data.placements
      .filter((p) => p.kind === "standings")
      .map((p) => p.payload),
    matches: data.matches.map((m) => ({
      ...m.payload,
      mpUrls: data.mps
        .filter((p) => p.fixtureId === m.fixtureId)
        .map((p) => p.url),
    })),
    pools: data.pools.map((p) => ({
      ...p.payload,
      maps: data.maps
        .filter((m) => m.poolId === p.poolId)
        .map((m) => m.payload),
    })),
    ...(flags.unresolvedPlayers
      ? { unresolvedPlayers: people("unresolvedPlayers") }
      : {}),
    ...(flags.finalPlacements
      ? {
          finalPlacements: data.placements
            .filter((p) => p.kind === "finalPlacements")
            .map((p) => p.payload),
        }
      : {}),
    ...(flags.rosterReplacements
      ? {
          rosterReplacements: (
            rosterReplacements as Record<string, unknown>[]
          ).map((r, i) => ({
            ...r,
            people: data.people
              .filter(
                (p) =>
                  p.kind === "rosterReplacements" && p.sourcePosition === i,
              )
              .sort((a, b) => a.personPosition - b.personPosition)
              .map((p) => p.payload),
          })),
        }
      : {}),
  });
}
export function restoreStatisticsReadData(
  data: ArchiveReadData,
  mpId: number,
  kind: string,
) {
  const snapshot = data.snapshots.find(
    (s) => s.mpId === mpId && s.kind === kind,
  );
  if (!snapshot) return null;
  const source = snapshot.payload.source as Record<string, unknown>;
  return statisticsSnapshotSchema.parse({
    ...snapshot.payload,
    source: {
      ...source,
      games: data.games
        .filter((g) => g.mpId === mpId && g.kind === kind)
        .sort((a, b) => a.position - b.position)
        .map((g) => ({
          ...g.payload,
          scores: data.scores
            .filter(
              (s) =>
                s.mpId === mpId &&
                s.kind === kind &&
                s.gamePosition === g.position,
            )
            .sort((a, b) => a.position - b.position)
            .map((s) => s.payload),
        })),
    },
  });
}
export const archivePlayPayload = (payload: Record<string, unknown>) =>
  payload as unknown as StatisticsPlay;
