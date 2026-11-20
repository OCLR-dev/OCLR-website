import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { prepareReplayArchive } from "../../src/lib/replay-playback-archive";
import { inspectBeatmapPackage } from "../../src/lib/beatmap-cache-archive";

function makeArchive(files: Record<string, string>) {
  return Uint8Array.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, body]) => [name, strToU8(body)]),
      ),
    ),
  ).buffer;
}

describe("replay playback archive", () => {
  it("selects the exact difficulty by the checksum of its original bytes", () => {
    const target =
      "osu file format v14\r\n[General]\r\nAudioFilename: clip.wav\r\n";
    const hash = createHash("md5").update(target).digest("hex");
    const source = makeArchive({
      "other.osu": "different revision",
      "map.osu": target,
      "clip.wav": "audio",
      "video.mp4": "unused",
    });
    const playback = unzipSync(
      new Uint8Array(prepareReplayArchive(source, hash)),
    );
    expect(Object.keys(playback)).toEqual(["map.osu", "clip.wav"]);
    expect(playback["map.osu"]).toEqual(strToU8(target));
    expect(() => prepareReplayArchive(source, "0".repeat(32))).toThrow(
      "mismatch",
    );
  });

  it("rejects traversal, ambiguous filenames and unexpanded size claims over the limit", () => {
    expect(() =>
      prepareReplayArchive(makeArchive({ "../cursor.png": "image" })),
    ).toThrow("invalid");
    expect(() =>
      prepareReplayArchive(
        makeArchive({ "cursor.png": "one", "Cursor.PNG": "two" }),
      ),
    ).toThrow("invalid");

    const data = makeArchive({ "cursor.png": "image" });
    const view = new DataView(data);
    const end = data.byteLength - 22;
    const directory = view.getUint32(end + 16, true);
    view.setUint32(directory + 24, 129 * 1024 * 1024, true);
    expect(() => prepareReplayArchive(data)).toThrow("invalid");
  });

  it("validates the server package by the exact difficulty bytes or saved BID", async () => {
    const target =
      "osu file format v14\r\n[General]\r\nAudioFilename: clip.wav\r\n[Metadata]\r\nBeatmapID:123\r\n";
    const checksum = createHash("md5").update(target).digest("hex");
    const source = Buffer.from(
      makeArchive({
        "map.osu": target,
        "clip.wav": "audio",
        "other.osu": target.replace("123", "124"),
      }),
    );
    await expect(inspectBeatmapPackage(source, 123, checksum)).resolves.toBe(
      checksum,
    );
    await expect(inspectBeatmapPackage(source, 123, undefined)).resolves.toBe(
      checksum,
    );
    await expect(
      inspectBeatmapPackage(source, 123, "0".repeat(32)),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      inspectBeatmapPackage(
        Buffer.from(
          makeArchive({
            "map.osu": target,
            "clip.wav": "audio",
            "../unsafe.txt": "bad path",
          }),
        ),
        123,
        checksum,
      ),
    ).rejects.toThrow("corrupt");
    await expect(
      inspectBeatmapPackage(
        Buffer.from(makeArchive({ "map.osu": target })),
        123,
        checksum,
      ),
    ).rejects.toThrow("no supported audio");
  });
});
