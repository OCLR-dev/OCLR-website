import { describe, expect, it } from "vitest";
import { parseReplay } from "../../src/lib/replay-parser";
import { syntheticReplay, replayChecksum } from "../fixtures/replay";
import { REPLAY_MAX_BYTES } from "../../src/lib/replay-model";
describe("bounded stable replay validation", () => {
  it("extracts literal identities, checksum, ruleset and mods for supported stable containers", async () => {
    for (const mode of [0, 1, 2, 3])
      expect(
        await parseReplay(
          syntheticReplay({ mode, player: "[Literal] 123", mods: 8 }),
        ),
      ).toMatchObject({
        format: "stable",
        beatmapMd5: replayChecksum,
        playerName: "[Literal] 123",
        mods: 8,
        mode: ["osu", "taiko", "fruits", "mania"][mode],
      });
    expect(
      (await parseReplay(syntheticReplay({ version: 20140721, mods: 1 << 23 })))
        .version,
    ).toBe(20140721);
  });
  it("rejects unsupported lazer/old versions and disguised, truncated or trailing content", async () => {
    for (const version of [20140720, 30000000, 30000001])
      await expect(
        parseReplay(syntheticReplay({ version })),
      ).rejects.toMatchObject({ status: 415 });
    const valid = syntheticReplay();
    for (const b of [
      valid.subarray(0, 20),
      valid.subarray(0, -1),
      Buffer.concat([valid, Buffer.from("hidden")]),
      syntheticReplay({ mode: 4 }),
      syntheticReplay({ md5: "x".repeat(32) }),
      syntheticReplay({ player: "Fake\nName" }),
      syntheticReplay({ frames: "<script>alert(1)</script>" }),
      syntheticReplay({ frames: "" }),
    ])
      await expect(parseReplay(b)).rejects.toMatchObject({ status: 400 });
    await expect(
      parseReplay(Buffer.from("<html>fake.osr</html>")),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      parseReplay(Buffer.alloc(REPLAY_MAX_BYTES + 1)),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("uses stable judgements and the recorded score and FC flag across the four modes", async () => {
    const samples = [
      // Exactly 1% 50s qualifies for silver S. A slider break can leave zero misses.
      {
        mode: 0,
        mods: (1 << 29) | (1 << 3),
        hits: [95, 4, 1, 70, 10, 0],
        accuracy: 579 / 600,
        grade: "SH",
      },
      {
        mode: 0,
        mods: 0,
        hits: [90, 10, 0, 0, 0, 0],
        accuracy: 560 / 600,
        grade: "A",
      },
      {
        mode: 1,
        mods: 0,
        hits: [91, 9, 82, 1, 2, 0],
        accuracy: 191 / 200,
        grade: "S",
      },
      {
        mode: 2,
        mods: 0,
        hits: [50, 20, 28, 9, 2, 0],
        accuracy: 0.98,
        grade: "A",
      },
      {
        mode: 3,
        mods: 1 << 20,
        hits: [75, 0, 0, 25, 0, 0],
        accuracy: 1,
        grade: "SSH",
      },
      {
        mode: 3,
        mods: 1 << 29,
        hits: [75, 0, 0, 25, 0, 0],
        accuracy: 30125 / 30500,
        grade: "S",
      },
    ] as const;
    for (const { mode, mods, hits, accuracy, grade } of samples) {
      const summary = await parseReplay(
        syntheticReplay({
          mode,
          mods,
          judgements: hits,
          score: 999_999,
          fullCombo: mode === 3,
        }),
      );
      expect(summary.performance).toEqual({
        score: 999_999,
        accuracy,
        grade,
        fullCombo: mode === 3,
      });
    }
  });
  it("leaves accuracy and grade unavailable for no judgements or Target Practice", async () => {
    for (const replay of [
      syntheticReplay(),
      syntheticReplay({ mods: 1 << 23, judgements: [80, 0, 0, 0, 0, 0] }),
    ]) {
      expect((await parseReplay(replay)).performance).toEqual({
        score: 123456,
        accuracy: null,
        grade: null,
        fullCombo: false,
      });
    }
  });
  it("rejects damaged LZMA, excessive expansion and dictionary allocation", async () => {
    const b = syntheticReplay();
    b[b.length - 12] ^= 255;
    await expect(parseReplay(b)).rejects.toMatchObject({ status: 400 });
    const bomb = syntheticReplay({ frames: "0|0|0|0,".repeat(2200000) });
    await expect(parseReplay(bomb)).rejects.toMatchObject({ status: 400 });
    const dictionary = syntheticReplay();
    // Locate the LZMA header after the little-endian compressed size.
    const lzmaOffset = dictionary.indexOf(Buffer.from([0x5d, 0, 0, 0x80, 0]));
    expect(lzmaOffset).toBeGreaterThan(0);
    dictionary.writeUInt32LE(0x40000000, lzmaOffset + 1);
    await expect(parseReplay(dictionary)).rejects.toMatchObject({
      status: 400,
    });
  });
});
