import type { HistoricalArchive } from "./historical-archive";

/** Source-bound presentation; editable edition slugs do not identify a season. */
export function isS1Archive(archive: Pick<HistoricalArchive, "sourceUrl">) {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/10OvY6V2_nJpmv3LekQJZw6Eo5Hy1V-ggSoOQIxIdm6I(?:\/edit)?$/.test(
    archive.sourceUrl,
  );
}

export function s1TierFourSourcePair(archive: HistoricalArchive) {
  if (
    archive.editionSlug !== "s1" ||
    archive.formatVersion !== 2 ||
    archive.draftMode !== "final-tiers" ||
    !isS1Archive(archive)
  )
    return undefined;
  return archive.rosterReplacements?.find(
    (row) =>
      row.id === "f-tier4-source-pair" &&
      row.teamId === "f" &&
      row.tier === 4 &&
      row.replacedAt === null &&
      row.source === "Teams!J26" &&
      row.people.length === 2 &&
      row.people.some(
        (person) => person.osuId === 4879360 && person.username === "qquonb",
      ) &&
      row.people.some(
        (person) => person.osuId === 10250326 && person.username === "shynzlx",
      ),
  );
}

export function hasS1FinalStandings(archive: HistoricalArchive) {
  return (
    isS1Archive(archive) &&
    archive.standings.length > 0 &&
    archive.standings.every((row) => row.group === "最終排名（全賽事戰績）")
  );
}
