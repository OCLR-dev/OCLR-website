import { refreshArtwork } from "./chat-artwork-worker";
import { chatTerms } from "./chat-retrieval";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getPool, readOnlyData } from "@/db";
import { chatSourceVectors as vectors, editionState } from "@/db/schema";
import { getPublicEdition } from "./content";
import { chatCollections, seasonContent } from "./chat-season-content";
import {
  embeddingProvider,
  normalizedEmbeddings,
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

export async function refreshChatIndex(
  reportArtwork: (progress: ArtworkProgress) => void = () => {},
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
    const editions = await db()
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(published)
      .orderBy(editionState.slug);
    const visitedArtwork = new Set<string>();
    for (const { slug } of editions) {
      let reportedArtwork = false;
      try {
        const edition = await getPublicEdition(slug);
        if (!edition) continue;
        const saved = await db()
          .select({
            digest: vectors.digest,
            model: vectors.model,
            collection: vectors.collection,
            hasEmbedding: sql<boolean>`${vectors.embedding} is not null`,
          })
          .from(vectors)
          .where(eq(vectors.editionSlug, slug));
        const remaining = new Map(saved.map((row) => [row.digest, row]));
        const artwork = await refreshArtwork(edition, visitedArtwork);
        counts.failed +=
          (artwork?.failed ?? 0) + Number(artwork?.lookupIncomplete === true);
        const completed = new Set<string>();
        const failed = new Set<string>();
        const seen = new Set<string>();
        for (const collection of chatCollections) {
          const isArtwork = collection === "artwork";
          const sources = isArtwork
            ? (artwork?.sources ?? [])
            : await readOnlyData(() => seasonContent(edition, collection));
          const changed = [];
          for (const source of sources) {
            const digest = sourceDigest(collection, source);
            if (seen.has(digest)) continue;
            seen.add(digest);
            const old = remaining.get(digest);
            remaining.delete(digest);
            if (
              !old ||
              old.model !== (provider?.key ?? null) ||
              (provider && !old.hasEmbedding)
            ) {
              changed.push({ source, digest });
            } else if (isArtwork && old.hasEmbedding) {
              completed.add(digest);
            }
          }
          for (let i = 0; i < changed.length; i += 32) {
            const batch = changed.slice(i, i + 32);
            let embeddings: number[][] = [];
            try {
              if (provider)
                embeddings = await normalizedEmbeddings(
                  provider,
                  batch.map(({ source }) =>
                    isArtwork
                      ? source.text
                      : collection + " · " + source.title + "\n" + source.text,
                  ),
                );
            } catch (error) {
              if (!isArtwork) throw error;
              counts.failed++;
              for (const { digest } of batch) failed.add(digest);
              break;
            }
            await db()
              .insert(vectors)
              .values(
                batch.map(({ source, digest }, j) => ({
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
                  model: provider?.key ?? null,
                  embedding: embeddings[j] ?? null,
                })),
              )
              .onConflictDoUpdate({
                target: [vectors.editionSlug, vectors.digest],
                set: {
                  model: sql`excluded.model`,
                  embedding: sql`excluded.embedding`,
                },
              });
            counts.updated += batch.length;
            if (isArtwork && provider)
              for (const { digest } of batch) completed.add(digest);
          }
          if (isArtwork) {
            if (artwork) {
              const progress = {
                completed: 0,
                pending: 0,
                failed: artwork.unresolvedSlots,
              };
              for (const map of artwork.maps) {
                const text = artwork.descriptions.get(map.image);
                const digest =
                  text && sourceDigest("artwork", { ...map, text });
                if (digest && completed.has(digest)) progress.completed++;
                else if (text === null || (digest && failed.has(digest)))
                  progress.failed++;
                else progress.pending++;
              }
              reportArtwork({
                edition: slug,
                status: "active",
                embeddingEnabled: !!provider,
                unresolvedSlots: artwork.unresolvedSlots,
                ...progress,
              });
            } else {
              reportArtwork({ edition: slug, status: "disabled" });
            }
            reportedArtwork = true;
          }
        }
        const obsolete = [...remaining.values()]
          .filter(
            (row) => row.collection !== "artwork" || !artwork?.lookupIncomplete,
          )
          .map((row) => row.digest);
        for (let i = 0; i < obsolete.length; i += 500) {
          counts.removed +=
            (
              await db()
                .delete(vectors)
                .where(
                  and(
                    eq(vectors.editionSlug, slug),
                    inArray(vectors.digest, obsolete.slice(i, i + 500)),
                  ),
                )
            ).rowCount ?? 0;
        }
      } catch {
        if (!reportedArtwork) reportArtwork({ edition: slug, status: "error" });
        counts.failed++;
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
