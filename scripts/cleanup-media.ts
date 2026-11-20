import { mediaDirectory } from "../src/lib/media-directory";
/** Run with site writes stopped; only abandoned files older than one day. */
import { readdir, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { db, closeDb } from "../src/db";
import { cleanupReplayFiles } from "../src/lib/replay-storage";
import { cleanupBeatmapCache } from "../src/lib/beatmap-cache-storage";
import { teams, mappoolReplays, mappoolBeatmapCache } from "../src/db/schema";
try {
  const directory = await mediaDirectory("teams", false);
  const active = new Set(
    (await db().select({ key: teams.avatarKey }).from(teams)).map((t) => t.key),
  );
  let removed = 0;
  for (const name of await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  )) {
    const match = /^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.webp$/.exec(
      name,
    );
    if (!match || active.has(match[1])) continue;
    const path = join(directory, name),
      stat = await lstat(path);
    if (
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      Date.now() - stat.mtimeMs > 86400000
    ) {
      await unlink(path);
      removed++;
    }
  }
  const replays = new Set(
    (await db().select({ id: mappoolReplays.id }).from(mappoolReplays)).map(
      (r) => r.id,
    ),
  );
  const removedReplays = await cleanupReplayFiles(replays);
  const cachedBeatmaps = new Set(
    (
      await db()
        .select({ key: mappoolBeatmapCache.fileKey })
        .from(mappoolBeatmapCache)
    ).map(({ key }) => key),
  );
  const removedBeatmaps = await cleanupBeatmapCache(cachedBeatmaps);
  console.log(
    `Removed ${removed} unreferenced old team images, ${removedReplays} old replay files and ${removedBeatmaps} old beatmap packages.`,
  );
} finally {
  await closeDb();
}
