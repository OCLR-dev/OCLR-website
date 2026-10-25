/** Use the stored season value only; titles/slugs never supply a season number. */
export function compareTournamentSeasons(
  a: { season: string | null; slug: string },
  b: { season: string | null; slug: string },
) {
  const numeric = (season: string | null) =>
    season && /^\d+$/.test(season) ? BigInt(season) : null;
  const left = numeric(a.season),
    right = numeric(b.season);
  if (left !== right) {
    if (left === null) return 1;
    if (right === null) return -1;
    return left > right ? -1 : 1;
  }
  return a.slug.localeCompare(b.slug, "en");
}
