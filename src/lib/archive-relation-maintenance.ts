import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  editionState,
  historicalArchiveSources,
  historicalStatistics,
} from "@/db/schema";
import {
  ARCHIVE_RELATION_CODEC,
  archiveRelationLayouts,
  loadDocuments,
  readRelationHeads,
  readStatisticsSourceMetadata,
  statisticsKey,
  type Reader,
} from "./archive-relation-storage";
import {
  archiveDatabaseDigest,
  syncArchiveRelations,
} from "./archive-relation-writes";
import { decodeArchiveRelations } from "./archive-relational-codec";
import { archiveContentHash } from "./archive-read-model";
import { historicalArchiveSchema } from "./historical-archive";
import { statisticsSnapshotSchema } from "./statistics-snapshot";
import { HttpError } from "./http-error";

/** Operator discovery returns identities only, never entire saved archives. */
export async function historicalArchiveSlugs(reader: Reader) {
  return (
    await reader
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(
        sql`${editionState.configuration}->'archive' IS NOT NULL AND ${editionState.configuration}->'archive' <> 'null'::jsonb`,
      )
      .orderBy(editionState.slug)
  ).map((row) => row.slug);
}

async function archiveRelationsReport(reader: Reader, slug: string) {
  const [state] = await reader
    .select({
      state: editionState,
      digest: archiveDatabaseDigest,
      sourceDigest: historicalArchiveSources.sourceHash,
      configurationDigest: sql<string>`encode(sha256(convert_to(${editionState.configuration}::text,'UTF8')),'hex')`,
      storedConfigurationDigest: historicalArchiveSources.configurationHash,
    })
    .from(editionState)
    .leftJoin(
      historicalArchiveSources,
      eq(historicalArchiveSources.editionSlug, editionState.slug),
    )
    .where(eq(editionState.slug, slug));
  if (!state?.state.configuration?.archive)
    throw new HttpError(404, "Saved historical archive is required.");
  const current = await readRelationHeads(reader, slug),
    sources = await readStatisticsSourceMetadata(reader, slug);
  const expected = new Map([
    [
      "archive",
      archiveContentHash(
        historicalArchiveSchema.parse(state.state.configuration.archive),
      ),
    ],
  ]);
  for (const s of sources) {
    expected.set(statisticsKey(s.mpId, "draft"), s.sourceHash ?? "");
    if (s.hasPublished)
      expected.set(statisticsKey(s.mpId, "published"), s.sourceHash ?? "");
  }
  const stale = [...expected].filter(
    ([key, hash]) =>
      !hash ||
      !current.some(
        (c) =>
          c.head.documentKey === key &&
          c.head.sourceHash === hash &&
          c.document.codecVersion === ARCHIVE_RELATION_CODEC,
      ),
  ).length;
  return {
    slug,
    documents: expected.size,
    sources: sources.length,
    current: expected.size - stale,
    stale,
    obsolete: current.filter((c) => !expected.has(c.head.documentKey)).length,
    archiveReadReady: current.some(
      (c) =>
        c.head.documentKey === "archive" &&
        c.head.sourceHash === expected.get("archive") &&
        c.document.contentHash === expected.get("archive") &&
        c.document.codecVersion === ARCHIVE_RELATION_CODEC &&
        c.head.archiveSourceDigest === state.digest &&
        state.sourceDigest === state.digest &&
        state.storedConfigurationDigest === state.configurationDigest,
    ),
  };
}

/** Compare all persisted typed values with the preserved JSONB, without exposing it. */
export async function verifyArchiveRelations(reader: Reader, slug: string) {
  const report = await archiveRelationsReport(reader, slug);
  if (report.stale || report.obsolete || !report.archiveReadReady)
    throw new HttpError(
      409,
      "Historical relations are stale; run the reviewed apply first.",
    );
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  const sources = await reader
    .select()
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug));
  const expected = new Map<string, unknown>([
    ["archive", historicalArchiveSchema.parse(state.configuration!.archive)],
  ]);
  for (const s of sources)
    for (const kind of ["draft", "published"] as const)
      if (s[kind])
        expected.set(
          statisticsKey(s.mpId, kind),
          statisticsSnapshotSchema.parse(s[kind]),
        );
  const current = await readRelationHeads(reader, slug);
  let rows = 0;
  for (const layout of archiveRelationLayouts) {
    const documents = current.filter((c) => c.document.kind === layout.kind);
    const data = await loadDocuments(
      reader,
      layout.kind,
      documents.map((d) => d.document.id),
    );
    for (const d of documents) {
      const relations = data.get(d.document.id)!;
      rows += Object.values(relations).reduce(
        (n, values) => n + values.length,
        0,
      );
      const hash = archiveContentHash(
        decodeArchiveRelations(layout, relations),
      );
      if (
        hash !== d.document.contentHash ||
        hash !== archiveContentHash(expected.get(d.head.documentKey))
      )
        throw new HttpError(
          409,
          "Historical relational verification failed; source JSONB was preserved.",
        );
    }
  }
  return { documents: expected.size, rows };
}

/** A database-only preview/apply; source data is never printed or rewritten. */
export async function backfillArchiveRelations(
  slug: string,
  apply = false,
  force = false,
) {
  return db().transaction(
    async (tx) => {
      if (apply) {
        await tx
          .select({ slug: editionState.slug })
          .from(editionState)
          .where(eq(editionState.slug, slug))
          .for("update");
        const changed = await syncArchiveRelations(tx, slug, force);
        return {
          ...(await archiveRelationsReport(tx, slug)),
          created: changed.created,
        };
      }
      return { ...(await archiveRelationsReport(tx, slug)), created: 0 };
    },
    {
      isolationLevel: apply ? "read committed" : "repeatable read",
      ...(apply ? {} : { accessMode: "read only" as const }),
    },
  );
}
