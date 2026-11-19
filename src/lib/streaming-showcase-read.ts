import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, readOnlyData } from "@/db";
import {
  mappoolEntries,
  mappoolReplays,
  mappoolShowcaseAccess,
  mappools,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import { editionOperationState } from "./archive-guard";
import { beatmapCoverUrl } from "./beatmap-artwork";
import { DeveloperApiError } from "./developer-api";
import { readDataResponse } from "./developer-api-http";
import { REPLAY_MAX_BYTES } from "./replay-model";
import { readReplay } from "./replay-storage";
import { isShowcaseParticipant } from "./streaming-showcase-access";
import {
  assertStreamer,
  authenticateStreamingRead,
  streamingOrigins,
  touchStreamingAccess,
  type StreamingReadPrincipal,
} from "./streaming-api";
import {
  showcasePath,
  showcasePoolSchema,
  showcasePoolsSchema,
  showcaseReplaysSchema,
  showcaseReadMaxBytes,
  showcaseVersionQuery,
} from "./streaming-showcase-contract";

function notFound() {
  return new DeveloperApiError(
    404,
    "NOT_FOUND",
    "This Showcase source is not available.",
  );
}

async function allowedPools(edition: string, osuId: number, poolId?: string) {
  const rows = await db()
    .select({
      id: mappools.id,
      name: mappools.name,
      version: mappools.version,
      updatedAt: mappools.updatedAt,
      stage: { id: tournamentStages.id, kind: tournamentStages.kind },
      round: {
        id: tournamentRounds.id,
        name: tournamentRounds.name,
        position: tournamentRounds.position,
      },
      entryCount: count(mappoolEntries.id),
      allowReplays: mappoolShowcaseAccess.allowReplays,
    })
    .from(mappools)
    .innerJoin(
      mappoolShowcaseAccess,
      and(
        eq(mappoolShowcaseAccess.poolId, mappools.id),
        eq(mappoolShowcaseAccess.userId, osuId),
        eq(mappoolShowcaseAccess.approvedVersion, mappools.version),
        eq(mappoolShowcaseAccess.approvedLockAt, mappools.selectionLockedAt),
      ),
    )
    .innerJoin(tournamentRounds, eq(tournamentRounds.id, mappools.roundId))
    .innerJoin(
      tournamentStages,
      eq(tournamentStages.id, tournamentRounds.stageId),
    )
    .leftJoin(mappoolEntries, eq(mappoolEntries.poolId, mappools.id))
    .where(
      and(
        eq(mappools.editionSlug, edition),
        isNull(mappools.publishedAt),
        poolId ? eq(mappools.id, poolId) : undefined,
      ),
    )
    .groupBy(
      mappools.id,
      tournamentRounds.id,
      tournamentStages.id,
      mappoolShowcaseAccess.allowReplays,
    )
    .orderBy(
      tournamentStages.kind,
      tournamentRounds.position,
      mappools.name,
      mappools.id,
    );
  return rows.map(({ allowReplays, ...pool }) => ({
    pool: { ...pool, updatedAt: pool.updatedAt.toISOString() },
    allowReplays,
  }));
}

async function assertShowcaseReader(edition: string, osuId: number) {
  await assertStreamer(osuId, edition);
  if (await isShowcaseParticipant(db(), edition, osuId))
    throw new DeveloperApiError(
      403,
      "SHOWCASE_FORBIDDEN",
      "Showcase access is unavailable for this account.",
    );
  const state = await editionOperationState(edition, db());
  if (
    !state?.configuration?.published ||
    state.configuration.status === "completed" ||
    state.hasArchive
  )
    throw notFound();
}

function requestedVersion(query: URLSearchParams, required = false) {
  const version = query.get("version");
  if (version === null && !required) return null;
  if (!showcaseVersionQuery.safeParse(version).success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose a valid Showcase pool version.",
    );
  return Number(version);
}

async function currentPool(
  edition: string,
  osuId: number,
  poolId: string,
  version: number | null,
) {
  if (!z.uuid().safeParse(poolId).success) throw notFound();
  const [source] = await allowedPools(edition, osuId, poolId);
  if (!source) throw notFound();
  if (version !== null && version !== source.pool.version)
    throw new DeveloperApiError(
      409,
      "SHOWCASE_VERSION_CHANGED",
      "Refresh the Showcase pool list before importing.",
    );
  return source;
}

function privateShowcase(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.append("Vary", "Authorization");
  return response;
}

export async function streamingShowcaseResponse(
  request: Request,
  edition: string,
  poolId?: string,
) {
  return privateShowcase(
    await readDataResponse<unknown, StreamingReadPrincipal>(
      request,
      "identity:read",
      async (principal, query) => {
        const osuId = principal!.subject.osuId;
        await assertShowcaseReader(edition, osuId);
        if (poolId === undefined) {
          const sources = await allowedPools(edition, osuId);
          return { data: { pools: sources.map(({ pool }) => pool) } };
        }
        const { pool } = await currentPool(
          edition,
          osuId,
          poolId,
          requestedVersion(query),
        );
        const rows = await db()
          .select({
            id: mappoolEntries.id,
            category: mappoolEntries.category,
            position: mappoolEntries.position,
            beatmapId: mappoolEntries.beatmapId,
            metadata: mappoolEntries.metadata,
          })
          .from(mappoolEntries)
          .where(eq(mappoolEntries.poolId, pool.id))
          .orderBy(mappoolEntries.category, mappoolEntries.position);
        return {
          data: {
            pool,
            entries: rows.map(({ id, metadata, ...entry }) => ({
              ...entry,
              entryId: id,
              slot: `${entry.category}${entry.position}`,
              title: metadata.title,
              difficulty: metadata.difficulty,
              coverUrl: beatmapCoverUrl(metadata.setId)
                ? `${showcasePath.replace("{edition}", edition)}/${pool.id}/covers/${id}?version=${pool.version}`
                : null,
            })),
          },
        };
      },
      {
        onSuccess:
          request.method === "GET"
            ? () => touchStreamingAccess(request, edition)
            : undefined,
        origins: streamingOrigins,
        authenticate: (r) => authenticateStreamingRead(r, edition),
        query: poolId === undefined ? [] : ["version"],
        schema: poolId === undefined ? showcasePoolsSchema : showcasePoolSchema,
        database: true,
        maxBytes: showcaseReadMaxBytes,
      },
    ),
  );
}

async function authorizedCover(
  edition: string,
  osuId: number,
  poolId: string,
  entryId: string,
  version: number,
) {
  return readOnlyData(async () => {
    await assertShowcaseReader(edition, osuId);
    if (!z.uuid().safeParse(entryId).success) throw notFound();
    await currentPool(edition, osuId, poolId, version);
    const [entry] = await db()
      .select({ metadata: mappoolEntries.metadata })
      .from(mappoolEntries)
      .where(
        and(eq(mappoolEntries.poolId, poolId), eq(mappoolEntries.id, entryId)),
      );
    const url = beatmapCoverUrl(entry?.metadata.setId);
    if (!url) throw notFound();
    return url;
  });
}

async function readCover(url: string) {
  const unavailable = () =>
    new DeveloperApiError(
      502,
      "COVER_UNAVAILABLE",
      "Showcase artwork is temporarily unavailable.",
    );
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw unavailable();
  }
  if (response.status === 404) {
    await response.body?.cancel();
    throw notFound();
  }
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (
    !response.ok ||
    !response.body ||
    !contentType ||
    !["image/jpeg", "image/webp", "image/png"].includes(contentType)
  ) {
    await response.body?.cancel();
    throw unavailable();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > showcaseReadMaxBytes) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(chunk.value);
    }
  } catch {
    throw unavailable();
  } finally {
    reader.releaseLock();
  }
  if (!size) throw unavailable();
  return { bytes: Buffer.concat(chunks), contentType };
}

export async function streamingShowcaseCover(
  request: Request,
  edition: string,
  poolId: string,
  entryId: string,
) {
  return privateShowcase(
    await readDataResponse<unknown, StreamingReadPrincipal>(
      request,
      "identity:read",
      async (principal, query) => {
        const osuId = principal!.subject.osuId;
        const version = requestedVersion(query, true)!;
        const url = await authorizedCover(
          edition,
          osuId,
          poolId,
          entryId,
          version,
        );
        const media = await readCover(url);
        // Artwork can take time to load; use a fresh saved snapshot before serving it.
        if (
          url !==
          (await authorizedCover(edition, osuId, poolId, entryId, version))
        )
          throw notFound();
        return { data: media };
      },
      {
        origins: streamingOrigins,
        authenticate: (r) => authenticateStreamingRead(r, edition),
        query: ["version"],
        binary: true,
        maxBytes: showcaseReadMaxBytes,
      },
    ),
  );
}

async function showcaseReplayPool(
  edition: string,
  osuId: number,
  poolId: string,
  version: number,
) {
  await assertShowcaseReader(edition, osuId);
  const { pool, allowReplays } = await currentPool(
    edition,
    osuId,
    poolId,
    version,
  );
  if (!allowReplays)
    throw new DeveloperApiError(
      403,
      "SHOWCASE_REPLAYS_FORBIDDEN",
      "Replay access has not been granted for this Showcase pool version.",
    );
  return pool;
}

export async function streamingShowcaseReplays(
  request: Request,
  edition: string,
  poolId: string,
) {
  return privateShowcase(
    await readDataResponse<
      z.infer<typeof showcaseReplaysSchema>,
      StreamingReadPrincipal
    >(
      request,
      "identity:read",
      async (principal, query) => {
        const version = requestedVersion(query, true)!;
        const pool = await showcaseReplayPool(
          edition,
          principal!.subject.osuId,
          poolId,
          version,
        );
        const rows = await db()
          .select({
            entryId: mappoolEntries.id,
            category: mappoolEntries.category,
            position: mappoolEntries.position,
            replay: {
              replayId: mappoolReplays.id,
              filename: mappoolReplays.filename,
              summary: mappoolReplays.summary,
            },
          })
          .from(mappoolEntries)
          .leftJoin(
            mappoolReplays,
            eq(mappoolReplays.entryId, mappoolEntries.id),
          )
          .where(eq(mappoolEntries.poolId, poolId))
          .orderBy(
            mappoolEntries.category,
            mappoolEntries.position,
            mappoolReplays.createdAt,
            mappoolReplays.id,
          );
        type Entry = z.infer<typeof showcaseReplaysSchema>["entries"][number];
        const entries = new Map<string, Entry>();
        for (const { entryId, category, position, replay } of rows) {
          let entry = entries.get(entryId);
          if (!entry) {
            entry = { entryId, slot: `${category}${position}`, replays: [] };
            entries.set(entryId, entry);
          }
          if (replay) {
            const { playerName, mods } = replay.summary;
            entry.replays.push({
              replayId: replay.replayId,
              filename: replay.filename,
              playerName,
              mods,
            });
          }
        }
        return {
          data: { poolId: pool.id, version, entries: [...entries.values()] },
        };
      },
      {
        onSuccess:
          request.method === "GET"
            ? () => touchStreamingAccess(request, edition)
            : undefined,
        origins: streamingOrigins,
        authenticate: (r) => authenticateStreamingRead(r, edition),
        query: ["version"],
        schema: showcaseReplaysSchema,
        database: true,
        maxBytes: showcaseReadMaxBytes,
      },
    ),
  );
}

async function authorizedReplay(
  edition: string,
  osuId: number,
  poolId: string,
  version: number,
  replayId: string,
) {
  return readOnlyData(async () => {
    await showcaseReplayPool(edition, osuId, poolId, version);
    if (!z.uuid().safeParse(replayId).success) throw notFound();
    const [replay] = await db()
      .select({
        id: mappoolReplays.id,
        filename: mappoolReplays.filename,
        size: mappoolReplays.size,
        sha256: mappoolReplays.sha256,
      })
      .from(mappoolReplays)
      .innerJoin(mappoolEntries, eq(mappoolEntries.id, mappoolReplays.entryId))
      .where(
        and(eq(mappoolEntries.poolId, poolId), eq(mappoolReplays.id, replayId)),
      );
    if (!replay) throw notFound();
    return replay;
  });
}

export async function streamingShowcaseReplayFile(
  request: Request,
  edition: string,
  poolId: string,
  replayId: string,
) {
  return privateShowcase(
    await readDataResponse<unknown, StreamingReadPrincipal>(
      request,
      "identity:read",
      async (principal, query) => {
        const osuId = principal!.subject.osuId;
        const version = requestedVersion(query, true)!;
        const replay = await authorizedReplay(
          edition,
          osuId,
          poolId,
          version,
          replayId,
        );
        const bytes = await readReplay(replay.id, replay.size, replay.sha256);
        // Recheck the grant, version and attachment after reading from private storage.
        await authorizedReplay(edition, osuId, poolId, version, replayId);
        return {
          data: {
            bytes,
            contentType: "application/octet-stream",
            filename: replay.filename,
          },
        };
      },
      {
        origins: streamingOrigins,
        authenticate: (r) => authenticateStreamingRead(r, edition),
        query: ["version"],
        binary: true,
        maxBytes: REPLAY_MAX_BYTES,
      },
    ),
  );
}
