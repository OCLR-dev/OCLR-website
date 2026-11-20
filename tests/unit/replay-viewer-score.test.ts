import { analyzeReplay, parseBeatmap, parseReplay } from "replayviewer-js";
import { expect, it } from "vitest";
import { syntheticReplay } from "../fixtures/replay";

const circleMap = `osu file format v14

[General]
Mode:0

[Difficulty]
CircleSize:4
OverallDifficulty:6

[TimingPoints]
0,500,4,2,1,80,1,0

[HitObjects]
256,192,1000,1,0,0:0:0:0:
`;

it.each([
  { mods: 0, usesScoreV2: false, score: 300 },
  { mods: 1 << 29, usesScoreV2: true, score: 1_000_000 },
])(
  "uses the packaged viewer's scoring timeline for mod bitmask $mods",
  async ({ mods, usesScoreV2, score }) => {
    const bytes = syntheticReplay({
      mods,
      frames: "0|256|192|0,1000|256|192|5,30|256|192|0,-12345|0|0|42,",
    });
    const replay = await parseReplay(Uint8Array.from(bytes).buffer);
    const result = analyzeReplay(parseBeatmap(circleMap), replay);

    expect(result.modDiff.isScoreV2).toBe(usesScoreV2);
    expect(result.scoreFrames.at(-1)?.score).toBe(score);
  },
);
