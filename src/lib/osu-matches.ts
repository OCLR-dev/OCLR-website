import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { osuApi } from "./osu-api";
import { HttpError } from "./http";
import {
  matchSourceSchema,
  OPEN_MATCH_WARNING,
  type MatchGame,
  type MatchScore,
  type MatchSource,
} from "./match-model";
export function parseMatchId(input: string) {
  let value = input.trim();
  if (!/^[1-9]\d*$/.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new HttpError(
        400,
        "Enter an osu! match ID or canonical multiplayer match link.",
      );
    }
    if (
      url.origin !== "https://osu.ppy.sh" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new HttpError(400, "Use an official osu! multiplayer match link.");
    const match = /^\/community\/matches\/([1-9]\d*)\/?$/.exec(url.pathname);
    if (!match)
      throw new HttpError(
        400,
        "Link to an osu! community match, not another page.",
      );
    value = match[1];
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new HttpError(400, "Invalid osu! match ID.");
  return id;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown, minimum = 0): number | null {
  const n =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= minimum
    ? n
    : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}
function timestamp(value: unknown): string | null {
  return z.iso.datetime({ offset: true }).safeParse(value).success
    ? (value as string)
    : null;
}
function mods(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  if (
    value.some((m) => {
      const settings = object(m).settings;
      return (
        settings !== undefined &&
        settings !== null &&
        (typeof settings !== "object" || Object.keys(settings).length > 0)
      );
    })
  )
    return null; // Never erase nonstandard mod settings and then claim compliance.
  const list = value.map((m) =>
    typeof m === "string" ? m : object(m).acronym,
  );
  return list.every((m) => typeof m === "string" && /^[A-Z0-9]{1,16}$/.test(m))
    ? [...new Set(list as string[])].sort()
    : null;
}
function normalizeScore(value: unknown): MatchScore {
  const s = object(value);
  const match = object(s.match);
  const problems: string[] = [];
  const osuId = number(s.user_id, 1);
  if (!osuId) problems.push("Player osu! ID is missing or invalid.");
  const rawTotals = [s.score, s.legacy_total_score, s.total_score].filter(
    (v) => v !== undefined && v !== null,
  );
  const totals = rawTotals.map((v) => number(v));
  const hasRecordedScore =
    number(s.score) !== null || number(s.legacy_total_score) !== null;
  const total =
    hasRecordedScore &&
    totals.length &&
    totals.every((v) => v !== null && v === totals[0])
      ? totals[0]
      : null;
  if (total === null)
    problems.push("Score values are missing, unsupported or conflicting.");
  const team =
    match.team === "blue" || match.team === 1 || match.team === "1"
      ? "blue"
      : match.team === "red" || match.team === 2 || match.team === "2"
        ? "red"
        : match.team === "none" || match.team === 0 || match.team === "0"
          ? "none"
          : null;
  const passed =
    typeof match.pass === "boolean"
      ? match.pass
      : typeof s.passed === "boolean"
        ? s.passed
        : null;
  if (
    typeof match.pass === "boolean" &&
    typeof s.passed === "boolean" &&
    match.pass !== s.passed
  )
    problems.push("Provider pass flags conflict.");
  if (passed === null) problems.push("Player pass/fail state is unavailable.");
  const playerMods = mods(s.mods);
  if (!playerMods) problems.push("Player mod data is unavailable.");
  const providerFields: MatchScore["providerFields"] = {};
  const statistics = object(s.statistics);
  const hitCount = (legacy: string, modern: string) => {
    const old = number(statistics[legacy]);
    const current = number(statistics[modern]);
    return old !== null && current !== null && old !== current
      ? null
      : (old ?? current);
  };
  for (const key of [
    "type",
    "score",
    "legacy_total_score",
    "total_score",
    "accuracy",
    "max_combo",
    "passed",
  ]) {
    const v = s[key];
    if (
      v === null ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)) ||
      (typeof v === "string" && v.length <= 100)
    )
      providerFields[key] = v;
  }
  return {
    osuId,
    total,
    team,
    slot: number(match.slot),
    passed,
    mods: playerMods ?? [],
    accuracy:
      typeof s.accuracy === "number" && s.accuracy >= 0 && s.accuracy <= 1
        ? s.accuracy
        : null,
    combo: number(s.max_combo),
    hitCounts: {
      great: hitCount("count_300", "great"),
      ok: hitCount("count_100", "ok"),
      meh: hitCount("count_50", "meh"),
      miss: hitCount("count_miss", "miss"),
    },
    providerFields,
    problems,
  };
}
function normalizeGame(value: unknown): MatchGame | null {
  const g = object(value);
  const id = number(g.id, 1);
  if (!id) return null;
  const problems: string[] = [];
  const startTime = timestamp(g.start_time);
  const endTime = timestamp(g.end_time);
  if (!startTime || (g.end_time !== null && !endTime))
    problems.push("Game timing is missing or invalid.");
  if (startTime && endTime && Date.parse(endTime) < Date.parse(startTime))
    problems.push("Game ends before its recorded start.");
  const beatmapId = number(g.beatmap_id, 1);
  if (!beatmapId) problems.push("Beatmap ID is unavailable.");
  const gameMods = mods(g.mods);
  if (!gameMods) problems.push("Game mod data is unavailable.");
  const scores =
    Array.isArray(g.scores) && g.scores.length <= 64
      ? g.scores
          .map(normalizeScore)
          .sort(
            (a, b) =>
              (a.slot ?? 999) - (b.slot ?? 999) ||
              (a.osuId ?? 0) - (b.osuId ?? 0),
          )
      : [];
  if (!Array.isArray(g.scores) || g.scores.length > 64)
    problems.push("Game score records are missing or unsupported.");
  const b = object(g.beatmap);
  const set = object(b.beatmapset);
  if (number(b.id, 1) !== null && number(b.id, 1) !== beatmapId)
    problems.push("Beatmap metadata identifies another beatmap.");
  return {
    id,
    beatmapId,
    startTime,
    endTime,
    mode: text(g.mode, 30),
    teamType: text(g.team_type, 40),
    scoringType: text(g.scoring_type, 40),
    mods: gameMods ?? [],
    scores,
    problems,
    beatmap: Object.keys(b).length
      ? {
          setId: number(b.beatmapset_id, 1) ?? number(set.id, 1),
          title: text(set.title, 500),
          artist: text(set.artist, 500),
          difficulty: text(b.version, 500),
        }
      : null,
  };
}
const pageSchema = z.object({
  match: z.object({
    id: z.number().int().positive(),
    name: z.string().max(500),
    start_time: z.iso.datetime({ offset: true }).nullable(),
    end_time: z.iso.datetime({ offset: true }).nullable(),
  }),
  first_event_id: z.number().int().nonnegative(),
  latest_event_id: z.number().int().nonnegative(),
  current_game_id: z.number().int().positive().nullable(),
  events: z.array(z.unknown()).max(101),
});
export async function fetchMatchSource(matchId: number): Promise<MatchSource> {
  if (!Number.isSafeInteger(matchId) || matchId <= 0)
    throw new HttpError(400, "Invalid match ID.");
  const events = new Map<number, MatchSource["events"][number]>();
  const games = new Map<number, MatchGame>();
  const warnings = new Set<string>();
  let first: z.infer<typeof pageSchema> | undefined;
  let cursor = 0;
  let pages = 0;
  let complete = true;
  let reachedEnd = false;
  let bytes = 0;
  const deadline = performance.now() + 120_000;
  const checkBudget = () => {
    if (performance.now() > deadline)
      throw new HttpError(
        503,
        "Match history exceeded the import time budget. No stored result was changed; retry when the provider is responsive.",
      );
  };
  for (; pages < 100;) {
    checkBudget();
    const raw = await osuApi(`/matches/${matchId}?after=${cursor}&limit=100`);
    checkBudget();
    pages++;
    bytes += Buffer.byteLength(JSON.stringify(raw));
    if (bytes > 8 * 1024 * 1024)
      throw new HttpError(
        413,
        "Match history exceeds the safe import size. No saved result was changed.",
      );
    const parsed = pageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.match.id !== matchId)
      throw new HttpError(
        502,
        "osu! returned incomplete or mismatched match history.",
      );
    const page = parsed.data;
    if (
      page.first_event_id > page.latest_event_id ||
      Boolean(page.first_event_id) !== Boolean(page.latest_event_id)
    )
      throw new HttpError(
        502,
        "osu! returned inconsistent match event bounds.",
      );
    if (!first) first = page;
    else if (
      page.first_event_id !== first.first_event_id ||
      page.latest_event_id !== first.latest_event_id ||
      page.current_game_id !== first.current_game_id ||
      !isDeepStrictEqual(page.match, first.match)
    ) {
      complete = false;
      warnings.add(
        "Match history changed during retrieval. Refresh before submitting a result.",
      );
    }
    let next = cursor;
    for (const value of page.events) {
      const e = object(value);
      const id = number(e.id, 1);
      if (!id) {
        complete = false;
        warnings.add("An event has no valid source ID.");
        continue;
      }
      if (id < page.first_event_id || id > page.latest_event_id) {
        complete = false;
        warnings.add(
          "An event falls outside the provider's reported history range.",
        );
      }
      const g =
        e.game === null || e.game === undefined ? null : normalizeGame(e.game);
      if (e.game !== undefined && e.game !== null && !g) {
        complete = false;
        warnings.add("A game event could not be normalized.");
      }
      if (g) {
        const previous = games.get(g.id);
        if (previous && !isDeepStrictEqual(previous, g)) {
          complete = false;
          warnings.add(
            "A game changed between event pages. Refresh the source.",
          );
        }
        games.set(g.id, g);
      }
      const event = {
        id,
        at: timestamp(e.timestamp),
        type: text(object(e.detail).type, 80) ?? "unknown",
        actorOsuId: number(e.user_id, 1),
        gameId: g?.id ?? null,
      };
      if (events.has(id)) {
        if (!isDeepStrictEqual(events.get(id), event)) {
          complete = false;
          warnings.add("Conflicting duplicate events were returned by osu!.");
        }
      } else events.set(id, event);
      next = Math.max(next, id);
    }
    if (events.size > 10000 || games.size > 3000)
      throw new HttpError(
        413,
        "Match history exceeds the event/game import limit. No saved result was changed.",
      );
    if (first.latest_event_id === 0 && !events.size) {
      reachedEnd = true;
      break;
    }
    if (next >= first.latest_event_id) {
      reachedEnd = true;
      break;
    }
    if (next <= cursor || !page.events.length) {
      complete = false;
      warnings.add("Match pagination stopped before the last reported event.");
      break;
    }
    cursor = next;
  }
  if (!first) throw new HttpError(502, "No match history was returned.");
  const orderedEvents = [...events.values()].sort((a, b) => a.id - b.id);
  if (
    !reachedEnd ||
    (first.first_event_id > 0 && orderedEvents[0]?.id !== first.first_event_id)
  ) {
    complete = false;
    warnings.add(
      "The complete event range is unavailable. A final result cannot be submitted.",
    );
  }
  if (first.current_game_id && !games.has(first.current_game_id)) {
    complete = false;
    warnings.add("The current game is missing from the retrieved history.");
  }
  if (!first.match.end_time || first.current_game_id)
    warnings.add(OPEN_MATCH_WARNING);
  const facts = {
    schemaVersion: 1 as const,
    apiVersion: "20220705" as const,
    match: {
      id: matchId,
      title: first.match.name,
      startTime: first.match.start_time,
      endTime: first.match.end_time,
    },
    firstEventId: first.first_event_id,
    latestEventId: first.latest_event_id,
    currentGameId: first.current_game_id,
    complete,
    events: orderedEvents,
    games: [...games.values()].sort(
      (a, b) =>
        (a.startTime ? Date.parse(a.startTime) : 0) -
          (b.startTime ? Date.parse(b.startTime) : 0) || a.id - b.id,
    ),
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(facts))
    .digest("hex");
  return matchSourceSchema.parse({
    ...facts,
    fingerprint,
    fetchedAt: new Date().toISOString(),
    pages,
    warnings: [...warnings],
  });
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
