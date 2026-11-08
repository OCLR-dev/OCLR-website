import { and, eq } from "drizzle-orm";
import { db, readOnlyData } from "@/db";
import { playerLeaderboardRows } from "@/db/schema";
import { cachedDirectoryStatistics } from "./osu-profiles";
import { currentPublicPlayerNames } from "./player-identity";
import {
  leaderboardSource,
  matchingLeaderboard,
  leaderboardRow,
} from "./player-leaderboard-cache";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import type {
  PlayerLeaderboard,
  PlayerLeaderboardCore,
  PlayerLeaderboardWire,
} from "./player-leaderboard-model";
export type {
  PlayerLeaderboard,
  PlayerLeaderboardRow,
} from "./player-leaderboard-model";

const empty = (): PlayerLeaderboardCore => ({
  players: [],
  editions: 0,
  unavailableEditions: 0,
  maps: 0,
  skippedMaps: 0,
});
async function decorate(core: PlayerLeaderboardCore) {
  const art: PlayerLeaderboardWire["art"] = {};
  const names = remoteMode()
    ? new Map<number, string>()
    : await currentPublicPlayerNames(core.players.map((p) => p.osuId));
  core = {
    ...core,
    players: core.players.map((player) => ({
      ...player,
      username: names.get(player.osuId) ?? player.username,
    })),
  };
  try {
    const saved = await cachedDirectoryStatistics(
      core.players.map((p) => p.osuId),
    );
    for (const player of core.players)
      player.pp = saved.statistics.get(player.osuId)?.pp ?? null;
    for (const [id, value] of saved.art) art[id] = value;
  } catch {
    /* Optional saved pp/art must not hide public results. */
  }
  return { ...core, art };
}

/** Saved public DTO: a cache miss never runs the projector or writes to the DB. */
export async function databasePlayerLeaderboard(): Promise<PlayerLeaderboardWire> {
  if (!process.env.DATABASE_URL)
    return { ...empty(), art: {}, state: "pending", calculatedAt: null };
  return readOnlyData(async () => {
    const source = await leaderboardSource(db());
    const version = await matchingLeaderboard(db(), source.sourceHash);
    if (!version)
      return { ...empty(), art: {}, state: "pending", calculatedAt: null };
    const rows = await db()
      .select()
      .from(playerLeaderboardRows)
      .where(eq(playerLeaderboardRows.generationId, version.id))
      .orderBy(playerLeaderboardRows.position);
    return {
      ...(await decorate({
        players: rows.map(leaderboardRow),
        editions: version.editions,
        unavailableEditions: version.unavailableEditions,
        maps: version.maps,
        skippedMaps: version.skippedMaps,
      })),
      state: "ready",
      calculatedAt: version.calculatedAt.toISOString(),
    };
  });
}

type PublicPlayerMra =
  import("./explicit-read-contracts").ExplicitReadData<"publicPlayerMra">;
export async function databasePublicPlayerMra(
  osuId: number,
): Promise<PublicPlayerMra> {
  if (!process.env.DATABASE_URL)
    return { mra: null, state: "pending", calculatedAt: null };
  return readOnlyData(async () => {
    const source = await leaderboardSource(db());
    const version = await matchingLeaderboard(db(), source.sourceHash);
    if (!version) return { mra: null, state: "pending", calculatedAt: null };
    const [row] = await db()
      .select({ mra: playerLeaderboardRows.mra })
      .from(playerLeaderboardRows)
      .where(
        and(
          eq(playerLeaderboardRows.generationId, version.id),
          eq(playerLeaderboardRows.osuId, osuId),
        ),
      )
      .limit(1);
    return {
      mra: row?.mra ?? null,
      state: "ready",
      calculatedAt: version.calculatedAt.toISOString(),
    };
  });
}
async function supportsBackgroundReads() {
  const { frontendConnection } = await import("./frontend-data");
  const version = /^1\.(\d+)\./.exec(
    (await frontendConnection()).contractVersion ?? "",
  );
  return !!version && Number(version[1]) >= 24;
}
export async function playerLeaderboard(): Promise<PlayerLeaderboard> {
  if (remoteMode() && !(await supportsBackgroundReads())) {
    // Compatibility with older read-only backends; current backends use saved results.
    const { getPublicEditions } = await import("./content");
    const { publicArchiveStatistics } = await import("./archive-statistics");
    const { projectPlayerLeaderboard } =
      await import("./player-leaderboard-projector");
    const legacy = await decorate(
      await projectPlayerLeaderboard(
        await getPublicEditions(),
        publicArchiveStatistics,
        false,
      ),
    );
    return {
      ...legacy,
      art: new Map(
        Object.entries(legacy.art).map(([id, art]) => [Number(id), art]),
      ),
      state: "ready",
      calculatedAt: null,
    };
  }
  const result = remoteMode()
    ? await frontendResource<PlayerLeaderboardWire>("playerLeaderboard")
    : await databasePlayerLeaderboard();
  return {
    ...result,
    art: new Map(
      Object.entries(result.art).map(([id, art]) => [Number(id), art]),
    ),
  };
}
export async function publicPlayerMra(osuId: number): Promise<PublicPlayerMra> {
  if (!remoteMode()) return databasePublicPlayerMra(osuId);
  if (await supportsBackgroundReads())
    return frontendResource<PublicPlayerMra>("publicPlayerMra", { osuId });
  const legacy = await playerLeaderboard();
  return {
    mra: legacy.players.find((p) => p.osuId === osuId)?.mra ?? null,
    state: legacy.state,
    calculatedAt: legacy.calculatedAt,
  };
}
