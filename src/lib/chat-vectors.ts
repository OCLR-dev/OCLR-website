import { createHash } from "node:crypto";
import { embedMany } from "ai";
import { chatProvider } from "./chat-provider";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatSourceVectors as vectors } from "@/db/schema";
import type { Edition } from "./editions";
import { chatConfiguration } from "./chat-config";
import { chatTerms, rankedSources, type ChatSource } from "./chat-retrieval";
import { seasonContent, type ChatCollection } from "./chat-season-content";

export function sourceDigest(collection: ChatCollection, source: ChatSource) {
  return createHash("sha256")
    .update(JSON.stringify([collection, source.url, source.title, source.text]))
    .digest("hex");
}

export function embeddingProvider() {
  const config = chatConfiguration();
  const name = process.env.OCLR_CHAT_EMBEDDING_MODEL?.trim();
  if (!config || !name) return null;
  return {
    key: createHash("sha256")
      .update(JSON.stringify([config.baseURL, name]))
      .digest("hex"),
    model: chatProvider(config).embeddingModel(name),
  };
}

export async function normalizedEmbeddings(
  provider: NonNullable<ReturnType<typeof embeddingProvider>>,
  values: string[],
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(25_000);
  const { embeddings } = await embedMany({
    model: provider.model,
    values,
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (embeddings.length !== values.length)
    throw new Error("Incomplete embeddings");
  return embeddings.map((v) => {
    const length = Math.sqrt(v.reduce((sum, n) => sum + n * n, 0));
    if (
      !v.length ||
      v.length > 16384 ||
      !Number.isFinite(length) ||
      length <= 0
    )
      throw new Error("Invalid embedding");
    return v.map((n) => n / length);
  });
}

export async function searchSeasonIndex(
  edition: Edition,
  question: string,
  previous: string,
  signal?: AbortSignal,
  collection?: "artwork" | "players",
  onEmbeddingFallback?: (error: unknown) => void,
) {
  const metadata = {
    digest: vectors.digest,
    collection: vectors.collection,
    title: vectors.title,
    url: vectors.url,
    text: vectors.content,
    model: vectors.model,
  };
  const scope = and(
    eq(vectors.editionSlug, edition.slug),
    collection
      ? eq(vectors.collection, collection)
      : ne(vectors.collection, "artwork"),
  );
  const query = [question, previous].filter(Boolean).join(" ");
  const tokens = sql`${sql.param(chatTerms(query))}::text[]`;
  const rows = await db()
    .select(metadata)
    .from(vectors)
    .where(and(scope, sql`${vectors.keywords} && ${tokens}`))
    .orderBy(
      sql`cardinality(array(select unnest(${vectors.keywords}) intersect select unnest(${tokens}))) desc`,
      vectors.digest,
    )
    .limit(64);
  const searchable = rows.map((row) => ({
    ...row,
    text: row.collection + " · " + row.text,
  }));
  const lexical = rankedSources(searchable, question, 12);
  if (!lexical.length && previous)
    lexical.push(...rankedSources(searchable, query, 8));
  const provider = embeddingProvider();
  let semantic: typeof rows = [];
  if (
    provider &&
    (
      await db()
        .select({ digest: vectors.digest })
        .from(vectors)
        .where(and(scope, eq(vectors.model, provider.key)))
        .limit(1)
    ).length
  ) {
    try {
      const [v] = await normalizedEmbeddings(provider, [query], signal);
      // Stored and query vectors have unit length; the dot product is cosine similarity.
      const similarity = sql<number>`(select sum(a*b) from unnest(${vectors.embedding}, ${sql.param(v)}::double precision[]) as components(a,b))`;
      semantic = await db()
        .select(metadata)
        .from(vectors)
        .where(
          and(
            scope,
            eq(vectors.model, provider.key),
            sql`cardinality(${vectors.embedding}) = ${v.length}`,
            sql`${similarity} > ${collection === "artwork" ? 0.35 : 0}`,
          ),
        )
        .orderBy(sql`${similarity} desc`, vectors.digest)
        .limit(10);
    } catch (error) {
      signal?.throwIfAborted();
      onEmbeddingFallback?.(error);
      // Keyword hits remain usable while the embedding endpoint is unavailable.
    }
  }
  // Interleave both rankings, then require an exact match with today's public read model.
  const hits = [
    ...new Map(
      lexical
        .flatMap((row, i) => [row, ...semantic.slice(i, i + 1)])
        .concat(semantic)
        .map((row) => [row.digest, row]),
    ).values(),
  ];
  const reads = new Map<ChatCollection, Map<string, ChatSource>>();
  const sources: ChatSource[] = [];
  for (const hit of hits) {
    if (!reads.has(hit.collection)) {
      const current = await seasonContent(edition, hit.collection);
      reads.set(
        hit.collection,
        new Map(current.map((s) => [sourceDigest(hit.collection, s), s])),
      );
    }
    const current = reads.get(hit.collection)!.get(hit.digest);
    if (current) sources.push(current);
    if (sources.length >= 8) break;
  }
  return sources;
}
