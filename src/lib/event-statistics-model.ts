import type { EventScore } from "./event-statistics";

// A slot is only meaningful within its round and beatmap identity. Preview
// maps without numeric IDs retain their literal title as the identity fallback.
export type EventMapIdentity = Pick<
  EventScore,
  "round" | "slot" | "mapId" | "title"
>;
export function eventMapKey(score: EventMapIdentity) {
  return JSON.stringify([score.round, score.slot, score.mapId ?? score.title]);
}

export function groupEventMaps(scores: EventScore[]) {
  const maps = new Map<
    string,
    { key: string; label: string; plays: EventScore[] }
  >();
  for (const score of scores) {
    const key = eventMapKey(score);
    const map = maps.get(key);
    if (map) map.plays.push(score);
    else
      maps.set(key, {
        key,
        label: `${score.round} · ${score.slot} · ${score.mapId ?? score.title}`,
        plays: [score],
      });
  }
  return [...maps.values()];
}

// Scores already reflect the selected round/map scope. Team selection only
// controls visible rows; every participant in that scope remains a competitor.
export function eventPlacementRows(
  scores: EventScore[],
  by: "team" | "player",
  team = "",
) {
  const keys = [...new Set(scores.map((score) => score[by]))];
  const maps = groupEventMaps(scores);
  const visible = new Set(
    scores
      .filter((score) => !team || score.team === team)
      .map((score) => score[by]),
  );
  return keys
    .map((name) => {
      const plays = scores.filter((score) => score[by] === name);
      const row: Record<string, string | number | null> = {
        [by === "team" ? "Team" : "Player"]: name,
        "Average placement": null,
        "Average score":
          plays.reduce((total, score) => total + score.score, 0) /
          (by === "team"
            ? new Set(plays.map((score) => score.game)).size
            : plays.length),
      };
      const ranks: number[] = [];
      for (const map of maps) {
        const values = keys
          .map((key) => {
            const matching = map.plays.filter((score) => score[by] === key);
            if (!matching.length) return { name: key, value: null };
            const games = [...new Set(matching.map((score) => score.game))];
            return {
              name: key,
              value:
                by === "team"
                  ? Math.max(
                      ...games.map((game) =>
                        matching
                          .filter((score) => score.game === game)
                          .reduce((total, score) => total + score.score, 0),
                      ),
                    )
                  : Math.max(...matching.map((score) => score.score)),
            };
          })
          .filter((value) => value.value !== null)
          .sort((a, b) => b.value! - a.value!);
        const index = values.findIndex((value) => value.name === name);
        row[`${map.key}:rank`] = index < 0 ? null : index + 1;
        row[`${map.key}:score`] = index < 0 ? null : values[index].value;
        if (index >= 0) ranks.push(index + 1);
      }
      row["Average placement"] = ranks.length
        ? ranks.reduce((total, rank) => total + rank, 0) / ranks.length
        : null;
      return row;
    })
    .filter((row) =>
      visible.has(row[by === "team" ? "Team" : "Player"] as string),
    );
}
