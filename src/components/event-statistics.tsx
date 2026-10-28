"use client";
import { useState } from "react";
import Link from "./pending-link";
import { useAppTranslations } from "@/i18n/shared";
import type { PublicArchiveStatistics } from "@/lib/archive-statistics";
import { eventMappoolRows } from "@/lib/archive-mappool-statistics";
import type { EventScore } from "@/lib/event-statistics";
import {
  eventMapKey,
  eventPlacementRows,
  groupEventMaps,
} from "@/lib/event-statistics-model";
const views = [
  "Performance scores",
  "Mappool statistics",
  "Individual leaderboard",
  "Team leaderboard",
  "Team placements",
  "Solo placements",
];
export function EventStatistics({
  scores,
  coverage,
}: {
  scores: EventScore[];
  coverage?: PublicArchiveStatistics;
}) {
  const tr = useAppTranslations();
  const [view, setView] = useState(0),
    [round, setRound] = useState(""),
    [team, setTeam] = useState(""),
    [slot, setSlot] = useState(""),
    [query, setQuery] = useState("");
  const [sort, setSort] = useState("Average score"),
    [descending, setDescending] = useState(true);
  const eligible = scores.filter(
    (s) => (!round || s.round === round) && (!slot || eventMapKey(s) === slot),
  );
  const plays = eligible.filter((s) => !team || s.team === team);
  const coverageFixtures = coverage?.fixtures.filter(
    (f) => !round || f.stage === round,
  );
  const number = (v: number, d = 0) =>
    v.toLocaleString(tr.locale, { maximumFractionDigits: d });
  const avg = (s: EventScore[], key: "score" | "accuracy") => {
    const values = s.flatMap((p) => (p[key] === null ? [] : [p[key]!]));
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  };
  type Cell = string | number | null;
  type Row = Record<string, Cell>;
  let columns: string[] = [];
  let rows: Row[] = [];
  const keys = [
    ...new Set(
      plays.map((s) => (view === 3 || view === 4 ? s.team : s.player)),
    ),
  ];
  const poolFixtures = coverage?.poolFixtures;
  const maps = groupEventMaps(view >= 4 ? eligible : plays);
  const placementLabels = new Map<string, string>(
    maps.flatMap((map): [string, string][] => [
      [`${map.key}:rank`, `${map.label} #`],
      [`${map.key}:score`, `${map.label} ${tr("Score")}`],
    ]),
  );
  const poolLabels: Record<string, string> = {
    "Applicable matches": tr("Applicable matches"),
    "Unknown mappool matches": tr("Unknown mappool matches"),
    "Pick coverage": tr("Pick coverage"),
    "Ban coverage": tr("Ban coverage"),
  };
  if (view === 0) {
    columns = [
      "Player",
      "Team",
      "MC",
      "Played",
      "Participation rate",
      "MVPs",
      "Average score",
      "Average accuracy",
      "Highest score",
      "Grade",
      "Map",
      "Mods",
      "Match",
    ];
    rows = keys.map((name) => {
      const p = plays.filter((s) => s.player === name);
      const best = [...p].sort((a, b) => b.score - a.score)[0];
      return {
        Player: name,
        Team: best.team,
        MC: p[0].mc ?? null,
        Played: p.length,
        "Participation rate":
          p.length /
          new Set(
            eligible.filter((s) => s.team === best.team).map((s) => s.game),
          ).size,
        MVPs: p.filter(
          (s) =>
            !eligible.some(
              (other) => other.game === s.game && other.score > s.score,
            ),
        ).length,
        "Average score": avg(p, "score"),
        "Average accuracy": avg(p, "accuracy"),
        "Highest score": best.score,
        Grade: best.grade ?? null,
        Map: best.slot,
        Mods: best.mods,
        Match: best.mp,
      };
    });
  } else if (view === 1) {
    columns = [
      "Map",
      "Beatmap",
      "Map ID",
      "Best player",
      "Score",
      "Accuracy",
      "Mods",
      "Match",
      "Best team",
      "Team score",
      "Team match",
      "Average score",
      "Average accuracy",
      "Average team score",
      "Picks",
      "Pick rate",
      "Bans",
      "Ban rate",
      "Applicable matches",
      "Unknown mappool matches",
      "Pick coverage",
      "Ban coverage",
    ];
    rows = eventMappoolRows(scores, poolFixtures, round, team, slot).map(
      ({ map, plays: p, ...stats }) => {
        const best = [...p].sort((a, b) => b.score - a.score)[0];
        const teams = [...new Set(p.map((s) => s.game + ":" + s.team))]
          .map((g) => {
            const a = p.filter((s) => s.game + ":" + s.team === g);
            return {
              name: a[0].team,
              total: a.reduce((n, s) => n + s.score, 0),
              mp: a[0].mp,
            };
          })
          .sort((a, b) => b.total - a.total);
        return {
          Map: `${map.round} · ${map.slot}`,
          Beatmap: map.title,
          "Map ID": map.mapId,
          "Best player": best?.player ?? null,
          Score: best?.score ?? null,
          Accuracy: best?.accuracy ?? null,
          Mods: best?.mods ?? null,
          Match: best?.mp ?? null,
          "Best team": teams[0]?.name ?? null,
          "Team score": teams[0]?.total ?? null,
          "Team match": teams[0]?.mp ?? null,
          "Average score": avg(p, "score"),
          "Average accuracy": avg(p, "accuracy"),
          "Average team score": teams.length
            ? teams.reduce((n, s) => n + s.total, 0) / teams.length
            : null,
          Picks: stats.picks,
          "Pick rate": stats.pickRate,
          Bans: stats.bans,
          "Ban rate": stats.banRate,
          "Applicable matches": stats.applicable,
          "Unknown mappool matches": stats.unknown,
          "Pick coverage": stats.pickCoverage,
          "Ban coverage": stats.banCoverage,
        };
      },
    );
  } else if (view === 2 || view === 3) {
    columns =
      view === 2
        ? [
            "Map",
            "Beatmap",
            "Player",
            "Team",
            "Score",
            "Accuracy",
            "Combo",
            "Mods",
            "Match",
          ]
        : [
            "Map",
            "Team",
            "Player",
            "Score",
            "Accuracy",
            "Mods",
            "Team score",
            "Match",
          ];
    rows = plays.map((s) => ({
      Map: s.slot,
      Beatmap: s.title,
      Player: s.player,
      Team: s.team,
      Score: s.score,
      Accuracy: s.accuracy,
      Combo: s.combo,
      Mods: s.mods,
      Match: s.mp,
      "Team score": plays
        .filter((p) => p.game === s.game && p.team === s.team)
        .reduce((n, p) => n + p.score, 0),
    }));
  } else {
    columns = [
      view === 4 ? "Team" : "Player",
      "Average placement",
      "Average score",
      ...maps.flatMap((map) => [`${map.key}:rank`, `${map.key}:score`]),
    ];
    rows = eventPlacementRows(eligible, view === 4 ? "team" : "player", team);
  }
  rows = rows.filter((row) =>
    Object.values(row).some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  rows.sort((a, b) => {
    const x = a[sort],
      y = b[sort];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y))) * (descending ? -1 : 1)
    );
  });
  function cell(key: string, value: Cell) {
    if (value === null || value === undefined) return "—";
    if ((key === "Player" || key === "Best player") && coverage) {
      const players = coverage.players.filter((p) => p.username === value);
      if (players.length === 1)
        return (
          <Link
            href={`/tournaments/${coverage.slug}/players/${players[0].osuId}`}
          >
            {value}
          </Link>
        );
    }
    if ((key === "Match" || key === "Team match") && typeof value === "number")
      return (
        <a
          href={`https://osu.ppy.sh/community/matches/${value}`}
          target="_blank"
          rel="noreferrer"
        >
          {value} ↗
        </a>
      );
    if (key === "Map ID" && typeof value === "number")
      return <a href={`https://osu.ppy.sh/b/${value}`}>{value} ↗</a>;
    if (typeof value === "number")
      return /accuracy|rate/i.test(key)
        ? `${number(value * 100, 2)}%`
        : number(value, /MC|placement/.test(key) ? 3 : 0);
    return value;
  }
  return (
    <section className="event-statistics">
      <h1>{tr("Statistics")}</h1>
      {coverage && (
        <section className="stack" aria-label={tr("Statistics coverage")}>
          <div className="statistics-summary">
            <div>
              <strong>
                {coverageFixtures!.filter((f) => f.covered).length} /{" "}
                {coverageFixtures!.length}
              </strong>
              <span>{tr("Reviewed matches")}</span>
            </div>
            <div>
              <strong>{new Set(plays.map((p) => p.game)).size}</strong>
              <span>{tr("Scoring games")}</span>
            </div>
            <div>
              <strong>{new Set(plays.map((p) => p.player)).size}</strong>
              <span>{tr("Players with data")}</span>
            </div>
          </div>
          <p className="muted">
            {view === 1
              ? tr(
                  "Scores and picks use reviewed and published MP games. Bans use published schedule records. Missing data is not zero.",
                )
              : tr(
                  "Only reviewed and published MP games are counted. Missing data is not zero.",
                )}
          </p>
          <p className="muted">
            {tr("Known accuracy")}{" "}
            {plays.filter((p) => p.accuracy !== null).length} / {plays.length} ·{" "}
            {tr("Known combo")} {plays.filter((p) => p.combo !== null).length} /{" "}
            {plays.length}
          </p>
          <details>
            <summary>{tr("Match coverage")}</summary>
            <ul className="statistics-coverage">
              {coverageFixtures!.map((f) => (
                <li key={f.id}>
                  <Link href={`/tournaments/${coverage.slug}/matches/${f.id}`}>
                    {f.stage} · {f.label}
                  </Link>
                  <span>
                    {f.covered ? tr("Published") : tr("Not yet covered")}
                    {f.technicalAdjudication && (
                      <>
                        {" "}
                        · {tr(
                          "Technical adjudication; recorded series score",
                        )}{" "}
                        {f.score?.join(" : ")}.{" "}
                        {tr(
                          "Player statistics reflect recorded MP scores only.",
                        )}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      <div className="event-tabs">
        {views.map((label, i) => (
          <button
            key={label}
            aria-pressed={view === i}
            onClick={() => {
              setView(i);
              setSort(
                i === 1
                  ? "Map"
                  : i === 2
                    ? "Score"
                    : i === 3
                      ? "Team score"
                      : "Average score",
              );
            }}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      <div className="event-tools">
        {[
          {
            label: "Rounds",
            value: round,
            set: setRound,
            options: (
              coverage?.stages ?? [...new Set(scores.map((s) => s.round))]
            ).map((value) => ({
              value,
              label: value,
            })),
          },
          {
            label: "Team",
            value: team,
            set: setTeam,
            options: (
              coverage?.teams.map((t) => t.name) ?? [
                ...new Set(scores.map((s) => s.team)),
              ]
            ).map((value) => ({
              value,
              label: value,
            })),
          },
          {
            label: "Map",
            value: slot,
            set: setSlot,
            options: (view === 1
              ? eventMappoolRows(scores, poolFixtures).map(({ key, map }) => ({
                  key,
                  label: `${map.round} · ${map.slot} · ${map.mapId ?? map.title}`,
                }))
              : groupEventMaps(scores)
            ).map((map) => ({
              value: map.key,
              label: map.label,
            })),
          },
        ].map(({ label, value, set, options }) => (
          <label key={label}>
            {tr(label)}
            <select value={value} onChange={(e) => set(e.target.value)}>
              <option value="">{tr("All")}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {tr("Search")}
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <h2>{tr(views[view])}</h2>
      {view === 1 && coverage && (
        <p className="muted">
          {tr(
            "Rates require known mappools and complete coverage. Coverage shows recorded / applicable matches. Unknown mappool matches are listed separately.",
          )}
        </p>
      )}
      <div
        className="event-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={tr(views[view])}
      >
        <table className="event-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              {columns.map((c) => (
                <th
                  scope="col"
                  key={c}
                  aria-sort={
                    sort === c
                      ? descending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                >
                  <button
                    onClick={() => {
                      setSort(c);
                      setDescending(sort === c ? !descending : true);
                    }}
                  >
                    {placementLabels.get(c) ?? poolLabels[c] ?? tr(c)}{" "}
                    {sort === c ? (descending ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c}>{cell(c, r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
