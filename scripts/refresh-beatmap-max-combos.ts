#!/usr/bin/env node
/**
 * Refresh the static beatmap max-combo table used by the MRA v4 leaderboard.
 *
 * The osu! `/beatmaps?ids[]=` batch endpoint returns `max_combo` for osu!standard
 * maps (up to 50 IDs per request). IDs come from imported mappool snapshots and
 * the checked-in published-statistics ID snapshot; older imports sometimes omit
 * maps that still appear in published plays. We keep only the integer needed by
 * the rating calculation; no user data or credentials are written.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { z } from "zod";
import { osuApi } from "../src/lib/osu-api";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMPORTS = path.join(ROOT, "docs", "imports");
const STATISTICS_IDS = path.join(
  ROOT,
  "src",
  "data",
  "statistics-beatmap-ids.json",
);
const OUTPUT = path.join(ROOT, "src", "data", "beatmap-max-combos.json");

const response = z.object({
  beatmaps: z.array(
    z.object({
      id: z.number().int().positive(),
      mode: z.string(),
      max_combo: z.number().int().nonnegative().nullable().optional(),
    }),
  ),
});

async function archiveBeatmapIds(): Promise<number[]> {
  const ids = new Set<number>();
  for (const name of await readdir(IMPORTS)) {
    if (!name.endsWith("-archive.json")) continue;
    const data = JSON.parse(await readFile(path.join(IMPORTS, name), "utf8"));
    for (const pool of data.pools ?? []) {
      for (const map of pool.maps ?? []) {
        if (Number.isSafeInteger(map.beatmapId) && map.beatmapId > 0)
          ids.add(map.beatmapId);
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

async function statisticsBeatmapIds(): Promise<number[]> {
  const data = JSON.parse(await readFile(STATISTICS_IDS, "utf8"));
  if (!Array.isArray(data.ids)) {
    throw new Error("statistics-beatmap-ids.json must contain an ids array.");
  }
  return data.ids.filter(
    (id: unknown): id is number =>
      Number.isSafeInteger(id) && Number(id) > 0,
  );
}

async function main() {
  nextEnv.loadEnvConfig(ROOT);
  const ids = [
    ...new Set([
      ...(await archiveBeatmapIds()),
      ...(await statisticsBeatmapIds()),
    ]),
  ].sort((a, b) => a - b);
  const combos: Record<string, number> = {};
  const unavailable: number[] = [];
  const skipped: number[] = [];

  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50);
    const query = chunk.map((id) => `ids[]=${id}`).join("&");
    const parsed = response.safeParse(await osuApi(`/beatmaps?${query}`));
    if (!parsed.success) throw new Error("osu! returned an unexpected batch payload.");
    const byId = new Map(parsed.data.beatmaps.map((map) => [map.id, map]));
    for (const id of chunk) {
      const map = byId.get(id);
      if (!map) unavailable.push(id);
      else if (map.mode !== "osu" || map.max_combo == null) skipped.push(id);
      else combos[String(id)] = map.max_combo;
    }
    process.stderr.write(`fetched ${Math.min(offset + 50, ids.length)}/${ids.length}\n`);
  }

  const payload = {
    source: "https://osu.ppy.sh/api/v2/beatmaps?ids[]=",
    fetchedAt: new Date().toISOString(),
    combos,
    unavailable,
    skipped,
  };
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `wrote ${Object.keys(combos).length} combos; unavailable ${unavailable.length}; skipped ${skipped.length}`,
  );
}

await main();
