import { refreshArtwork } from "./chat-artwork-worker";
import { safeChatError } from "./chat-trace";
import { chatTerms } from "./chat-retrieval";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getPool, readOnlyData } from "@/db";
import { chatSourceVectors as vectors, editionState } from "@/db/schema";
import { getPublicEdition } from "./content";
import {
  chatCollections,
  seasonContent,
  type ChatCollection,
} from "./chat-season-content";
import {
  embeddingProvider,
  normalizedEmbeddings,
  pgvectorMaxDimensions,
  sourceDigest,
} from "./chat-vectors";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";

type ArtworkProgress = { edition: string } & (
  | { status: "disabled" | "error" }
  | {
      status: "active";
      embeddingEnabled: boolean;
      completed: number;
      pending: number;
      failed: number;
      unresolvedSlots: number;
    }
);

type IndexStage =
  | "edition-read"
  | "source-read"
  | "artwork-lookup"
  | "artwork-caption"
  | "keyword-write"
  | "embedding"
  | "vector-write"
  | "prune";

type IndexEvent =
  | ({
      event: "chat_index_failure";
      edition: string;
      collection?: ChatCollection;
      stage: IndexStage;
      affected?: number;
    } & Partial<ReturnType<typeof safeChatError>>)
  | ({
      event: "chat_index_collection_progress";
      edition: string;
      collection: ChatCollection;
      embeddingEnabled: boolean;
    } & (
      | { status: "error" }
      | {
          status: "complete" | "partial" | "disabled";
          completed: number;
          pending: number;
          failed: number;
        }
    ));

async function upsertEmbeddings(rows: (typeof vectors.$inferInsert)[]) {
  await db()
    .insert(vectors)
    .values(rows)
    .onConflictDoUpdate({
      target: [vectors.editionSlug, vectors.digest],
      set: {
        model: sql`excluded.model`,
        embedding: sql`excluded.embedding`,
      },
    });
}

async function backfillEmbeddingVectors() {
  const batchSize = 512;
  // Commit each batch separately so reads and writes can continue between batches.
  let updated: number;
  do {
    const result = await db().execute(sql`
      with pending as (
        select edition_slug, digest from chat_source_vectors
        where embedding_vector is null
          and cardinality(embedding) between 1 and ${pgvectorMaxDimensions}
        order by edition_slug, digest
        limit ${batchSize}
        for update skip locked
      )
      update chat_source_vectors as source
      set embedding_vector = source.embedding::public.vector
      from pending
      where source.edition_slug = pending.edition_slug and source.digest = pending.digest
    `);
    updated = result.rowCount ?? 0;
  } while (updated === batchSize);
}

export async function refreshChatIndex(
  reportArtwork: (progress: ArtworkProgress) => void = () => {},
  reportIndex: (event: IndexEvent) => void = () => {},
) {
  if (remoteMode() || inReadChannel())
    throw new Error("Indexing requires the local database worker.");
  const provider = embeddingProvider();
  if (process.env.OCLR_CHAT_EMBEDDING_MODEL?.trim() && !provider)
    throw new Error("Configure the chat endpoint before indexing embeddings.");
  const connection = await getPool().connect();
  let locked = false;
  const counts = { updated: 0, removed: 0, failed: 0 };
  try {
    const result = await connection.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(1329810514, 1437) as locked",
    );
    locked = result.rows[0].locked;
    if (!locked) return { status: "busy", ...counts };
    const published = sql`${editionState.configuration}->>'published' = 'true'`;
    counts.removed +=
      (
        await db()
          .delete(vectors)
          .where(
            sql`not exists (select 1 from ${editionState} where ${editionState.slug} = ${vectors.editionSlug} and ${published})`,
          )
      ).rowCount ?? 0;
    await backfillEmbeddingVectors();
    const editions = await db()
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(published)
      .orderBy(editionState.slug);
    const visitedArtwork = new Set<string>();
    for (const { slug } of editions) {
      let edition, saved;
      try {
        edition = await getPublicEdition(slug);
        if (!edition) continue;
        saved = await db()
          .select({
            digest: vectors.digest,
            model: vectors.model,
            collection: vectors.collection,
            hasEmbedding: sql<boolean>`${vectors.embedding} is not null`,
          })
          .from(vectors)
          .where(eq(vectors.editionSlug, slug));
      } catch (error) {
        counts.failed++;
        reportArtwork({ edition: slug, status: "error" });
        reportIndex({
          event: "chat_index_failure",
          edition: slug,
          stage: "edition-read",
          ...safeChatError(error),
        });
        continue;
      }

      const savedByCollection = Map.groupBy(saved, (row) => row.collection);
      for (const collection of chatCollections) {
        const isArtwork = collection === "artwork";
        const report = (
          stage: IndexStage,
          affected?: number,
          error?: unknown,
        ) =>
          reportIndex({
            event: "chat_index_failure",
            edition: slug,
            collection,
            stage,
            affected,
            ...safeChatError(error),
          });
        const progress = {
          event: "chat_index_collection_progress" as const,
          edition: slug,
          collection,
          embeddingEnabled: !!provider,
        };
        let current: Map<
          string,
          Awaited<ReturnType<typeof seasonContent>>[number]
        >;
        let artwork: Awaited<ReturnType<typeof refreshArtwork>> = null;
        try {
          artwork = isArtwork
            ? await refreshArtwork(edition, visitedArtwork)
            : null;
          const sources = isArtwork
            ? (artwork?.sources ?? [])
            : await readOnlyData(() => seasonContent(edition, collection));
          current = new Map(
            sources.map((source) => [sourceDigest(collection, source), source]),
          );
        } catch (error) {
          counts.failed++;
          report("source-read", undefined, error);
          reportIndex({ ...progress, status: "error" } as const);
          if (isArtwork) reportArtwork({ edition: slug, status: "error" });
          continue;
        }

        if (artwork?.lookupIncomplete) {
          counts.failed++;
          report("artwork-lookup", artwork.unresolvedSlots);
        }
        if (artwork?.failed) {
          counts.failed += artwork.failed;
          report("artwork-caption", artwork.failed);
        }

        const old = new Map(
          (savedByCollection.get(collection) ?? []).map((row) => [
            row.digest,
            row,
          ]),
        );
        const completed = new Set<string>();
        const failed = new Set<string>();
        const changed = [];
        for (const [digest, source] of current) {
          const existing = old.get(digest);
          if (
            !existing ||
            existing.model !== (provider?.key ?? null) ||
            (provider && !existing.hasEmbedding)
          )
            changed.push({ digest, source, existing });
          else completed.add(digest);
        }

        for (let i = 0; i < changed.length; i += 32) {
          const batch = changed.slice(i, i + 32);
          const rows = batch.map(({ source, digest }) => ({
            editionSlug: slug,
            digest,
            collection,
            title: source.title,
            url: source.url,
            content: source.text,
            keywords: chatTerms(
              isArtwork
                ? source.text
                : collection + " " + source.title + " " + source.text,
            ),
            model: null,
            embedding: null,
          }));
          let stage: IndexStage = "keyword-write";
          let inserted = 0;
          try {
            if (provider) {
              // Commit searchable text before asking the provider. Do not overwrite an
              // existing vector until its replacement has been stored.
              const newRows = rows.filter((_, j) => !batch[j].existing);
              if (newRows.length) {
                const result = await db()
                  .insert(vectors)
                  .values(newRows)
                  .onConflictDoNothing({
                    target: [vectors.editionSlug, vectors.digest],
                  });
                inserted = result.rowCount ?? 0;
                counts.updated += inserted;
              }
              stage = "embedding";
              const embeddings = await normalizedEmbeddings(
                provider,
                batch.map(({ source }) =>
                  isArtwork
                    ? source.text
                    : collection + " · " + source.title + "\n" + source.text,
                ),
              );
              stage = "vector-write";
              await upsertEmbeddings(
                rows.map((row, j) => ({
                  ...row,
                  model: provider.key,
                  embedding: embeddings[j],
                })),
              );
            } else {
              await upsertEmbeddings(rows);
            }
            counts.updated += batch.length - inserted;
            for (const { digest } of batch) completed.add(digest);
          } catch (error) {
            counts.failed++;
            for (const { digest } of batch) failed.add(digest);
            report(stage, batch.length, error);
          }
        }

        let pruneFailed = false;
        // A partial artwork projection cannot establish which old sources disappeared.
        if (!artwork?.lookupIncomplete) {
          const obsolete = [...old.keys()].filter(
            (digest) => !current.has(digest),
          );
          for (let i = 0; i < obsolete.length; i += 500) {
            const batch = obsolete.slice(i, i + 500);
            try {
              counts.removed +=
                (
                  await db()
                    .delete(vectors)
                    .where(
                      and(
                        eq(vectors.editionSlug, slug),
                        inArray(vectors.digest, batch),
                      ),
                    )
                ).rowCount ?? 0;
            } catch (error) {
              counts.failed++;
              pruneFailed = true;
              report("prune", batch.length, error);
            }
          }
        }

        reportIndex({
          ...progress,
          status:
            failed.size ||
            pruneFailed ||
            artwork?.lookupIncomplete ||
            artwork?.failed
              ? "partial"
              : isArtwork && !artwork
                ? "disabled"
                : "complete",
          completed: completed.size,
          pending: current.size - completed.size,
          failed: failed.size,
        } as const);

        if (artwork) {
          const artworkProgress = {
            completed: 0,
            pending: 0,
            failed: artwork.unresolvedSlots,
          };
          for (const map of artwork.maps) {
            const text = artwork.descriptions.get(map.image);
            const digest = text && sourceDigest("artwork", { ...map, text });
            if (provider && digest && completed.has(digest))
              artworkProgress.completed++;
            else if (text === null || (digest && failed.has(digest)))
              artworkProgress.failed++;
            else artworkProgress.pending++;
          }
          reportArtwork({
            edition: slug,
            status: "active",
            embeddingEnabled: !!provider,
            unresolvedSlots: artwork.unresolvedSlots,
            ...artworkProgress,
          });
        } else if (isArtwork) {
          reportArtwork({ edition: slug, status: "disabled" });
        }
      }
    }
    return { status: counts.failed ? "partial" : "complete", ...counts };
  } finally {
    try {
      if (locked)
        await connection.query("select pg_advisory_unlock(1329810514, 1437)");
    } finally {
      connection.release(true);
    }
  }
}
