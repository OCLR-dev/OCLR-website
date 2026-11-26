import { z } from "zod";
import {
  practiceEditions,
  practiceSnapshotSchema,
  releaseSchema,
} from "../src/lib/player-practice-data";
import { fetchPublicJson, readPublicSnapshot } from "./beatmap-similarity-data";

export async function readPracticeSnapshot(osuDir?: string) {
  const [pools, ...releases] = await Promise.all([
    readPublicSnapshot([...practiceEditions], osuDir),
    ...practiceEditions.map(async (slug) => {
      const response = await fetchPublicJson(
        "/api/v1/tournaments/" + slug + "/statistics",
      );
      return z.object({ data: releaseSchema }).parse(response).data;
    }),
  ]);
  return practiceSnapshotSchema.parse({
    version: 1,
    capturedAt: new Date().toISOString(),
    pools,
    releases,
  });
}
