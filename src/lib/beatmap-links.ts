/** Difficulty and set IDs have different destinations. Never infer one from the other. */
export function beatmapLinks(
  beatmapId: number | null | undefined,
  setId: number | null | undefined,
) {
  const valid = (id: number | null | undefined): id is number =>
    Number.isSafeInteger(id) && id! > 0;
  return {
    web: valid(beatmapId)
      ? `https://osu.ppy.sh/beatmaps/${beatmapId}`
      : valid(setId)
        ? `https://osu.ppy.sh/beatmapsets/${setId}`
        : null,
    // Match osu-web's official difficulty/set deep-link helpers.
    direct: valid(beatmapId)
      ? `osu://b/${beatmapId}`
      : valid(setId)
        ? `osu://s/${setId}`
        : null,
  };
}
