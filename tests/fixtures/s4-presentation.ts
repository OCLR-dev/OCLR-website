import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { syntheticS1Archive } from "./s1-presentation";

/** S4 source labels with synthetic identities/results; no saved-data writes. */
export function syntheticS4Archive(slug = "synthetic-s4") {
  const base = syntheticS1Archive(slug);
  const groupTemplate = base.matches[0];
  const draws = new Set([5, 10, 11, 17, 20]);
  return historicalArchiveSchema.parse({
    ...base,
    sourceUrl:
      "https://docs.google.com/spreadsheets/d/1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk",
    standings: [],
    sourceFacts: [],
    matches: [
      ...Array.from({ length: 24 }, (_, index) => {
        const n = index + 1;
        const pair = index % 6;
        return {
          ...groupTemplate,
          id: `a${n}`,
          label: `A${n}`,
          stage: `小组赛第${Math.floor(index / 6) + 1}轮`,
          teamA: base.teams[pair * 2].id,
          teamB: base.teams[pair * 2 + 1].id,
          scheduledAt: `2026-01-${String(index + 1).padStart(2, "0")}T20:00:00+08:00`,
          score: n === 22 ? null : draws.has(n) ? [5, 5] : [6, 1],
          ...(n === 22 ? { forfeitWinner: 1 } : {}),
          source: "Synthetic S4 round",
        };
      }),
      ...base.matches
        .filter((m) => m.id.startsWith("es-"))
        .map((match, i) => ({
          ...match,
          id: `k${i + 1}`,
          label: `K${i + 1}`,
          stage: `Synthetic knockout round ${i + 1}`,
        })),
    ],
  });
}
