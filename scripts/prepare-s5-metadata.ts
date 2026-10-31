/** Offline review material only. No database, credentials or publication. */
import { readFileSync, writeFileSync } from "node:fs";
const read = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../docs/imports/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const approved = read("s5-approved-standings");
const archive = read("s5-reviewed-import");
const raw = read("s5-match-source-snapshot");
const standings = approved.standings.map(
  (row: { rank: number | null; teamId: string; source: string }) => ({
    ...row,
    scope: "final",
    placement:
      row.rank === null
        ? { start: 9, end: 12 }
        : {
            start: row.rank,
            end: row.rank === 5 || row.rank === 7 ? row.rank + 1 : row.rank,
          },
    tied: row.rank === 5 || row.rank === 7,
    qualified: row.rank !== null,
    // Accepted reconstruction; do not relabel it as an original official table.
    official: false,
  }),
);
const known = new Map<number, string>(
  archive.players.map((p: { osuId: number; teamId: string }) => [
    p.osuId,
    p.teamId,
  ]),
);
const matches = archive.matches.map(
  (fixture: { id: string; teamA: string; teamB: string; mpUrls: string[] }) => {
    const mp = raw.matches.find((m: { url: string }) =>
      fixture.mpUrls.includes(m.url),
    );
    if (!mp?.complete) throw Error(`Missing complete MP: ${fixture.id}`);
    return {
      fixtureId: fixture.id,
      mpId: mp.id,
      games: mp.games.map(
        (game: {
          id: number;
          beatmapId: number;
          endTime: string | null;
          scores: { osuId: number }[];
        }) => ({
          gameId: game.id,
          beatmapId: game.beatmapId,
          completed: game.endTime !== null,
          candidatePoolIds: archive.pools
            .filter((p: { maps: { beatmapId: number }[] }) =>
              p.maps.some((m) => m.beatmapId === game.beatmapId),
            )
            .map((p: { id: string }) => p.id),
          // Unknown IDs may be unresolved participants. They are never auto-excluded.
          unresolvedOrOutsideRosterIds: [
            ...new Set(
              game.scores
                .filter(
                  (p) =>
                    ![fixture.teamA, fixture.teamB].includes(
                      known.get(p.osuId) ?? "",
                    ),
                )
                .map((p) => p.osuId),
            ),
          ],
          reviewStatus: "pending",
        }),
      ),
    };
  },
);
const output = {
  kind: "historical-metadata-review-not-importable",
  editionSlug: "s5",
  basis:
    "s5-approved-standings.json; publication revision 9; accepted reconstruction",
  standings,
  finalPlacements: standings.map(
    ({
      teamId,
      placement,
      tied,
      qualified,
      official,
      source,
    }: (typeof standings)[number]) => ({
      teamId,
      placement,
      tied,
      qualified,
      official,
      source,
    }),
  ),
  matches,
  pending: [
    "Confirm current saved archive revision before applying a metadata patch.",
    "Review game selections, replay/warmup exclusions and every unresolved or outside-roster UID.",
    "Fetch full normalized MP records through the existing statistics importer; this old snapshot lacks accuracy/combo/hit counts.",
    "Approve and publish statistics through the edition Admin workflow.",
    "Confirm official season dates and schedule time zone; capturedOn and MP room-open times are not schedule dates.",
  ],
};
writeFileSync(
  new URL("../docs/imports/s5-metadata-review.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  `${matches.length} matches; ${matches.reduce((n: number, m: { games: unknown[] }) => n + m.games.length, 0)} games prepared for review.`,
);
