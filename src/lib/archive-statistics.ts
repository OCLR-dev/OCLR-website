import { db } from "@/db";
import { editionEvents, editionState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import {
  lockHistoricalStatistics,
  persistHistoricalStatistics,
  syncArchiveRelations,
} from "./archive-relations";
import {
  readStatisticsArchive,
  readStatisticsSources,
} from "./archive-statistics-data";
import { statisticsArchiveKey } from "./archive-statistics-key";
import {
  archiveMpId,
  fixtureStatisticsIssues,
  projectStatistics,
  statisticsFixtures,
  statisticsGameIssues,
  suggestStatisticsPool,
  validStatisticsExclusions,
  type StatisticsSnapshot,
} from "./archive-statistics-model";
import {
  statisticsWorkspace,
  type StatisticsWorkspace,
} from "./archive-statistics-reads";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import {
  exchangeArchivePlayers,
  type archivePlayerExchangeConfirmation,
  type HistoricalArchive,
} from "./historical-archive";
import { HttpError } from "./http-error";
import { fetchMatchSource } from "./osu-matches";
import { changeHistoricalStatisticsWrite } from "./results-publication-write-contracts";
import {
  hasStatisticsAdjudication,
  statisticsSnapshotSchema,
} from "./statistics-snapshot";

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
  const rows = await readStatisticsSources(before.editionSlug, tx);
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
  const archive = await readStatisticsArchive(slug);
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
    const existing = (await readStatisticsSources(slug)).find((r) => r.mpId === c.mpId);
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
    const currentArchive = await readStatisticsArchive(slug, tx);
    if (statisticsArchiveKey(currentArchive) !== key)
      throw new HttpError(409, "Archive changed. Reload before retrying.");
    const rows = await readStatisticsSources(slug, tx);
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
