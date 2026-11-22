import { spawnSync } from "node:child_process";
export const replayChecksum = "a".repeat(32);
export function syntheticReplay(
  options: {
    version?: number;
    mode?: number;
    md5?: string;
    player?: string;
    frames?: string;
    mods?: number;
    judgements?: readonly [number, number, number, number, number, number];
    score?: number;
    maxCombo?: number;
    fullCombo?: boolean;
  } = {},
) {
  const int = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    return b;
  };
  const str = (s: string) => {
    const bytes = Buffer.from(s),
      length: number[] = [];
    let n = bytes.length;
    do {
      const part = n & 127;
      n >>>= 7;
      length.push(part | (n ? 128 : 0));
    } while (n);
    return Buffer.concat([Buffer.from([11, ...length]), bytes]);
  };
  const compressed = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      "import lzma,sys; sys.stdout.buffer.write(lzma.compress(sys.stdin.buffer.read(),format=lzma.FORMAT_ALONE))",
    ],
    {
      input: options.frames ?? "0|256|192|0,16|260|190|5,-12345|0|0|42,",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (compressed.status !== 0)
    throw new Error("Synthetic replay compression failed");
  const judgements = Buffer.alloc(12);
  options.judgements?.forEach((count, index) => {
    judgements.writeUInt16LE(count, index * 2);
  });
  const combo = Buffer.alloc(2);
  combo.writeUInt16LE(options.maxCombo ?? 1);
  return Buffer.concat([
    Buffer.from([options.mode ?? 0]),
    int(options.version ?? 20260101),
    str(options.md5 ?? replayChecksum),
    str(options.player ?? "Synthetic Replay Player"),
    str("b".repeat(32)),
    judgements,
    int(options.score ?? 123456),
    combo,
    Buffer.from([Number(options.fullCombo ?? false)]),
    int(options.mods ?? 0),
    Buffer.from([0]),
    Buffer.alloc(8),
    int(compressed.stdout.length),
    compressed.stdout,
    Buffer.alloc(8),
    ...(options.mods && options.mods & (1 << 23) ? [Buffer.alloc(8)] : []),
  ]);
}
