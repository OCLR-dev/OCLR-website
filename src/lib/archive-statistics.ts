import {
  releasedArchiveStatistics,
  archiveStatisticsSummary,
} from "./archive-statistics-projection";
import {
  readHistoricalStatistics,
  persistHistoricalStatistics,
  lockHistoricalStatistics,
  syncArchiveRelations,
} from "./archive-relations";
import {
  relationalPublicPlays,
  relationalPublicStatistics,
  relationalPlayerArchivePlays,
} from "./archive-read";
import { statisticsArchiveKey } from "./archive-statistics-key";
import {
  hasStatisticsAdjudication,
  parseStatisticsSnapshot,
  statisticsSnapshotSchema,
} from "./statistics-snapshot";
import {
  archiveMatchDetails,
  withStatisticsScores,
} from "./match-details-model";

import { ratingSnapshot } from "./ratings";
import type { RatingGame } from "./yumu-rating";
import { db } from "@/db";
import { editionEvents, editionState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import {
  archiveMpId,
  canExcludeNonParticipantScore,
  canExcludeStatisticsBenchScore,
  fixtureStatisticsIssues,
  projectStatistics,
  statisticsFixtures,
  statisticsGameIssues,
  supportsArchiveStatistics,
  suggestStatisticsPool,
  validStatisticsExclusions,
  type StatisticsSnapshot,
} from "./archive-statistics-model";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  hasCapability,
} from "./auth/staff";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import {
  exchangeArchivePlayers,
  type archivePlayerExchangeConfirmation,
  type HistoricalArchive,
} from "./historical-archive";
import { changeHistoricalStatisticsWrite } from "./results-publication-write-contracts";
import { HttpError } from "./http";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { fetchMatchSource } from "./osu-matches";
import { readTournament } from "./tournaments";
import { statisticsScore } from "./statistics-score";

type Reader = Pick<ReturnType<typeof db>, "select">;
export { statisticsArchiveKey } from "./archive-statistics-key";

async function archiveFor(
  slug: string,
  reader: Reader = db(),
  publicOnly = false,
) {
  const t = await readTournament(slug, reader, publicOnly);
  if (!supportsArchiveStatistics(slug) || !t?.edition.archive)
    throw new HttpError(404, "Historical statistics are unavailable.");
  return t.edition.archive;
}
async function stored(slug: string, reader: Reader = db(), fixtureId?: string) {
  const rows = await readHistoricalStatistics(slug, reader, fixtureId);
  return rows.map((r) => ({
    ...r,
    draft: parseStatisticsSnapshot(r.draft),
    published: r.published ? parseStatisticsSnapshot(r.published) : null,
  }));
}

/** Called only by explicit Admin roster confirmation under the edition lock. */
export async function preserveStatisticsForRosterAddition(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  actor: User,
  before: HistoricalArchive,
  after: HistoricalArchive,
) {
  await assertCapability(actor, "approve_results", before.editionSlug, tx);
  // Never offer this as a general way to bless a changed archive key.
  const { players: oldPlayers, sourceFacts: _oldFacts, ...oldRest } = before;
  const { players: newPlayers, sourceFacts: _newFacts, ...newRest } = after;
  void _oldFacts;
  void _newFacts;
  if (
    !isDeepStrictEqual(oldRest, newRest) ||
    newPlayers.length !== oldPlayers.length + 1 ||
    !isDeepStrictEqual(oldPlayers, newPlayers.slice(0, oldPlayers.length))
  )
    throw new HttpError(409, "Archive changed. Reload before retrying.");
  await preserveStatisticsForRosterChange(tx, actor, before, after);
}

/** A narrowly validated exchange is not permission to revalidate arbitrary edits. */
export async function preserveStatisticsForRosterExchange(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  actor: User,
  before: HistoricalArchive,
  after: HistoricalArchive,
  confirmation: z.infer<typeof archivePlayerExchangeConfirmation>,
) {
  await assertCapability(actor, "approve_results", before.editionSlug, tx);
  if (!isDeepStrictEqual(after, exchangeArchivePlayers(before, confirmation)))
    throw new HttpError(409, "Archive changed. Reload before retrying.");
  await preserveStatisticsForRosterChange(tx, actor, before, after);
}

async function preserveStatisticsForRosterChange(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  actor: User,
  before: HistoricalArchive,
  after: HistoricalArchive,
) {
  const oldKey = statisticsArchiveKey(before);
  const newKey = statisticsArchiveKey(after);
  await lockHistoricalStatistics(tx, before.editionSlug);
  const rows = await stored(before.editionSlug, tx);
  const unchanged = (fixtureId: string, s: StatisticsSnapshot) => {
    if (
      s.archiveKey !== oldKey ||
      !statisticsFixtures(after).some(
        (f) =>
          f.id === fixtureId &&
          f.mpUrls.some((u) => archiveMpId(u) === s.source.match.id),
      ) ||
      [before, after].some(
        (a) => !validStatisticsExclusions(s, a, fixtureId),
      ) ||
      (!after.pools.some((p) => p.id === s.poolId) &&
        !(s.allowUnlistedMaps && s.poolId === "")) ||
      new Set(s.included).size !== s.included.length ||
      new Set(s.rosterTeamGames ?? []).size !==
        (s.rosterTeamGames ?? []).length ||
      (s.rosterTeamGames ?? []).some(
        (id) => !s.source.games.some((g) => g.id === id),
      ) ||
      s.included.some((id) => {
        const g = s.source.games.find((g) => g.id === id);
        return (
          !g ||
          [before, after].some(
            (a) =>
              statisticsGameIssues(
                a,
                fixtureId,
                s.poolId,
                g,
                s.allowUnlistedMaps,
                s.excludedScores,
                s.rosterTeamGames?.includes(id),
              ).length,
          )
        );
      })
    )
      return false;
    return isDeepStrictEqual(
      projectStatistics(before, fixtureId, s),
      projectStatistics(after, fixtureId, s),
    );
  };
  for (const fixture of statisticsFixtures(before)) {
    const released = rows.filter(
      (r) => r.fixtureId === fixture.id && r.published?.archiveKey === oldKey,
    );
    if (!released.length) continue;
    const snapshots = released.map((r) => r.published!);
    if (
      released.some((r) => !unchanged(r.fixtureId, r.published!)) ||
      [before, after].some(
        (a) => fixtureStatisticsIssues(a, fixture.id, snapshots).length,
      )
    )
      throw new HttpError(
        409,
        "Published statistics would change. Review or withdraw them before changing this roster.",
      );
  }
  const versions = [];
  for (const row of rows) {
    const draft = unchanged(row.fixtureId, row.draft)
      ? { ...row.draft, archiveKey: newKey }
      : row.draft;
    const published =
      row.published?.archiveKey === oldKey
        ? { ...row.published, archiveKey: newKey }
        : row.published;
    // A current published snapshot must have been fully checked above.
    if (
      row.published?.archiveKey === oldKey &&
      !unchanged(row.fixtureId, row.published)
    )
      throw new HttpError(
        409,
        "Published statistics would change. Review or withdraw them before changing this roster.",
      );
    if (draft === row.draft && published === row.published) continue;
    await persistHistoricalStatistics(tx, before.editionSlug, row.mpId, row, {
      draft,
      published,
      version: row.version + 1,
      updatedAt: new Date(),
    });
    versions.push({
      mpId: row.mpId,
      fromVersion: row.version,
      toVersion: row.version + 1,
      draft: draft !== row.draft,
      published: published !== row.published,
    });
  }
  if (versions.length)
    await tx.insert(editionEvents).values({
      editionSlug: before.editionSlug,
      actorId: actor.osuId,
      kind: "statistics_roster_revalidation",
      detail: { oldKey, newKey, versions },
    });
}
async function databaseStatisticsWorkspace(
  actor: User,
  slug: string,
  fixtureId = "",
): Promise<StatisticsWorkspace> {
  await assertReadCapability(actor, "record_results", slug);
  const archive = await archiveFor(slug);
  const key = statisticsArchiveKey(archive);
  const rows = (await stored(slug, db())).filter((r) =>
    statisticsFixtures(archive).some(
      (f) =>
        f.id === r.fixtureId && f.mpUrls.some((u) => archiveMpId(u) === r.mpId),
    ),
  );
  const summaries = rows.map((r) => ({
    mpId: r.mpId,
    fixtureId: r.fixtureId,
    version: r.version,
    importedAt: r.draft.source.fetchedAt,
    publishedAt:
      r.published?.archiveKey === key
        ? (r.publishedAt?.toISOString() ?? null)
        : null,
    changes:
      !r.published ||
      r.published.source.fingerprint !== r.draft.source.fingerprint ||
      r.published.poolId !== r.draft.poolId ||
      r.published.allowUnlistedMaps !== r.draft.allowUnlistedMaps ||
      JSON.stringify(r.published.excludedScores ?? []) !==
        JSON.stringify(r.draft.excludedScores ?? []) ||
      !isDeepStrictEqual(r.published.adjudication, r.draft.adjudication) ||
      !isDeepStrictEqual(r.published.excludedGames, r.draft.excludedGames) ||
      r.published.evidenceUrl !== r.draft.evidenceUrl ||
      r.published.reviewedBy !== r.draft.reviewedBy ||
      r.published.reviewedAt !== r.draft.reviewedAt ||
      JSON.stringify(r.published.rosterTeamGames ?? []) !==
        JSON.stringify(r.draft.rosterTeamGames ?? []) ||
      JSON.stringify(r.published.included) !== JSON.stringify(r.draft.included),
    stale: r.draft.archiveKey !== key,
  }));
  const fixtures = statisticsFixtures(archive).map((m) => ({
    id: m.id,
    label: m.label,
    stage: m.stage,
    score: m.score,
    teams: [m.teamA, m.teamB].map(
      (id) => archive.teams.find((t) => t.id === id)!.name,
    ),
    mpIds: m.mpUrls.map(archiveMpId),
  }));
  return {
    slug,
    fixtures,
    summaries,
    canPublish: await hasCapability(actor, "approve_results", slug),
    pools: archive.pools.map(({ id, name }) => ({ id, name })),
    reviews: rows
      .filter((r) => r.fixtureId === fixtureId)
      .map((r) => ({
        mpId: r.mpId,
        version: r.version,
        poolId: r.draft.poolId,
        allowUnlistedMaps: r.draft.allowUnlistedMaps ?? false,
        excludedScores: r.draft.excludedScores ?? [],
        rosterTeamGames: r.draft.rosterTeamGames ?? [],
        technicalAdjudication: hasStatisticsAdjudication(r.draft),
        adjudication: r.draft
          .adjudication as StatisticsSnapshot["adjudication"],
        excludedGames: r.draft
          .excludedGames as StatisticsSnapshot["excludedGames"],
        reviewedBy: (r.draft.reviewedBy ?? null) as number | null | undefined,
        reviewedAt: (r.draft.reviewedAt ?? null) as string | null | undefined,
        evidenceUrl: (r.draft.evidenceUrl ?? null) as string | null | undefined,
        complete: r.draft.source.complete,
        fetchedAt: r.draft.source.fetchedAt,
        warnings: r.draft.source.warnings,
        games: r.draft.source.games.map((game) => ({
          game,
          included: r.draft.included.includes(game.id),
          nonParticipantIds: game.scores
            .filter(
              (score) =>
                canExcludeNonParticipantScore(archive, r.fixtureId, score) ||
                canExcludeStatisticsBenchScore(
                  archive,
                  r.fixtureId,
                  game,
                  score,
                  (r.draft.excludedScores ?? [])
                    .filter((e) => e.gameId === game.id)
                    .map((e) => e.osuId),
                ),
            )
            .map((score) => score.osuId!),
          issues: statisticsGameIssues(
            archive,
            r.fixtureId,
            r.draft.poolId,
            game,
            r.draft.allowUnlistedMaps,
            r.draft.excludedScores,
            r.draft.rosterTeamGames?.includes(game.id),
          ),
        })),
      })),
    blockers: fixtureId
      ? fixtureStatisticsIssues(
          archive,
          fixtureId,
          rows.filter((r) => r.fixtureId === fixtureId).map((r) => r.draft),
        )
      : [],
  };
}
export async function statisticsWorkspace(
  actor: User,
  slug: string,
  fixtureId = "",
): Promise<StatisticsWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<StatisticsWorkspace>("statisticsWorkspace", {
      slug,
      fixtureId,
    });
  }
  return databaseStatisticsWorkspace(actor, slug, fixtureId);
}

export type StatisticsWorkspace = ExplicitReadData<"statisticsWorkspace">;

export async function statisticsCommand(
  actor: User,
  slug: string,
  input: unknown,
): Promise<StatisticsWorkspace> {
  const parsed = changeHistoricalStatisticsWrite.request.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid statistics request.");
  const c = parsed.data;
  const permission =
    c.action === "publish" || c.action === "withdraw"
      ? "approve_results"
      : "record_results";
  await assertCapability(actor, permission, slug);
  if (
    c.action === "review" &&
    (c.technicalAdjudication ||
      c.adjudication ||
      c.rosterTeamGames.length ||
      c.excludedScores.some((e) => e.reason === "non-participant"))
  )
    await assertCapability(actor, "approve_results", slug);
  const archive = await archiveFor(slug);
  const key = statisticsArchiveKey(archive);
  const fixture = statisticsFixtures(archive).find((m) =>
    "mpId" in c
      ? m.mpUrls.some((u) => archiveMpId(u) === c.mpId)
      : m.id === c.fixtureId,
  );
  if (!fixture)
    throw new HttpError(
      400,
      "Use an MP link already recorded in this edition.",
    );
  let imported: StatisticsSnapshot | undefined;
  if (c.action === "import") {
    const existing = (await stored(slug)).find((r) => r.mpId === c.mpId);
    if ((existing?.version ?? 0) !== c.expectedVersion)
      throw new HttpError(409, "Statistics changed. Reload before retrying.");
    if (
      existing &&
      Date.now() - Date.parse(existing.draft.source.fetchedAt) < 30_000
    )
      throw new HttpError(429, "Wait before refreshing this MP.");
    // Provider calls occur outside the DB transaction; all authority is checked again below.
    const source = await fetchMatchSource(c.mpId);
    if (
      source.games.length > 500 ||
      Buffer.byteLength(JSON.stringify(source)) > 2_000_000
    )
      throw new HttpError(413, "MP statistics exceed the import limit.");
    const poolId = suggestStatisticsPool(archive, source);
    imported = { archiveKey: key, source, poolId, included: [] };
  }
  await db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, permission, slug, tx);
    await lockHistoricalStatistics(tx, slug);
    if (
      c.action === "review" &&
      (c.technicalAdjudication ||
        c.adjudication ||
        c.rosterTeamGames.length ||
        c.excludedScores.some((e) => e.reason === "non-participant"))
    )
      await assertCapability(actor, "approve_results", slug, tx);
    const currentArchive = await archiveFor(slug, tx);
    if (statisticsArchiveKey(currentArchive) !== key)
      throw new HttpError(409, "Archive changed. Reload before retrying.");
    const rows = await stored(slug, tx);
    const relevant = rows.filter(
      (r) =>
        r.fixtureId === fixture.id &&
        fixture.mpUrls.some((u) => archiveMpId(u) === r.mpId),
    );
    const selected =
      "mpId" in c ? rows.find((r) => r.mpId === c.mpId) : undefined;
    if (
      "expectedVersion" in c &&
      (selected?.version ?? 0) !== c.expectedVersion
    )
      throw new HttpError(409, "Statistics changed. Reload before retrying.");
    if (
      selected &&
      selected.fixtureId !== fixture.id &&
      selected.draft.archiveKey === key
    )
      throw new HttpError(409, "Archive changed. Reload before retrying.");
    let reviewedSnapshot: StatisticsSnapshot | undefined;
    if (c.action === "import") {
      if (
        selected &&
        selected.draft.archiveKey === key &&
        selected.draft.source.fingerprint === imported!.source.fingerprint
      )
        return;
      if (selected)
        await persistHistoricalStatistics(tx, slug, c.mpId, selected, {
          fixtureId: fixture.id,
          draft: imported!,
          version: selected.version + 1,
          updatedAt: new Date(),
        });
      else
        await persistHistoricalStatistics(tx, slug, c.mpId, undefined, {
          fixtureId: fixture.id,
          version: 1,
          draft: imported!,
        });
    } else if (c.action === "review") {
      if (!selected || selected.draft.archiveKey !== key)
        throw new HttpError(409, "Import the current archive MP first.");
      if (
        c.adjudication !== undefined &&
        c.technicalAdjudication !== undefined &&
        Boolean(c.adjudication) !== c.technicalAdjudication
      )
        throw new HttpError(400, "Invalid statistics request.");
      const adjudication =
        c.adjudication !== undefined
          ? c.adjudication
          : c.technicalAdjudication
            ? (selected.draft.adjudication ?? { kind: "technical" as const })
            : null;
      const draft: StatisticsSnapshot = {
        ...selected.draft,
        poolId: c.poolId,
        included: c.included,
        allowUnlistedMaps: c.allowUnlistedMaps,
        excludedScores: c.excludedScores,
        rosterTeamGames: c.rosterTeamGames,
        adjudication,
        excludedGames:
          c.excludedGames ??
          selected.draft.source.games
            .filter((g) => !c.included.includes(g.id))
            .map(
              (g) =>
                selected.draft.excludedGames?.find(
                  (e) => e.gameId === g.id,
                ) ?? { gameId: g.id, reason: "unknown" as const },
            ),
        reviewedBy: actor.osuId,
        reviewedAt: new Date().toISOString(),
        evidenceUrl:
          c.evidenceUrl === undefined
            ? selected.draft.evidenceUrl
            : (c.evidenceUrl ?? undefined),
      };
      if (
        !statisticsSnapshotSchema.safeParse(draft).success ||
        !validStatisticsExclusions(draft, archive, fixture.id) ||
        new Set(c.rosterTeamGames).size !== c.rosterTeamGames.length ||
        c.rosterTeamGames.some(
          (id) => !draft.source.games.some((g) => g.id === id),
        ) ||
        (!archive.pools.some((p) => p.id === c.poolId) &&
          !(c.allowUnlistedMaps && c.poolId === "")) ||
        new Set(c.included).size !== c.included.length ||
        c.included.some((id) => {
          const game = draft.source.games.find((g) => g.id === id);
          return (
            !game ||
            statisticsGameIssues(
              archive,
              fixture.id,
              c.poolId,
              game,
              c.allowUnlistedMaps,
              c.excludedScores,
              c.rosterTeamGames.includes(id),
            ).length > 0
          );
        })
      )
        throw new HttpError(
          400,
          "Only eligible recorded games can be selected.",
        );
      reviewedSnapshot = draft;
      await persistHistoricalStatistics(tx, slug, c.mpId, selected, {
        draft,
        version: selected.version + 1,
        updatedAt: new Date(),
      });
    } else {
      if (
        !relevant.length ||
        relevant.some(
          (r) => c.expectedVersions[String(r.mpId)] !== r.version,
        ) ||
        Object.keys(c.expectedVersions).length !== relevant.length
      )
        throw new HttpError(409, "Statistics changed. Reload before retrying.");
      if (c.action === "publish") {
        if (relevant.some((r) => r.draft.archiveKey !== key))
          throw new HttpError(409, "Import the current archive MP first.");
        const issues = fixtureStatisticsIssues(
          archive,
          fixture.id,
          relevant.map((r) => r.draft),
        );
        if (issues.length) throw new HttpError(400, issues[0]);
        const other = rows.filter(
          (r) => r.fixtureId !== fixture.id && r.published?.archiveKey === key,
        );
        const claimed = new Set(other.flatMap((r) => r.published!.included));
        if (
          relevant.some((r) => r.draft.included.some((id) => claimed.has(id)))
        )
          throw new HttpError(
            409,
            "A game is already published for another match.",
          );
      }
      for (const r of relevant)
        await persistHistoricalStatistics(tx, slug, r.mpId, r, {
          published: c.action === "publish" ? r.draft : null,
          publishedAt: c.action === "publish" ? new Date() : null,
          version: r.version + 1,
          updatedAt: new Date(),
        });
    }
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "statistics_" + c.action,
      detail: {
        fixtureId: fixture.id,
        ...("mpId" in c
          ? {
              mpId: c.mpId,
              fromVersion: c.expectedVersion,
              ...(c.action === "review"
                ? {
                    allowUnlistedMaps: c.allowUnlistedMaps,
                    included: c.included,
                    excludedScores: c.excludedScores,
                    rosterTeamGames: c.rosterTeamGames,
                    technicalAdjudication: hasStatisticsAdjudication(c),
                    adjudication: reviewedSnapshot?.adjudication,
                    excludedGames: reviewedSnapshot?.excludedGames,
                    reviewedBy: reviewedSnapshot?.reviewedBy,
                    reviewedAt: reviewedSnapshot?.reviewedAt,
                    evidenceUrl: reviewedSnapshot?.evidenceUrl,
                  }
                : {}),
            }
          : { versions: c.expectedVersions }),
      },
    });
    await syncArchiveRelations(tx, slug);
  });
  return statisticsWorkspace(actor, slug, fixture.id);
}
function publicArchiveMatchDetails(
  archive: HistoricalArchive,
  fixtures: ReturnType<typeof statisticsFixtures>,
  published: Awaited<ReturnType<typeof stored>>,
  ezScoreMultiplier: number,
) {
  return fixtures.flatMap((f) => {
    const sources = published.filter((r) => r.fixtureId === f.id);
    if (!sources.length) return [];
    // Published snapshot identity, not the mutable draft version, anchors the report.
    const details = withStatisticsScores(
      archiveMatchDetails(
        archive,
        f.id,
        sources.map((r) => ({
          snapshot: r.published!,
          revision: createHash("sha256")
            .update(JSON.stringify(r.published))
            .digest("hex"),
        })),
      ),
      ezScoreMultiplier,
    );
    const games: RatingGame[] = details.games
      .filter((g) => g.included)
      .map((g) => ({
        fixtureId: f.id,
        gameId: g.gameId,
        // Historical snapshots have no numeric result revision; fingerprint is authoritative.
        revision: 0,
        fingerprint: g.revision,
        approvalFingerprint: g.revision,
        ...(ezScoreMultiplier === 1 ? {} : { ezScoreMultiplier }),
        at: g.startTime,
        teamIds: details.teamIds,
        winnerTeamId:
          g.effectiveTotals[0] === g.effectiveTotals[1]
            ? null
            : details.teamIds[
                g.effectiveTotals[0]! > g.effectiveTotals[1]! ? 0 : 1
              ],
        scores: g.scores
          .filter((s) => s.included)
          .map((s) => ({
            userId: s.osuId,
            teamId: s.teamId!,
            total: statisticsScore(
              s.effectiveTotal!,
              [...g.mods, ...s.mods],
              ezScoreMultiplier,
            ).score,
            rawTotal: s.total!,
            mods: [...new Set([...g.mods, ...s.mods])].sort(),
          })),
      }));
    details.rating = ratingSnapshot(
      games,
      new Map(archive.players.map((p) => [p.osuId, p.username])),
    );
    return [{ fixtureId: f.id, details }];
  });
}

async function databasePublicArchiveStatistics(
  slug: string,
  fixtureId?: string,
): Promise<PublicArchiveStatistics> {
  return db().transaction(
    async (tx) => {
      if (!fixtureId) {
        const fast = await relationalPublicStatistics(slug, tx);
        if (fast)
          return {
            ...fast.summary,
            plays: fast.plays,
            matchDetails: [],
          };
      }
      const archive = await archiveFor(slug, tx, true);
      const ezScoreMultiplier =
        (await readTournament(slug, tx, true))?.edition.ezScoreMultiplier ?? 1;
      const rows = await stored(slug, tx, fixtureId);
      const release = releasedArchiveStatistics(archive, rows, fixtureId);
      const { fixtures, published } = release;
      const plays =
        (await relationalPublicPlays(slug, rows, tx, { fixtureId })) ??
        published.flatMap((r) =>
          projectStatistics(
            archive,
            r.fixtureId,
            r.published!,
            ezScoreMultiplier,
          ),
        );
      return {
        ...archiveStatisticsSummary(
          archive,
          release,
          ezScoreMultiplier,
          fixtureId,
        ),
        plays,
        matchDetails: publicArchiveMatchDetails(
          archive,
          fixtureId ? fixtures : [],
          published,
          ezScoreMultiplier,
        ),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicArchiveStatistics(
  slug: string,
  fixtureId?: string,
): Promise<PublicArchiveStatistics> {
  if (remoteMode()) {
    return frontendResource<PublicArchiveStatistics>(
      "publicArchiveStatistics",
      { slug, fixtureId },
    );
  }
  return databasePublicArchiveStatistics(slug, fixtureId);
}

export type PublicArchiveStatistics =
  ExplicitReadData<"publicArchiveStatistics">;

/** Local profile reads keep full relevant games; remote keeps its existing resource. */
export async function publicArchivePlayerPlays(
  slug: string,
  osuId: number,
  rosterTeams: string[],
  minimumScore: number,
) {
  if (!remoteMode()) {
    const plays = await db().transaction(
      (tx) =>
        relationalPlayerArchivePlays(
          slug,
          tx,
          osuId,
          rosterTeams,
          minimumScore,
        ),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    if (plays !== undefined) return plays;
  }
  return (await publicArchiveStatistics(slug)).plays;
}
