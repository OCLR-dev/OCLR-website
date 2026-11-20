import { createHash } from "node:crypto";
import { lstat, open, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { HttpError } from "./http-error";
import { mediaDirectory } from "./media-directory";
import { REPLAY_BEATMAP_MAX_BYTES } from "./replay-model";
import { readPrivatePlaybackFile } from "./replay-playback-storage";

const maxStoredBytes = 4 * 1024 ** 3;
const maxStoredFiles = 1024;
const keyPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const managedName =
  /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.(osz|tmp)$/;

function oszFilename(key: string) {
  if (!keyPattern.test(key))
    throw new HttpError(404, "The replay playback asset is missing.");
  return `${key}.osz`;
}

/** Called under the cache storage lock. Old and orphaned bytes count toward the limit. */
export async function storeBeatmapPackage(key: string, bytes: Buffer) {
  const directory = await mediaDirectory("beatmaps");
  const target = join(directory, oszFilename(key));
  let total = bytes.length,
    files = 1;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const stat = await lstat(join(directory, entry.name)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      },
    );
    if (!stat?.isFile()) continue;
    total += stat.size;
    files++;
    if (total > maxStoredBytes || files > maxStoredFiles)
      throw new HttpError(507, "Beatmap cache storage is full.");
  }
  const temp = join(directory, `${key}.tmp`);
  const handle = await open(temp, "wx", 0o600);
  let renamed = false;
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
    renamed = true;
    const parent = await open(directory, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch (error) {
    await unlink(renamed ? target : temp).catch(() => {});
    throw error;
  }
}

export async function readCachedBeatmapPackage(
  key: string,
  size: number,
  sha256: string,
) {
  const bytes = await readPrivatePlaybackFile(
    await mediaDirectory("beatmaps", false),
    oszFilename(key),
    REPLAY_BEATMAP_MAX_BYTES,
  );
  if (
    bytes.length !== size ||
    createHash("sha256").update(bytes).digest("hex") !== sha256
  )
    throw new HttpError(
      422,
      "The cached beatmap package is damaged. Cache it again.",
    );
  return bytes;
}

export async function removeCachedBeatmapPackage(key: string) {
  const directory = await mediaDirectory("beatmaps", false);
  await unlink(join(directory, oszFilename(key))).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
}

/** Run only while writes are stopped. Retain non-cache files and recent partial writes. */
export async function cleanupBeatmapCache(
  active: Set<string>,
  now = Date.now(),
) {
  const directory = await mediaDirectory("beatmaps", false);
  const names = await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    },
  );
  let removed = 0;
  for (const name of names) {
    const match = managedName.exec(name);
    if (!match || (match[2] === "osz" && active.has(match[1]))) continue;
    const path = join(directory, name);
    const stat = await lstat(path);
    if (stat.isFile() && now - stat.mtimeMs > 86400000) {
      await unlink(path);
      removed++;
    }
  }
  return removed;
}
