import { isDeepStrictEqual } from "node:util";
import { HttpError } from "./http-error";
import { matchSourceSchema, type MatchSource } from "./match-model";

/** Validate persisted evidence before reusing it in a result command. */
export function checkedStoredMatchSource(
  value: unknown,
  fingerprint?: string,
): MatchSource {
  const parsed = matchSourceSchema.safeParse(value);
  if (
    !parsed.success ||
    (fingerprint && parsed.data.fingerprint !== fingerprint)
  )
    throw new HttpError(
      409,
      "This stored source is incomplete or unsupported. Import a fresh snapshot before reviewing.",
    );
  return parsed.data;
}

export function compareMatchSources(before: MatchSource, after: MatchSource) {
  const oldGames = new Map(before.games.map((g) => [g.id, g]));
  const newGames = new Map(after.games.map((g) => [g.id, g]));
  return {
    added: after.games.filter((g) => !oldGames.has(g.id)).map((g) => g.id),
    removed: before.games.filter((g) => !newGames.has(g.id)).map((g) => g.id),
    changed: after.games
      .filter(
        (g) => oldGames.has(g.id) && !isDeepStrictEqual(oldGames.get(g.id), g),
      )
      .map((g) => g.id),
    historyChanged: before.fingerprint !== after.fingerprint,
  };
}
