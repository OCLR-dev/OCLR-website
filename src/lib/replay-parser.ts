import { execFile } from "node:child_process";
import { HttpError } from "./http-error";
import { REPLAY_MAX_BYTES, type ReplaySummary } from "./replay-model";

const EXPANDED_LIMIT = 16 * 1024 * 1024;
// A fixed isolated decoder; neither filenames nor uploaded text become code/argv.
// liblzma bounds dictionary memory; max_length bounds output even for unknown-size streams.
const decoder = `import sys
try: import lzma
except ImportError: sys.exit(3)
try:
 d=lzma.LZMADecompressor(format=lzma.FORMAT_ALONE,memlimit=32*1024*1024)
 data=d.decompress(sys.stdin.buffer.read(${REPLAY_MAX_BYTES + 1}),max_length=${EXPANDED_LIMIT + 1})
 if len(data)>${EXPANDED_LIMIT} or not d.eof or d.unused_data: sys.exit(2)
 sys.stdout.buffer.write(data)
except Exception: sys.exit(2)
`;
let active = 0;
async function decompress(bytes: Buffer): Promise<Buffer> {
  if (active >= 2)
    throw new HttpError(429, "Replay validation is busy. Retry shortly.");
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = execFile(
        "python3",
        ["-I", "-c", decoder],
        {
          encoding: "buffer",
          timeout: 3000,
          killSignal: "SIGKILL",
          maxBuffer: EXPANDED_LIMIT + 1,
        },
        (error, stdout) => {
          if (error)
            reject(
              (error as NodeJS.ErrnoException).code === "ENOENT" ||
                (error as { code?: number }).code === 3
                ? new HttpError(
                    503,
                    "Replay validation requires Python 3 with LZMA support on the app host.",
                  )
                : new HttpError(
                    400,
                    "Replay data is corrupt, unsupported or exceeds validation limits.",
                  ),
            );
          else resolve(stdout);
        },
      );
      child.stdin?.on("error", () => {});
      child.stdin?.end(bytes);
    });
  } finally {
    active--;
  }
}
export async function parseReplay(bytes: Buffer): Promise<ReplaySummary> {
  if (!bytes.length || bytes.length > REPLAY_MAX_BYTES)
    throw new HttpError(413, "Choose a stable .osr replay up to 8 MiB.");
  let summary: ReplaySummary;
  let compressed: Buffer;
  try {
    let offset = 0;
    const take = (size: number) => {
      if (size < 0 || offset + size > bytes.length) throw new Error();
      const result = bytes.subarray(offset, offset + size);
      offset += size;
      return result;
    };
    const byte = () => take(1)[0];
    const int = () => take(4).readInt32LE();
    const string = (limit: number) => {
      const tag = byte();
      if (!tag) return "";
      if (tag !== 11) throw new Error();
      let size = 0,
        shift = 0,
        b: number;
      do {
        b = byte();
        size += (b & 127) * 2 ** shift;
        shift += 7;
        if (shift > 28) throw new Error();
      } while (b & 128);
      if (size > limit) throw new Error();
      return new TextDecoder("utf-8", { fatal: true }).decode(take(size));
    };
    const mode = byte(),
      version = int();
    if (version < 20140721 || version >= 30000000)
      throw new HttpError(
        415,
        "Only stable .osr versions from 20140721 are supported. Lazer replays are not supported.",
      );
    if (mode > 3) throw new Error();
    const beatmapMd5 = string(32),
      playerName = string(256),
      replayMd5 = string(32);
    if (
      !/^[a-f0-9]{32}$/i.test(beatmapMd5) ||
      !/^[a-f0-9]{32}$/i.test(replayMd5) ||
      !playerName ||
      /[\p{Cc}\p{Cf}]/u.test(playerName)
    )
      throw new Error();
    take(12);
    if (int() < 0) throw new Error();
    take(2);
    if (byte() > 1) throw new Error();
    const mods = int();
    if (mods < 0) throw new Error();
    string(65536);
    const ticks = take(8).readBigInt64LE();
    if (ticks < 0n || ticks > 3155378975999999999n) throw new Error();
    const length = int();
    if (length < 13) throw new Error();
    compressed = take(length);
    take(8);
    if (mods & (1 << 23)) {
      if (!Number.isFinite(take(8).readDoubleLE())) throw new Error();
    }
    if (offset !== bytes.length) throw new Error();
    summary = {
      format: "stable",
      version,
      beatmapMd5: beatmapMd5.toLowerCase(),
      playerName,
      mode: (["osu", "taiko", "fruits", "mania"] as const)[mode],
      mods,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "Replay data is corrupt, unsupported or exceeds validation limits.",
    );
  }
  const expanded = await decompress(compressed);
  // Bounded linear scan, without allocating an unbounded array of frames.
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(expanded);
  } catch {
    throw new HttpError(
      400,
      "Replay data is corrupt, unsupported or exceeds validation limits.",
    );
  }
  let start = 0,
    frames = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i !== text.length && text[i] !== ",") continue;
    const frame = text.slice(start, i);
    start = i + 1;
    if (!frame && i === text.length) continue;
    if (
      ++frames > 300000 ||
      frame.length > 200 ||
      !/^-?\d+\|-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\|-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\|-?\d+$/.test(
        frame,
      ) ||
      frame.split("|").some((v) => !Number.isFinite(Number(v)))
    )
      throw new HttpError(
        400,
        "Replay data is corrupt, unsupported or exceeds validation limits.",
      );
  }
  if (!frames)
    throw new HttpError(
      400,
      "Replay data is corrupt, unsupported or exceeds validation limits.",
    );
  return summary;
}
