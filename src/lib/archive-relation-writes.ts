import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  notInArray,
  sql,
} from "drizzle-orm";
import {
  editionState,
  historicalStatistics,
  historicalStatisticsSources,
  historicalArchiveSources,
  archiveRelationDocuments,
  archiveRelationHeads,
} from "@/db/schema";
import {
  ARCHIVE_RELATION_CODEC,
  layoutFor,
  readRelationHeads,
  readStatisticsSourceMetadata,
  statisticsKey,
  tables,
  type Writer,
} from "./archive-relation-storage";
import {
  archiveEditionStates,
  readArchiveSummary,
  readHistoricalStatistics,
} from "./archive-relations";
import {
  decodeArchiveRelations,
  encodeArchiveRelations,
  type Layout,
} from "./archive-relational-codec";
import { historicalArchiveSchema } from "./historical-archive";
import {
  parseStatisticsSnapshot,
  statisticsSnapshotSchema,
} from "./statistics-snapshot";
import { archiveStatisticsSummarySchema } from "./archive-summary-schema";
import type { ArchiveStatisticsSummary } from "./archive-statistics-projection";
import {
  archiveContentHash,
  type ArchiveState,
  type StatisticsRow,
} from "./archive-read-model";
import { HttpError } from "./http-error";

// Native digests are calculated only at writes/operator verification. Requests
// compare the small sidecar; canonical content hashes verify decoded rows.
export const archiveDatabaseDigest = sql<string>`encode(sha256(convert_to((${editionState.configuration}->'archive')::text, 'UTF8')), 'hex')`;

async function storeDocument(
  tx: Writer,
  slug: string,
  key: string,
  kind: Layout["kind"],
  value: unknown,
  force: boolean,
) {
  const layout = layoutFor(kind),
    hash = archiveContentHash(value);
  let [document] = force
    ? []
    : await tx
        .select()
        .from(archiveRelationDocuments)
        .where(
          and(
            eq(archiveRelationDocuments.editionSlug, slug),
            eq(archiveRelationDocuments.documentKey, key),
            eq(archiveRelationDocuments.codecVersion, ARCHIVE_RELATION_CODEC),
            eq(archiveRelationDocuments.contentHash, hash),
          ),
        )
        .orderBy(
          desc(archiveRelationDocuments.createdAt),
          desc(archiveRelationDocuments.id),
        )
        .limit(1);
  const created = !document;
  if (!document) {
    const data = encodeArchiveRelations(layout, value);
    if (archiveContentHash(decodeArchiveRelations(layout, data)) !== hash)
      throw new Error("Historical relational roundtrip mismatch");
    [document] = await tx
      .insert(archiveRelationDocuments)
      .values({
        editionSlug: slug,
        documentKey: key,
        kind,
        contentHash: hash,
        mpId: kind === "statistics" ? Number(key.split(":")[0]) : null,
        snapshotKind: kind === "statistics" ? key.split(":")[1] : null,
        codecVersion: ARCHIVE_RELATION_CODEC,
      })
      .returning();
    for (const entity of layout.entities) {
      const rows = data[entity.key];
      for (let i = 0; i < rows.length; i += 200)
        await tx
          .insert(tables[entity.key])
          .values(
            rows
              .slice(i, i + 200)
              .map((row) => ({ ...row, documentId: document.id })),
          );
    }
  }
  return { document, created };
}
async function saveDocument(
  tx: Writer,
  slug: string,
  key: string,
  kind: "archive" | "statistics",
  value: unknown,
  sourceHash: string,
  force: boolean,
) {
  const { document, created } = await storeDocument(
    tx,
    slug,
    key,
    kind,
    value,
    force,
  );
  await tx
    .insert(archiveRelationHeads)
    .values({
      editionSlug: slug,
      documentKey: key,
      documentId: document.id,
      sourceHash,
    })
    .onConflictDoUpdate({
      target: [
        archiveRelationHeads.editionSlug,
        archiveRelationHeads.documentKey,
      ],
      set: { documentId: document.id, sourceHash },
    });
  return created;
}

/** Immutable typed cache DTO, deliberately not a source/current-head document. */
export async function saveArchiveSummary(
  tx: Writer,
  slug: string,
  generationId: string,
  value: ArchiveStatisticsSummary,
) {
  const parsed = archiveStatisticsSummarySchema.parse(value);
  const { document } = await storeDocument(
    tx,
    slug,
    `summary:${generationId}`,
    "summary",
    parsed,
    false,
  );
  if (await readArchiveSummary(tx, slug, document.id, generationId))
    return document.id;
  const repaired = await storeDocument(
    tx,
    slug,
    `summary:${generationId}`,
    "summary",
    parsed,
    true,
  );
  if (!(await readArchiveSummary(tx, slug, repaired.document.id, generationId)))
    throw new Error("Historical summary roundtrip mismatch");
  return repaired.document.id;
}

/** Caller holds the edition row lock. Only changed documents/MPs are encoded. */
export async function syncArchiveRelations(
  tx: Writer,
  slug: string,
  force = false,
  knownArchive?: ReturnType<typeof historicalArchiveSchema.parse>,
) {
  let state: ArchiveState | undefined;
  if (knownArchive) {
    const [source] = await tx
      .select({
        state: {
          ...getTableColumns(editionState),
          configuration: sql<
            ArchiveState["configuration"]
          >`${editionState.configuration} - 'archive'`,
        },
        matches: sql<boolean>`${editionState.configuration}->'archive' = ${JSON.stringify(knownArchive)}::jsonb`,
      })
      .from(editionState)
      .where(eq(editionState.slug, slug));
    if (!source?.matches)
      throw new Error(
        "Archive mirror changed before relational synchronization",
      );
    state = {
      ...source.state,
      configuration: { ...source.state.configuration!, archive: knownArchive },
    };
  } else if (!force) [state] = await archiveEditionStates(tx, false, slug);
  else
    [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug));
  if (!state?.configuration?.archive) {
    await tx
      .delete(archiveRelationHeads)
      .where(eq(archiveRelationHeads.editionSlug, slug));
    return { slug, created: 0, documents: 0, sources: 0 };
  }
  const archive = historicalArchiveSchema.parse(state.configuration.archive);
  if (archive.editionSlug !== slug)
    throw new Error("Historical edition scope mismatch");
  // Repair missing/stale metadata explicitly under the caller's edition lock.
  // The normal configuration trigger maintains it in the source transaction.
  await tx.execute(sql`INSERT INTO ${historicalArchiveSources}(edition_slug,source_hash,configuration_hash)
    SELECT ${editionState.slug}, ${archiveDatabaseDigest}, encode(sha256(convert_to(${editionState.configuration}::text,'UTF8')),'hex') FROM ${editionState}
    WHERE ${editionState.slug} = ${slug}
    ON CONFLICT(edition_slug) DO UPDATE SET source_hash=EXCLUDED.source_hash,configuration_hash=EXCLUDED.configuration_hash`);
  // Lock source identities without transferring their large JSONB values.
  await tx
    .select({ mpId: historicalStatistics.mpId })
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug))
    .for("share");
  // Repair a missing derived digest without touching source JSONB/history.
  await tx.execute(sql`INSERT INTO historical_statistics_sources(edition_slug,mp_id,source_hash)
    SELECT s.edition_slug,s.mp_id,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') FROM historical_statistics s
    LEFT JOIN historical_statistics_sources h ON h.edition_slug=s.edition_slug AND h.mp_id=s.mp_id
    WHERE s.edition_slug=${slug} AND h.mp_id IS NULL ON CONFLICT DO NOTHING`);
  const sources = await readStatisticsSourceMetadata(tx, slug),
    prior = await readRelationHeads(tx, slug),
    active = ["archive"];
  let created = 0;
  const archiveHash = archiveContentHash(archive);
  const matching = (key: string, hash: string | null) =>
    prior.some(
      (p) =>
        p.head.documentKey === key &&
        p.head.sourceHash === hash &&
        p.document.codecVersion === ARCHIVE_RELATION_CODEC,
    );
  if (force || !matching("archive", archiveHash))
    created += Number(
      await saveDocument(
        tx,
        slug,
        "archive",
        "archive",
        archive,
        archiveHash,
        force,
      ),
    );
  // Also upgrades already normalized archives without rebuilding documents or
  // touching source JSONB, revisions, configuration timestamps or statistics.
  await tx.execute(sql`UPDATE ${archiveRelationHeads}
    SET archive_source_digest = ${archiveDatabaseDigest}
    FROM ${editionState}
    WHERE ${archiveRelationHeads.editionSlug} = ${editionState.slug}
      AND ${editionState.slug} = ${slug}
      AND ${archiveRelationHeads.documentKey} = 'archive'`);
  const dirty = sources.filter(
    (s) =>
      force ||
      !matching(statisticsKey(s.mpId, "draft"), s.sourceHash) ||
      (s.hasPublished &&
        !matching(statisticsKey(s.mpId, "published"), s.sourceHash)),
  );
  const rows = dirty.length
    ? await tx
        .select()
        .from(historicalStatistics)
        .where(
          and(
            eq(historicalStatistics.editionSlug, slug),
            inArray(
              historicalStatistics.mpId,
              dirty.map((s) => s.mpId),
            ),
          ),
        )
    : [];
  for (const s of sources) {
    active.push(statisticsKey(s.mpId, "draft"));
    if (s.hasPublished) active.push(statisticsKey(s.mpId, "published"));
  }
  for (const row of rows)
    for (const kind of ["draft", "published"] as const) {
      if (!row[kind]) continue;
      const snapshot = statisticsSnapshotSchema.parse(row[kind]);
      created += Number(
        await saveDocument(
          tx,
          slug,
          statisticsKey(row.mpId, kind),
          "statistics",
          snapshot,
          sources.find((s) => s.mpId === row.mpId)!.sourceHash!,
          force,
        ),
      );
    }
  await tx
    .delete(archiveRelationHeads)
    .where(
      and(
        eq(archiveRelationHeads.editionSlug, slug),
        notInArray(archiveRelationHeads.documentKey, active),
      ),
    );
  return { slug, created, documents: active.length, sources: sources.length };
}

/** Serialize publication/roster checks with direct legacy MP writers as well
 * as normal edition-scoped commands, without selecting their JSONB. */
export async function lockHistoricalStatistics(tx: Writer, slug: string) {
  await tx
    .select({ mpId: historicalStatistics.mpId })
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug))
    .for("update");
}

type StatisticsPatch = Partial<
  Pick<
    StatisticsRow,
    | "fixtureId"
    | "draft"
    | "published"
    | "publishedAt"
    | "version"
    | "updatedAt"
  >
>;
/** The JSONB mirror and its typed documents share one write transaction.
 * Decode unchanged snapshots from relations, retaining their literal legacy
 * representation instead of normalizing or rereading the JSONB mirror. */
export async function persistHistoricalStatistics(
  tx: Writer,
  slug: string,
  mpId: number,
  before: StatisticsRow | undefined,
  patch: StatisticsPatch,
) {
  await tx
    .select({ mpId: historicalStatistics.mpId })
    .from(historicalStatistics)
    .where(
      and(
        eq(historicalStatistics.editionSlug, slug),
        eq(historicalStatistics.mpId, mpId),
      ),
    )
    .for("update");
  const [raw] = await readHistoricalStatistics(slug, tx, undefined, mpId);
  const comparable = (row: StatisticsRow) => ({
    ...row,
    draft: parseStatisticsSnapshot(row.draft),
    published: row.published ? parseStatisticsSnapshot(row.published) : null,
  });
  if (
    Boolean(raw) !== Boolean(before) ||
    (raw &&
      before &&
      archiveContentHash(comparable(raw)) !==
        archiveContentHash(comparable(before)))
  )
    throw new HttpError(409, "Statistics changed. Reload before retrying.");
  const returning = {
    editionSlug: historicalStatistics.editionSlug,
    mpId: historicalStatistics.mpId,
    fixtureId: historicalStatistics.fixtureId,
    version: historicalStatistics.version,
    publishedAt: historicalStatistics.publishedAt,
    updatedAt: historicalStatistics.updatedAt,
  };
  const [saved] = raw
    ? await tx
        .update(historicalStatistics)
        .set(patch)
        .where(
          and(
            eq(historicalStatistics.editionSlug, slug),
            eq(historicalStatistics.mpId, mpId),
            eq(historicalStatistics.version, raw.version),
          ),
        )
        .returning(returning)
    : await tx
        .insert(historicalStatistics)
        .values({
          editionSlug: slug,
          mpId,
          fixtureId: patch.fixtureId!,
          draft: patch.draft!,
          version: patch.version ?? 1,
          ...patch,
        })
        .returning(returning);
  if (!saved)
    throw new HttpError(409, "Statistics changed. Reload before retrying.");
  const [source] = await tx
    .select({ hash: historicalStatisticsSources.sourceHash })
    .from(historicalStatisticsSources)
    .where(
      and(
        eq(historicalStatisticsSources.editionSlug, slug),
        eq(historicalStatisticsSources.mpId, mpId),
      ),
    );
  if (!source) throw new Error("Historical source digest is missing");
  const snapshots = {
    draft: patch.draft ?? raw!.draft,
    published: Object.hasOwn(patch, "published")
      ? patch.published
      : (raw?.published ?? null),
  };
  for (const kind of ["draft", "published"] as const) {
    const key = statisticsKey(mpId, kind),
      value = snapshots[kind];
    if (value)
      await saveDocument(
        tx,
        slug,
        key,
        "statistics",
        statisticsSnapshotSchema.parse(value),
        source.hash,
        false,
      );
    else
      await tx
        .delete(archiveRelationHeads)
        .where(
          and(
            eq(archiveRelationHeads.editionSlug, slug),
            eq(archiveRelationHeads.documentKey, key),
          ),
        );
  }
  return { ...saved, ...snapshots } as StatisticsRow;
}
