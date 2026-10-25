import s10Evidence from "@/content/s10-match-pools.json" with { type: "json" };
import type { HistoricalArchive } from "./historical-archive";

// Source-specific aliases: group letters identify teams, not separate pools.
const sourceStages: Record<string, Record<string, string>> = {
  "1vZ7JN6ePxDqjdVZ1527fvyeoV1m5rbHzSvXObDUuf7I": {
    "Group A": "gs",
    "Group B": "gs",
    淘汰赛: "sf",
  },
  "16ASDCD95p3TgfjgSHCjXmRN3KJuuAD4KS0fImpcTiiM": {
    "Group A": "gs",
    "Group B": "gs",
    "Group C": "gs",
    "Group D": "gs",
    SemiFinals: "sf",
    Finals: "f",
    GF: "gf",
  },
  "11PwNlEsUFb6f3VCY2-sdGlPysP0ukihN8_lE4DGuzfA": {
    "Group A": "gs",
    "Group B": "gs",
    SF: "sf",
    Finals: "f",
    GF: "gf",
  },
  "12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw": {
    SF: "sf",
    Finals: "f",
    GF: "gf",
  },
};
/** Never infer a pool from a slug, date, team group or another edition. */
export function archiveMatchPool(
  archive: HistoricalArchive,
  match: HistoricalArchive["matches"][number],
) {
  const url = new URL(archive.sourceUrl);
  const sheet =
    url.hostname === "docs.google.com"
      ? /^\/spreadsheets\/d\/([^/]+)\/edit$/.exec(url.pathname)?.[1]
      : undefined;
  if (match.poolId === null) return null;
  const verified =
    sheet === "12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw"
      ? s10Evidence.matches.find(
          (evidence) =>
            evidence.matchId === match.id &&
            match.mpUrls.includes(evidence.mpUrl),
        )?.poolId
      : undefined;
  const id =
    match.poolId ??
    verified ??
    (sheet ? sourceStages[sheet]?.[match.stage] : undefined);
  return archive.pools.find((pool) => pool.id === id) ?? null;
}
