import type { PublicPlayer } from "./read-api-contract";

/** Client-safe projection: callers supply only edition-public facts. */
export type DirectoryPlayer = {
  id: number;
  name: string;
  aliases?: string[];
  teams: { id: string; name: string }[];
  roles: string[];
  freeAgent?: boolean;
  rank: number | null;
  pp: number | null;
};

export function publicDirectoryPlayer(
  player: PublicPlayer,
  aliases = player.previousUsernames,
): DirectoryPlayer {
  return {
    id: player.osuId,
    name: player.username,
    aliases,
    teams: [
      ...new Map(
        [...(player.team ? [player.team] : []), ...player.coachedTeams].map(
          (team) => [team.id, team],
        ),
      ).values(),
    ],
    roles: [
      ...new Set([
        player.role,
        ...(player.participation !== "historical" &&
        player.participation !== "coach"
          ? ["player"]
          : []),
        ...(player.captain ? ["captain"] : []),
        ...(player.coachedTeams.length ? ["coach"] : []),
      ]),
    ],
    freeAgent: player.role === "free_agent",
    rank: player.statistics.globalRank,
    pp: player.statistics.pp,
  };
}

export const directorySorts = [
  "default",
  "name-asc",
  "name-desc",
  "rank-asc",
  "rank-desc",
  "pp-desc",
  "pp-asc",
] as const;
export const directoryKeys = [
  "q",
  "team",
  "role",
  "sort",
  "group",
  "rankMin",
  "rankMax",
  "ppMin",
  "ppMax",
] as const;
export type DirectoryState = Record<(typeof directoryKeys)[number], string>;

export function directoryState(
  params: Pick<URLSearchParams, "get">,
  grouped = false,
): DirectoryState {
  return Object.fromEntries(
    directoryKeys.map((key) => [
      key,
      params.get(key) ??
        (key === "sort"
          ? "default"
          : key === "group"
            ? grouped
              ? "team"
              : "list"
            : ""),
    ]),
  ) as DirectoryState;
}

export function directoryErrors(state: DirectoryState) {
  const errors: ("rank" | "pp" | "sort" | "filter")[] = [];
  for (const metric of ["rank", "pp"] as const) {
    const min = state[`${metric}Min`],
      max = state[`${metric}Max`];
    const valid = (value: string) =>
      value === "" ||
      (/^\d+(?:\.\d+)?$/.test(value) &&
        Number.isFinite(Number(value)) &&
        Number(value) >= (metric === "rank" ? 1 : 0) &&
        (metric === "pp" || Number.isSafeInteger(Number(value))));
    if (
      !valid(min) ||
      !valid(max) ||
      (min !== "" && max !== "" && Number(min) > Number(max))
    )
      errors.push(metric);
  }
  if (!directorySorts.includes(state.sort as (typeof directorySorts)[number]))
    errors.push("sort");
  if (!["list", "team"].includes(state.group)) errors.push("filter");
  return errors;
}

export function directoryOptions(players: DirectoryPlayer[]) {
  return {
    teams: [
      ...new Map(
        players.flatMap((p) => p.teams).map((t) => [t.id, t]),
      ).values(),
    ],
    roles: [...new Set(players.flatMap((p) => p.roles))],
    freeAgent: players.some((p) => p.freeAgent),
    rank: players.some((p) => validMetric(p.rank, "rank") !== null),
    pp: players.some((p) => validMetric(p.pp, "pp") !== null),
  };
}

function validMetric(value: number | null, key: "rank" | "pp") {
  return value !== null &&
    Number.isFinite(value) &&
    value >= (key === "rank" ? 1 : 0)
    ? value
    : null;
}

export function selectDirectoryPlayers<T extends DirectoryPlayer>(
  players: T[],
  state: DirectoryState,
): T[] {
  if (directoryErrors(state).length) return [];
  // Merge repeated public facts defensively; UID remains the sole identity.
  const unique = new Map<number, T>();
  for (const p of players) {
    const previous = unique.get(p.id);
    unique.set(
      p.id,
      previous
        ? {
            ...previous,
            aliases: [
              ...new Set([
                ...(previous.aliases ?? []),
                p.name,
                ...(p.aliases ?? []),
              ]),
            ],
            teams: [
              ...new Map(
                [...previous.teams, ...p.teams].map((t) => [t.id, t]),
              ).values(),
            ],
            roles: [...new Set([...previous.roles, ...p.roles])],
            freeAgent: previous.freeAgent || p.freeAgent,
          }
        : p,
    );
  }
  const q = state.q.trim().toLowerCase();
  const rows = [...unique.values()].filter((p) => {
    if (
      ![p.name, p.id, ...(p.aliases ?? []), ...p.teams.map((t) => t.name)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (
      state.team &&
      (state.team === "free_agent"
        ? !p.freeAgent
        : !p.teams.some((t) => t.id === state.team))
    )
      return false;
    if (state.role && !p.roles.includes(state.role)) return false;
    for (const key of ["rank", "pp"] as const) {
      const value = validMetric(p[key], key),
        min = state[`${key}Min`],
        max = state[`${key}Max`];
      if (
        (min !== "" || max !== "") &&
        (value === null ||
          (min !== "" && value < Number(min)) ||
          (max !== "" && value > Number(max)))
      )
        return false;
    }
    return true;
  });
  if (state.sort !== "default")
    rows.sort((a, b) => {
      const [key, direction] = state.sort.split("-");
      if (key === "name")
        return (
          a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en") *
            (direction === "asc" ? 1 : -1) || a.id - b.id
        );
      const x = validMetric(a[key as "rank" | "pp"], key as "rank" | "pp");
      const y = validMetric(b[key as "rank" | "pp"], key as "rank" | "pp");
      if (x === null || y === null)
        return x === y ? a.id - b.id : x === null ? 1 : -1;
      return (x - y) * (direction === "asc" ? 1 : -1) || a.id - b.id;
    });
  if (state.group === "team") {
    const groups = [...new Set(players.map((p) => p.teams[0]?.id ?? ""))];
    // Stable sort keeps the requested order inside each original team group.
    rows.sort(
      (a, b) =>
        groups.indexOf(a.teams[0]?.id ?? "") -
        groups.indexOf(b.teams[0]?.id ?? ""),
    );
  }
  return rows;
}
