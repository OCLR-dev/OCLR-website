import type { HistoricalArchive } from "./historical-archive";

/** Only explicit final standings qualify; group labels are never parsed. */
export function archiveTeamPlacement(
  archive: HistoricalArchive,
  teamId: string | null,
) {
  if (!teamId) return null;
  const final = archive.finalPlacements?.find((r) => r.teamId === teamId);
  const standing = archive.standings.find(
    (r) => r.teamId === teamId && r.scope === "final",
  );
  const placement =
    final?.placement ??
    standing?.placement ??
    (standing?.rank != null
      ? { start: standing.rank, end: standing.rank }
      : null);
  const row = final ?? standing;
  return placement
    ? {
        ...placement,
        official: row?.official ?? false,
        tied: row?.tied ?? false,
      }
    : null;
}
