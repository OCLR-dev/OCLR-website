import { and, eq, getTableColumns, inArray, isNotNull, sql } from "drizzle-orm";
import { unionAll, type AnyPgTable } from "drizzle-orm/pg-core";
import type { db } from "@/db";
import { archiveRelationTables } from "@/db/archive-relational-schema";
import {
  archiveRelationDocuments,
  archiveRelationHeads,
  historicalStatistics,
  historicalStatisticsSources,
} from "@/db/schema";
import layoutsJson from "./archive-relational-layout.json" with { type: "json" };
import type {
  Layout,
  RelationData,
  RelationRow,
} from "./archive-relational-codec";

export type Reader = Pick<ReturnType<typeof db>, "select">;
export type Writer = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

export const ARCHIVE_RELATION_CODEC = 1;
export const archiveRelationLayouts = layoutsJson as Layout[];
export const tables: Record<string, AnyPgTable> = archiveRelationTables;
export const layoutFor = (kind: string) =>
  archiveRelationLayouts.find((l) => l.kind === kind)!;
export const statisticsKey = (mpId: number, kind: string) => `${mpId}:${kind}`;

export async function readRelationHeads(reader: Reader, slug: string, keys?: string[]) {
  return reader
    .select({ head: archiveRelationHeads, document: archiveRelationDocuments })
    .from(archiveRelationHeads)
    .innerJoin(
      archiveRelationDocuments,
      eq(archiveRelationHeads.documentId, archiveRelationDocuments.id),
    )
    .where(
      and(
        eq(archiveRelationHeads.editionSlug, slug),
        keys ? inArray(archiveRelationHeads.documentKey, keys) : undefined,
      ),
    );
}
export function readStatisticsSourceMetadata(
  reader: Reader,
  slug: string,
  fixtureId?: string,
  mpId?: number,
) {
  return reader
    .select({
      editionSlug: historicalStatistics.editionSlug,
      mpId: historicalStatistics.mpId,
      fixtureId: historicalStatistics.fixtureId,
      version: historicalStatistics.version,
      publishedAt: historicalStatistics.publishedAt,
      updatedAt: historicalStatistics.updatedAt,
      hasPublished: isNotNull(historicalStatistics.published),
      sourceHash: historicalStatisticsSources.sourceHash,
    })
    .from(historicalStatistics)
    .leftJoin(
      historicalStatisticsSources,
      and(
        eq(
          historicalStatisticsSources.editionSlug,
          historicalStatistics.editionSlug,
        ),
        eq(historicalStatisticsSources.mpId, historicalStatistics.mpId),
      ),
    )
    .where(
      and(
        eq(historicalStatistics.editionSlug, slug),
        fixtureId ? eq(historicalStatistics.fixtureId, fixtureId) : undefined,
        mpId === undefined ? undefined : eq(historicalStatistics.mpId, mpId),
      ),
    );
}
export async function loadDocuments(reader: Reader, kind: string, ids: string[]) {
  const layout = layoutFor(kind),
    result = new Map<string, RelationData>();
  for (const id of ids)
    result.set(id, Object.fromEntries(layout.entities.map((e) => [e.key, []])));
  if (!ids.length) return result;
  // One round trip for all typed entities/documents. Build row JSON only for
  // transport; the authoritative data remains in typed columns and retained JSONB.
  const queries = layout.entities.map((entity) => {
    const table = tables[entity.key],
      columns = getTableColumns(table);
    return reader
      .select({
        documentId: columns.documentId,
        entity: sql<string>`${entity.key}::text`,
        rows: sql<RelationRow[]>`jsonb_agg(
        (to_jsonb(${table}) - 'document_id' - 'parent_id' - 'record_key') ||
        jsonb_build_object('parentId', ${columns.parentId}, 'recordKey', ${columns.recordKey})
        ORDER BY ${columns.id})`,
      })
      .from(table)
      .where(inArray(columns.documentId, ids))
      .groupBy(columns.documentId);
  });
  const rows = await (queries.length === 1
    ? queries[0]
    : unionAll(queries[0], queries[1], ...queries.slice(2)));
  for (const row of rows)
    result.get(String(row.documentId))![row.entity] = row.rows;
  return result;
}
