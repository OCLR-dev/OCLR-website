import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { HttpError } from "./http-error";
import { mediaDirectory } from "./media-directory";
import {
  REPLAY_BEATMAP_MAX_BYTES,
  REPLAY_SKIN_MAX_BYTES,
} from "./replay-model";

export type ReplayPlaybackAsset = "beatmap.osz" | "skin.osk";

export async function readReplayPlaybackAsset(
  entryId: string,
  beatmapMd5: string,
  asset: ReplayPlaybackAsset,
) {
  if (!/^[a-f0-9-]{36}$/i.test(entryId) || !/^[a-f0-9]{32}$/i.test(beatmapMd5))
    throw new HttpError(404, "Replay target not found.");

  const isBeatmap = asset === "beatmap.osz";
  const directory = await mediaDirectory(
    isBeatmap ? "beatmaps" : "replay-skins",
    false,
  );
  const filename = isBeatmap
    ? `${entryId.toLowerCase()}-${beatmapMd5.toLowerCase()}.osz`
    : "default.osk";
  const maxBytes = isBeatmap ? REPLAY_BEATMAP_MAX_BYTES : REPLAY_SKIN_MAX_BYTES;
  return readPrivatePlaybackFile(directory, filename, maxBytes);
}

export async function readPrivatePlaybackFile(
  directory: string,
  filename: string,
  maxBytes: number,
) {
  try {
    const file = await open(
      join(directory, filename),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes)
        throw new HttpError(
          422,
          "The replay playback asset is invalid or too large.",
        );
      const bytes = new Uint8Array(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          offset,
          bytes.length - offset,
        );
        if (!bytesRead)
          throw new HttpError(
            503,
            "The replay playback asset could not be read.",
          );
        offset += bytesRead;
      }
      return bytes;
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new HttpError(404, "The replay playback asset is missing.");
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "The replay playback asset could not be read.");
  }
}
