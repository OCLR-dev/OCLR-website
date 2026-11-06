/** Official cover paths use beatmapSET IDs, never difficulty IDs. */
export function beatmapCoverUrl(setId: number | null | undefined) {
  return Number.isSafeInteger(setId) && setId! > 0
    ? `https://assets.ppy.sh/beatmaps/${setId}/covers/cover.jpg`
    : null;
}

/** A reviewed background alternative affects artwork only, never map identity. */
export function beatmapCoverSources({
  setId,
  coverPath,
  backgroundSetId,
  fallbackSetId,
}: {
  setId: number | null | undefined;
  coverPath?: string;
  backgroundSetId?: number | null;
  fallbackSetId?: number | null;
}) {
  return [
    ...new Set(
      [
        coverPath,
        beatmapCoverUrl(backgroundSetId),
        beatmapCoverUrl(setId),
        beatmapCoverUrl(fallbackSetId),
      ].filter((value): value is string => typeof value === "string"),
    ),
  ];
}
