import { categories, parseBeatmapId } from "./mappool-model";
export const candidateCategories = ["unassigned", ...categories] as const;
export type CandidateCategory = (typeof candidateCategories)[number];
export const candidateBatchLimit = 50;
export const candidateLimit = 500;
export const commentLimit = 200;
export const commentLength = 2000;
export function parseCandidateRows(
  text: string,
  existing: readonly number[] = [],
) {
  const lines = text
    .split(/\r?\n/)
    .map((input, index) => ({ input: input.trim(), line: index + 1 }))
    .filter((r) => r.input);
  if (
    !lines.length ||
    lines.length > candidateBatchLimit ||
    text.length > 16000
  )
    throw new Error("Enter between 1 and 50 map rows.");
  const seen = new Set(existing);
  return lines.map((row) => {
    const beatmapId = parseBeatmapId(row.input);
    const status: "invalid" | "duplicate" | "ready" = !beatmapId
      ? "invalid"
      : seen.has(beatmapId)
        ? "duplicate"
        : "ready";
    if (beatmapId) seen.add(beatmapId);
    return { ...row, beatmapId, status };
  });
}
