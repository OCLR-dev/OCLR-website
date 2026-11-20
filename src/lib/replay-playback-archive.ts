import { unzipSync, zipSync } from "fflate";
import { md5 } from "replayviewer-js";
import {
  REPLAY_BEATMAP_MAX_BYTES,
  REPLAY_SKIN_MAX_BYTES,
  REPLAY_ARCHIVE_MAX_ENTRIES,
  REPLAY_ARCHIVE_MAX_EXPANDED_BYTES,
} from "./replay-model";

const mediaFile = /\.(?:png|jpe?g|mp3|ogg|wav)$/i;

export class ReplayArchiveError extends Error {
  constructor(readonly reason: "invalid" | "mismatch") {
    super(reason);
  }
}

/**
 * Bound extraction and pass only playable assets to replayviewer-js. Stored ZIP
 * entries also avoid the bundled unzipper's blob workers under OCLR's CSP.
 */
export function prepareReplayArchive(
  buffer: ArrayBuffer,
  targetHash?: string,
): ArrayBuffer {
  if (
    !buffer.byteLength ||
    buffer.byteLength >
      (targetHash ? REPLAY_BEATMAP_MAX_BYTES : REPLAY_SKIN_MAX_BYTES)
  )
    throw new ReplayArchiveError("invalid");

  const names = new Set<string>();
  let expandedBytes = 0;
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter({ name, size, originalSize, compression }) {
        const lower = name.toLowerCase();
        expandedBytes += Math.max(originalSize, size);
        if (
          names.size >= REPLAY_ARCHIVE_MAX_ENTRIES ||
          expandedBytes > REPLAY_ARCHIVE_MAX_EXPANDED_BYTES ||
          names.has(lower) ||
          /[\\:\x00-\x1f]/.test(name) ||
          name.startsWith("/") ||
          name.split("/").some((part) => part === "." || part === "..") ||
          (compression === 0 && size !== originalSize)
        )
          throw new ReplayArchiveError("invalid");
        names.add(lower);
        return (
          mediaFile.test(name) ||
          (targetHash ? lower.endsWith(".osu") : lower === "skin.ini")
        );
      },
    });
  } catch {
    throw new ReplayArchiveError("invalid");
  }

  if (targetHash) {
    const difficulties = Object.keys(files).filter((name) =>
      /\.osu$/i.test(name),
    );
    const selected = difficulties.find(
      (name) => md5(files[name]) === targetHash,
    );
    if (!selected) throw new ReplayArchiveError("mismatch");
    for (const name of difficulties) {
      if (name !== selected) delete files[name];
    }
  } else if (
    !Object.keys(files).some((name) => /\.(?:png|jpe?g)$/i.test(name))
  ) {
    throw new ReplayArchiveError("invalid");
  }

  return zipSync(files, { level: 0 }).buffer;
}
