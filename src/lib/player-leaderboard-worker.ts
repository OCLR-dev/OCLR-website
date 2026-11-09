import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import { db, readOnlyData } from "@/db";
import { playerLeaderboardRows, playerLeaderboardVersions } from "@/db/schema";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { readTournaments } from "./tournament-reads";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";
import { HttpError } from "./http-error";
import { projectPlayerLeaderboard } from "./player-leaderboard-projector";
import {
  leaderboardSource,
  matchingLeaderboard,
  leaderboardRow,
  PLAYER_LEADERBOARD_PROJECTOR,
} from "./player-leaderboard-cache";

/** Explicit operator/background job, never invoked by page/API reads. A small
 * writer transaction holds only the job lock while projection uses a separate
 * read-only repeatable snapshot. Source changes supersede the result safely.
 */
export async function refreshPlayerLeaderboard(apply = false, rebuild = false) {
  if (remoteMode() || (apply && inReadChannel()))
    throw new HttpError(
      403,
      "Background calculation requires an operator database.",
    );
  if (!apply)
    return readOnlyData(async () => {
      const source = await leaderboardSource(db());
      const ready = await matchingLeaderboard(db(), source.sourceHash);
      return {
        status: ready ? "current" : "pending",
        created: false,
        sourceComplete: source.sourceHash !== null,
        editions: source.editions,
        players: ready?.players ?? 0,
      };
    });
  return db().transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(1329810514, 916) AS locked`,
    );
    if (!lock.rows[0].locked) return { status: "busy", created: false };
    const source = await leaderboardSource(tx);
    if (!source.sourceHash)
      throw new HttpError(
        409,
        "Historical source metadata is incomplete; run the reviewed normalization first.",
      );
    const existing = await matchingLeaderboard(tx, source.sourceHash);
    if (existing && !rebuild)
      return {
        status: "current",
        created: false,
        editions: source.editions,
        players: existing.players,
      };
    const calculated = await readOnlyData(async () => {
      const start = await leaderboardSource(db());
      const editions = (await readTournaments(true)).map((row) => row.edition);
      return {
        source: start,
        result: await projectPlayerLeaderboard(
          editions,
          publicArchiveStatistics,
        ),
      };
    });
    const current = await leaderboardSource(tx);
    if (
      !calculated.source.sourceHash ||
      calculated.source.sourceHash !== current.sourceHash
    )
      return { status: "superseded", created: false };
    const result = calculated.result;
    for (const player of result.players)
      if (
        Object.values(player).some(
          (v) => typeof v === "number" && !Number.isFinite(v),
        )
      )
        throw new Error("Background ranking produced invalid numeric data.");
    const [version] = await tx
      .insert(playerLeaderboardVersions)
      .values({
        sourceHash: current.sourceHash!,
        projectorVersion: PLAYER_LEADERBOARD_PROJECTOR,
        editions: result.editions,
        unavailableEditions: result.unavailableEditions,
        maps: result.maps,
        skippedMaps: result.skippedMaps,
        players: result.players.length,
      })
      .returning();
    for (let offset = 0; offset < result.players.length; offset += 250)
      await tx.insert(playerLeaderboardRows).values(
        result.players.slice(offset, offset + 250).map((row, i) => {
          const { pp: _pp, classification, ...player } = row;
          void _pp;
          return {
            ...player,
            generationId: version.id,
            position: offset + i,
            classCategory: classification?.category ?? null,
            classCode: classification?.code ?? null,
          };
        }),
      );
    const restored = (
      await tx
        .select()
        .from(playerLeaderboardRows)
        .where(eq(playerLeaderboardRows.generationId, version.id))
        .orderBy(playerLeaderboardRows.position)
    ).map(leaderboardRow);
    if (!isDeepStrictEqual(restored, result.players))
      throw new Error("Background ranking roundtrip mismatch.");
    return {
      status: "updated",
      created: true,
      editions: calculated.source.editions,
      players: result.players.length,
    };
  });
}
