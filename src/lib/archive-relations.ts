import { and, desc, eq, getTableColumns, inArray, isNotNull, sql } from "drizzle-orm";
import {
  editionState,
  historicalStatistics,
  historicalArchiveSources,
  archiveRelationDocuments,
  archiveRelationHeads,
} from "@/db/schema";
import {
  decodeArchiveRelations,
  type RelationData,
} from "./archive-relational-codec";
import {
  ARCHIVE_RELATION_CODEC,
  layoutFor,
  loadDocuments,
  readRelationHeads,
  readStatisticsSourceMetadata,
  statisticsKey,
  type Reader,
} from "./archive-relation-storage";
import { historicalArchiveSchema } from "./historical-archive";
import { statisticsSnapshotSchema } from "./statistics-snapshot";
import { archiveStatisticsSummarySchema } from "./archive-summary-schema";
import type { ArchiveStatisticsSummary } from "./archive-statistics-projection";
import {
  archiveContentHash,
  type ArchiveState,
  type StatisticsRow,
} from "./archive-read-model";
import { remoteMode } from "./data-source";

const disabled = () =>
  remoteMode() || process.env.OCLR_ARCHIVE_READ_MODEL === "jsonb";

/** Pin a verified immutable document in the same statement that reads its
 * configuration/publication metadata. Ready rows omit archive JSONB entirely.
 * Only a missing/old/stale document or a failed roundtrip needs the source.
 */
export async function archiveEditionStates(
  reader: Reader,
  publicOnly = false,
  slug?: string,
): Promise<ArchiveState[]> {
  const visible = and(
    isNotNull(editionState.configuration),
    slug ? eq(editionState.slug, slug) : undefined,
    publicOnly
      ? sql`${editionState.configuration}->>'published' = 'true'`
      : undefined,
  );
  if (disabled())
    return reader
      .select()
      .from(editionState)
      .where(visible)
      .orderBy(desc(editionState.configurationUpdatedAt), editionState.slug);
  const ready = and(
    eq(archiveRelationDocuments.kind, "archive"),
    eq(archiveRelationDocuments.codecVersion, ARCHIVE_RELATION_CODEC),
    eq(archiveRelationDocuments.contentHash, archiveRelationHeads.sourceHash),
    eq(
      archiveRelationHeads.archiveSourceDigest,
      historicalArchiveSources.sourceHash,
    ),
  );
  const current = await reader
    .select({
      state: {
        ...getTableColumns(editionState),
        configuration: sql<ArchiveState["configuration"]>`CASE WHEN ${ready}
        THEN ${editionState.configuration} - 'archive' ELSE ${editionState.configuration} END`.as(
          "configuration",
        ),
      },
      documentId: sql<
        string | null
      >`CASE WHEN ${ready} THEN ${archiveRelationDocuments.id} ELSE NULL END`,
      contentHash: archiveRelationDocuments.contentHash,
    })
    .from(editionState)
    .leftJoin(
      historicalArchiveSources,
      eq(historicalArchiveSources.editionSlug, editionState.slug),
    )
    .leftJoin(
      archiveRelationHeads,
      and(
        eq(archiveRelationHeads.editionSlug, editionState.slug),
        eq(archiveRelationHeads.documentKey, "archive"),
      ),
    )
    .leftJoin(
      archiveRelationDocuments,
      eq(archiveRelationDocuments.id, archiveRelationHeads.documentId),
    )
    .where(visible)
    .orderBy(desc(editionState.configurationUpdatedAt), editionState.slug);
  const ids = current.flatMap((row) =>
    row.documentId ? [row.documentId] : [],
  );
  const data = await loadDocuments(reader, "archive", ids);
  const failed: string[] = [];
  for (const row of current) {
    if (!row.documentId) continue;
    try {
      const archive = historicalArchiveSchema.parse(
        decodeArchiveRelations(layoutFor("archive"), data.get(row.documentId)!),
      );
      if (
        archive.editionSlug !== row.state.slug ||
        archiveContentHash(archive) !== row.contentHash
      )
        throw new Error("Incomplete typed historical archive");
      row.state.configuration = { ...row.state.configuration!, archive };
    } catch {
      failed.push(row.state.slug);
    }
  }
  // Reload the entire source row, including its publication flag, rather than
  // mixing an archive from a later revision with earlier configuration metadata.
  const fallback = failed.length
    ? await reader
        .select()
        .from(editionState)
        .where(and(visible, inArray(editionState.slug, failed)))
    : [];
  const bySlug = new Map(fallback.map((state) => [state.slug, state]));
  return current.flatMap(({ state }) =>
    failed.includes(state.slug)
      ? bySlug.has(state.slug)
        ? [bySlug.get(state.slug)!]
        : []
      : [state],
  );
}

export async function readArchiveSummary(
  reader: Reader,
  slug: string,
  id: string,
  generationId: string,
): Promise<ArchiveStatisticsSummary | undefined> {
  const [document] = await reader
    .select()
    .from(archiveRelationDocuments)
    .where(
      and(
        eq(archiveRelationDocuments.id, id),
        eq(archiveRelationDocuments.documentKey, `summary:${generationId}`),
        eq(archiveRelationDocuments.editionSlug, slug),
        eq(archiveRelationDocuments.kind, "summary"),
        eq(archiveRelationDocuments.codecVersion, ARCHIVE_RELATION_CODEC),
      ),
    );
  if (!document) return undefined;
  const data = await loadDocuments(reader, "summary", [id]);
  try {
    const value = archiveStatisticsSummarySchema.parse(
      decodeArchiveRelations(layoutFor("summary"), data.get(id)!),
    );
    if (
      value.slug !== slug ||
      archiveContentHash(value) !== document.contentHash
    )
      return undefined;
    return {
      ...value,
      ezScoreMultiplier: value.ezScoreMultiplier,
      statisticsScorePolicy: value.statisticsScorePolicy,
      poolFixtures: value.poolFixtures,
    };
  } catch {
    return undefined;
  }
}

/** Small version identity for validated statistics. No source/payload JSONB
 * leaves the database, and legacy edits invalidate through the source trigger. */
export async function archiveReadIdentity(reader: Reader, slug: string) {
  if (disabled()) return undefined;
  const [row] = await reader
    .select({
      slug: editionState.slug,
      configurationVersion: editionState.configurationVersion,
      published: sql<boolean>`${editionState.configuration}->'published' = 'true'::jsonb`,
      ezScoreMultiplier: sql<number>`coalesce((${editionState.configuration}->>'ezScoreMultiplier')::double precision,1)`,
      archiveHash: archiveRelationDocuments.contentHash,
    })
    .from(editionState)
    .innerJoin(
      historicalArchiveSources,
      eq(historicalArchiveSources.editionSlug, editionState.slug),
    )
    .innerJoin(
      archiveRelationHeads,
      and(
        eq(archiveRelationHeads.editionSlug, editionState.slug),
        eq(archiveRelationHeads.documentKey, "archive"),
        eq(
          archiveRelationHeads.archiveSourceDigest,
          historicalArchiveSources.sourceHash,
        ),
      ),
    )
    .innerJoin(
      archiveRelationDocuments,
      and(
        eq(archiveRelationDocuments.id, archiveRelationHeads.documentId),
        eq(archiveRelationDocuments.kind, "archive"),
        eq(archiveRelationDocuments.codecVersion, ARCHIVE_RELATION_CODEC),
        eq(
          archiveRelationDocuments.contentHash,
          archiveRelationHeads.sourceHash,
        ),
      ),
    )
    .where(eq(editionState.slug, slug));
  return row;
}

/** Batch the catalogue without one head/entity query per season. Each decoded
 * archive still has to match its current source hash independently.
 */
export async function normalizedArchives(
  states: ArchiveState[],
  reader: Reader,
) {
  const result = new Map<
    string,
    ReturnType<typeof historicalArchiveSchema.parse>
  >();
  if (disabled()) return result;
  const hashes = new Map(
    states
      .filter((s) => s.configuration?.archive)
      .map((state) => [
        state.slug,
        archiveContentHash(
          historicalArchiveSchema.parse(state.configuration!.archive),
        ),
      ]),
  );
  if (!hashes.size) return result;
  const current = await reader
    .select({ head: archiveRelationHeads, document: archiveRelationDocuments })
    .from(archiveRelationHeads)
    .innerJoin(
      archiveRelationDocuments,
      eq(archiveRelationHeads.documentId, archiveRelationDocuments.id),
    )
    .where(
      and(
        inArray(archiveRelationHeads.editionSlug, [...hashes.keys()]),
        eq(archiveRelationHeads.documentKey, "archive"),
      ),
    );
  const matching = current.filter(
    ({ head, document }) =>
      head.sourceHash === hashes.get(head.editionSlug) &&
      document.contentHash === head.sourceHash &&
      document.codecVersion === ARCHIVE_RELATION_CODEC,
  );
  if (!matching.length) return result;
  let data: Map<string, RelationData>;
  try {
    data = await loadDocuments(
      reader,
      "archive",
      matching.map((p) => p.document.id),
    );
  } catch {
    return result;
  }
  for (const { head, document } of matching) {
    try {
      const archive = historicalArchiveSchema.parse(
        decodeArchiveRelations(layoutFor("archive"), data.get(document.id)!),
      );
      if (archiveContentHash(archive) === hashes.get(head.editionSlug))
        result.set(head.editionSlug, archive);
    } catch {
      /* One incomplete document never invalidates another season. */
    }
  }
  return result;
}

export async function normalizedArchive(state: ArchiveState, reader: Reader) {
  return (await normalizedArchives([state], reader)).get(state.slug);
}

/** No source JSONB is selected when every digest has a matching typed document. */
export async function normalizedStatistics(
  slug: string,
  reader: Reader,
  fixtureId?: string,
  mpId?: number,
): Promise<StatisticsRow[] | undefined> {
  if (disabled()) return undefined;
  const sources = await readStatisticsSourceMetadata(reader, slug, fixtureId, mpId);
  if (!sources.length) return [];
  const current = await readRelationHeads(
    reader,
    slug,
    sources.flatMap((s) => [
      statisticsKey(s.mpId, "draft"),
      ...(s.hasPublished ? [statisticsKey(s.mpId, "published")] : []),
    ]),
  );
  const documents = new Map<string, (typeof current)[number]>();
  for (const source of sources)
    for (const kind of ["draft", "published"] as const) {
      if (kind === "published" && !source.hasPublished) continue;
      const key = statisticsKey(source.mpId, kind),
        found = current.find(
          (h) =>
            h.head.documentKey === key &&
            h.head.sourceHash === source.sourceHash &&
            h.document.codecVersion === ARCHIVE_RELATION_CODEC,
        );
      if (!source.sourceHash || !found) return undefined;
      documents.set(key, found);
    }
  try {
    const data = await loadDocuments(
      reader,
      "statistics",
      [...documents.values()].map((d) => d.document.id),
    );
    const snapshot = (mpId: number, kind: string) => {
      const d = documents.get(statisticsKey(mpId, kind))!.document;
      const value = statisticsSnapshotSchema.parse(
        decodeArchiveRelations(layoutFor("statistics"), data.get(d.id)!),
      );
      if (archiveContentHash(value) !== d.contentHash)
        throw new Error("Incomplete typed historical snapshot");
      return value;
    };
    return sources.map(({ sourceHash: _hash, hasPublished, ...source }) => {
      void _hash;
      return {
        ...source,
        draft: snapshot(source.mpId, "draft"),
        published: hasPublished ? snapshot(source.mpId, "published") : null,
      };
    });
  } catch {
    return undefined;
  }
}

/** Complete typed source documents first; only an unavailable/stale document
 * selects the retained JSONB. Shared by commands, caches and operator imports. */
export async function readHistoricalStatistics(
  slug: string,
  reader: Reader,
  fixtureId?: string,
  mpId?: number,
): Promise<StatisticsRow[]> {
  return (
    (await normalizedStatistics(slug, reader, fixtureId, mpId)) ??
    reader
      .select()
      .from(historicalStatistics)
      .where(
        and(
          eq(historicalStatistics.editionSlug, slug),
          fixtureId ? eq(historicalStatistics.fixtureId, fixtureId) : undefined,
          mpId === undefined ? undefined : eq(historicalStatistics.mpId, mpId),
        ),
      )
  );
}
