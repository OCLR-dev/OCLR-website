import type { HistoricalArchive } from "./historical-archive";

/** Source-bound presentation; editable edition slugs do not identify a season. */
export function isS1Archive(archive: Pick<HistoricalArchive, "sourceUrl">) {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/10OvY6V2_nJpmv3LekQJZw6Eo5Hy1V-ggSoOQIxIdm6I(?:\/edit)?$/.test(
    archive.sourceUrl,
  );
}

export function hasS1FinalStandings(archive: HistoricalArchive) {
  return (
    isS1Archive(archive) &&
    archive.standings.length > 0 &&
    archive.standings.every((row) => row.group === "最終排名（全賽事戰績）")
  );
}
