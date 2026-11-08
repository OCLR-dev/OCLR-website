import { syncArchiveRelations } from "./archive-relations";
import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/db";
import {
  editionState,
  editionRevisions,
  editionEvents,
  historicalStatistics,
} from "@/db/schema";
import { archivePoolFixtures } from "./archive-mappool-statistics";
import {
  historicalArchiveSchema,
  publicHistoricalArchive,
} from "./historical-archive";
import { correctS2PoolArchive } from "./archive-pool-correction-model";
import { statisticsArchiveKey } from "./archive-statistics-key";
import {
  fixtureStatisticsIssues,
  projectStatistics,
  validStatisticsExclusions,
} from "./archive-statistics-model";
import { parseStatisticsSnapshot } from "./statistics-snapshot";
import { HttpError } from "./http-error";

/** Operator maintenance, not a web route or a permission bypass. Default is read-only. */
export async function correctS2PoolData(
  options: { apply?: boolean; expectedRevision?: number } = {},
) {
  if (options.apply && !Number.isSafeInteger(options.expectedRevision))
    throw new HttpError(400, "Applying requires --expected-revision=N.");
  return db().transaction(
    async (tx) => {
      const query = tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "s2"));
      const [state] = await (options.apply ? query.for("update") : query);
      if (!state?.configuration?.archive)
        throw new HttpError(404, "Saved S2 archive is required.");
      if (
        options.apply &&
        state.configurationVersion !== options.expectedRevision
      )
        throw new HttpError(409, "S2 revision changed; preview again.");
      const before = historicalArchiveSchema.parse(state.configuration.archive);
      if (
        before.editionSlug !== "s2" ||
        state.configuration.status !== "completed" ||
        state.configuration.registration
      )
        throw new Error(
          "A completed S2 archive without registration is required.",
        );
      const corrected = correctS2PoolArchive(state.configuration.archive);
      const removed = before.pools
        .filter((p) => p.id === "gs")
        .flatMap((p) =>
          p.maps
            .filter((m) => ["DT5", "TB1"].includes(m.slot))
            .map((m) => ({ slot: m.slot, beatmapId: m.beatmapId })),
        );
      const report = {
        slug: "s2",
        revision: state.configurationVersion,
        removed,
        statistics: 0,
        applied: false,
      };
      if (!removed.length) return report;
      const after = historicalArchiveSchema.parse(corrected);
      const oldKey = statisticsArchiveKey(before),
        newKey = statisticsArchiveKey(after);
      const rows = await tx
        .select()
        .from(historicalStatistics)
        .where(eq(historicalStatistics.editionSlug, "s2"));
      const multiplier = state.configuration.ezScoreMultiplier ?? 1;
      // Never manufacture approvals or bless stale source snapshots. Every current
      // draft/release must retain its selected score projection after the correction.
      const rekey = (
        snapshot: (typeof rows)[number]["draft"],
        fixture: string,
      ) => {
        if (snapshot.archiveKey !== oldKey) return snapshot;
        const parsed = parseStatisticsSnapshot(snapshot);
        if (
          !validStatisticsExclusions(parsed, before, fixture) ||
          !validStatisticsExclusions(parsed, after, fixture) ||
          !isDeepStrictEqual(
            projectStatistics(before, fixture, parsed, multiplier),
            projectStatistics(after, fixture, parsed, multiplier),
          )
        ) {
          throw new HttpError(
            409,
            "S2 pool correction would change selected scores; review required.",
          );
        }
        return { ...snapshot, archiveKey: newKey };
      };
      const updates = rows.map((row) => ({
        row,
        draft: rekey(row.draft, row.fixtureId),
        published: row.published ? rekey(row.published, row.fixtureId) : null,
      }));
      for (const fixtureId of new Set(
        rows
          .filter((r) => r.published?.archiveKey === oldKey)
          .map((r) => r.fixtureId),
      )) {
        const snapshots = rows
          .filter(
            (r) =>
              r.fixtureId === fixtureId && r.published?.archiveKey === oldKey,
          )
          .map((r) => parseStatisticsSnapshot(r.published));
        if (
          [before, after].some(
            (archive) =>
              fixtureStatisticsIssues(archive, fixtureId, snapshots).length,
          )
        )
          throw new HttpError(
            409,
            "Published S2 fixture would become invalid; review required.",
          );
      }
      const released = rows
        .filter((row) => row.published?.archiveKey === oldKey)
        .map((row) => ({
          fixtureId: row.fixtureId,
          snapshot: parseStatisticsSnapshot(row.published),
        }));
      const coverage = (archive: typeof before) =>
        archivePoolFixtures(publicHistoricalArchive(archive), released).map(
          ({ maps: _maps, ...fixture }) => {
            void _maps;
            return fixture;
          },
        );
      if (!isDeepStrictEqual(coverage(before), coverage(after)))
        throw new HttpError(
          409,
          "S2 pool correction would change recorded picks or bans; review required.",
        );
      const changed = updates.filter(
        (u) => u.draft !== u.row.draft || u.published !== u.row.published,
      );
      report.statistics = changed.length;
      if (!options.apply) return report;
      const configuration = { ...state.configuration, archive: corrected };
      // Preserve the actual pre-correction JSONB, including legacy optional fields.
      await tx
        .insert(editionRevisions)
        .values({
          editionSlug: "s2",
          version: state.configurationVersion,
          configuration: state.configuration,
        })
        .onConflictDoNothing();
      await tx.insert(editionRevisions).values({
        editionSlug: "s2",
        version: state.configurationVersion + 1,
        configuration,
      });
      await tx
        .update(editionState)
        .set({
          configuration,
          configurationVersion: state.configurationVersion + 1,
          configurationUpdatedAt: new Date(),
        })
        .where(eq(editionState.slug, "s2"));
      for (const u of changed)
        await tx
          .update(historicalStatistics)
          .set({
            draft: u.draft,
            published: u.published,
            version: u.row.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(historicalStatistics.editionSlug, "s2"),
              eq(historicalStatistics.mpId, u.row.mpId),
            ),
          );
      await tx.insert(editionEvents).values({
        editionSlug: "s2",
        kind: "archive_pool_correction",
        detail: {
          correction: "s2-gs-dt5-tb1",
          fromRevision: state.configurationVersion,
          toRevision: state.configurationVersion + 1,
          removed,
          oldKey,
          newKey,
          statistics: changed.map((u) => ({
            mpId: u.row.mpId,
            fromVersion: u.row.version,
            toVersion: u.row.version + 1,
          })),
        },
      });
      await syncArchiveRelations(tx, "s2");
      return { ...report, applied: true };
    },
    {
      isolationLevel: options.apply ? "read committed" : "repeatable read",
      ...(options.apply ? {} : { accessMode: "read only" as const }),
    },
  );
}
