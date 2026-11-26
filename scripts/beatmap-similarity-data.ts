import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { difficultyRate } from "../src/lib/difficulty-display";
import {
  configurationEnvelope,
  projectPublicPools,
  publicOrigin,
  snapshotSchema,
  type Slot,
  type Snapshot,
} from "../src/lib/beatmap-similarity-model";

export async function fetchPublicJson(path: string) {
  const response = await fetch(publicOrigin + path, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      "Public read " + path + " returned HTTP " + response.status,
    );
  return response.json() as Promise<unknown>;
}

export async function readPublicSnapshot(
  editions: string[],
  osuDir?: string,
): Promise<Snapshot> {
  const projections = await Promise.all(
    editions.map(async (edition) => {
      const path = "/api/v1/tournaments/" + edition;
      const configuration = await fetchPublicJson(path + "/configuration");
      const { data } = configurationEnvelope.parse(configuration);
      const native = data.edition.archive
        ? undefined
        : await fetchPublicJson(path + "/mappools");
      return projectPublicPools(edition, configuration, native);
    }),
  );
  const slots = projections.flatMap((projection) => projection.slots);
  if (osuDir) await addFileFeatures(slots, osuDir);
  return snapshotSchema.parse({
    version: 1,
    capturedAt: new Date().toISOString(),
    sources: projections.map((projection) => projection.source),
    slots,
  });
}

export function fileFeatures(
  bytes: Buffer,
  bid: number,
  checksum: string,
  clockRate: number,
) {
  if (createHash("md5").update(bytes).digest("hex") !== checksum.toLowerCase())
    return;
  const text = bytes.toString("utf8");
  if (!/^\uFEFF?osu file format v\d+\r?$/m.test(text)) return;
  const metadata =
    /\[Metadata\][^\S\r\n]*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(
      text,
    )?.[1] ?? "";
  const fileBid = Number(
    /^BeatmapID:[ \t]*(\d+)[ \t]*\r?$/m.exec(metadata)?.[1],
  );
  const setId = Number(
    /^BeatmapSetID:[ \t]*(\d+)[ \t]*\r?$/m.exec(metadata)?.[1],
  );
  if (fileBid !== bid || !/^Mode:[ \t]*0[ \t]*\r?$/m.test(text)) return;
  const section =
    /\[HitObjects\][^\S\r\n]*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(
      text,
    )?.[1] ?? "";
  const starts = Array.from(
    new Set(
      section.split(/\r?\n/).flatMap((line) => {
        const [, , time, type] = line.split(",", 5);
        if (
          !/^-?\d+$/.test(time ?? "") ||
          !/^\d+$/.test(type ?? "") ||
          !(Number(type) & 3)
        )
          return [];
        return [Number(time) / clockRate];
      }),
    ),
  ).sort((a, b) => a - b);
  let lastGap = 0;
  let eligible = 0;
  let changes = 0;
  let left = 0;
  let peak = 0;
  for (let index = 1; index < starts.length; index++) {
    const gap = starts[index] - starts[index - 1];
    if (gap >= 25 && gap <= 1_000 && lastGap >= 25 && lastGap <= 1_000) {
      eligible++;
      if (Math.max(gap, lastGap) / Math.min(gap, lastGap) >= 1.25) changes++;
    }
    lastGap = gap;
    while (starts[index] - starts[left] >= 30_000) left++;
    peak = Math.max(peak, index - left + 1);
  }
  return {
    setId: Number.isSafeInteger(setId) && setId > 0 ? setId : undefined,
    rhythmChangeShare: eligible >= 20 ? changes / eligible : undefined,
    sustainedDensity:
      starts.length > 1 && starts[starts.length - 1] - starts[0] >= 30_000
        ? peak / 30
        : undefined,
  };
}

async function addFileFeatures(slots: Slot[], directory: string) {
  const files = new Map<number, Buffer | undefined>();
  for (const slot of slots) {
    if (!slot.bid || !slot.checksum || !slot.mod) continue;
    if (!files.has(slot.bid)) {
      const path = join(directory, String(slot.bid) + ".osu");
      const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      files.set(
        slot.bid,
        stat?.isFile() && stat.size <= 2_000_000
          ? await readFile(path)
          : undefined,
      );
    }
    const bytes = files.get(slot.bid);
    const details =
      bytes &&
      fileFeatures(bytes, slot.bid, slot.checksum, difficultyRate(slot.mod));
    slot.file = !bytes ? "missing" : details ? "verified" : "unverified";
    if (!details) continue;
    slot.setId ??= details.setId;
    if (details.rhythmChangeShare !== undefined)
      slot.values.rhythmChangeShare = details.rhythmChangeShare;
    if (details.sustainedDensity !== undefined)
      slot.values.sustainedDensity = details.sustainedDensity;
  }
}
