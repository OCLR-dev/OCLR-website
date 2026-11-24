"use client";
import { selectFragment, useUrlFragment } from "./url-fragment";
import { StatisticsNotice } from "./statistics-notice";
import { useMemo, useState } from "react";
import {
  rateSeasonSeries,
  seasonSeriesOptions,
  visibleSeriesPlayers,
  type SeasonSeries,
} from "@/lib/season-series-model";
import Link from "./pending-link";
import { useAppTranslations } from "@/i18n/shared";
import type { PublicArchiveStatistics } from "@/lib/archive-statistics-reads";
import { eventMappoolRows } from "@/lib/archive-mappool-statistics";
import type { EventScore } from "@/lib/event-statistics";
import {
  eventGameKey,
  eventTeamGames,
  eventMapKey,
  eventPlacementRows,
  groupEventMaps,
} from "@/lib/event-statistics-model";
const views = [
  { id: "performance", label: "Performance scores", sort: "Average score" },
  { id: "mappools", label: "Mappool statistics", sort: "Map" },
  {
    id: "individual-leaderboard",
    label: "Individual leaderboard",
    sort: "Score",
  },
  { id: "team-leaderboard", label: "Team leaderboard", sort: "Team score" },
  { id: "team-placements", label: "Team placements", sort: "Average score" },
  { id: "solo-placements", label: "Solo placements", sort: "Average score" },
  { id: "yumu-rating-series", label: "YumuRating Series", sort: "MRA" },
];
const SERIES_VIEW = views.length - 1;
export function EventStatistics({
  scores,
  coverage,
  series = null,
  edition,
}: {
  scores: EventScore[];
  coverage?: PublicArchiveStatistics;
  series?: SeasonSeries | null;
  edition?: string;
}) {
  const tr = useAppTranslations();
  const fragment = useUrlFragment();
  const selected = views.findIndex(({ id }) => fragment === `#${id}`);
  const view =
    selected >= 0 ? selected : !scores.length && series ? SERIES_VIEW : 0;
  const [previousView, setPreviousView] = useState(view);
  const [round, setRound] = useState(""),
    [team, setTeam] = useState(""),
    [slot, setSlot] = useState(""),
    [query, setQuery] = useState("");
  const showSeries = view === SERIES_VIEW;
  const [sort, setSort] = useState(views[view].sort),
    [descending, setDescending] = useState(true);
  const seriesOptions = useMemo(() => seasonSeriesOptions(series), [series]);
  const ranking = useMemo(
    () => (showSeries ? rateSeasonSeries(series, round, slot) : null),
    [showSeries, series, round, slot],
  );
  const eligible = showSeries
    ? []
    : scores.filter(
        (s) =>
          (!round || s.round === round) && (!slot || eventMapKey(s) === slot),
      );
  const plays = eligible.filter((s) => !team || s.teamId === team);
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
      plays.map((s) => (view === 3 || view === 4 ? s.teamId : s.osuId)),
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
  const labels: Record<string, string> = {
    MRA: "MRA",
    ERA: "ERA",
    DRA: "DRA",
    RWS: "RWS",
    Appearances: tr("Appearances"),
    "Raw MP score": tr("Raw MP score"),
    "Score multiplier": tr("Score multiplier"),
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
    rows = keys.map((id) => {
      const p = plays.filter((s) => s.osuId === id);
      const best = [...p].sort(
        (a, b) =>
          b.score - a.score ||
          a.osuId - b.osuId ||
          eventGameKey(a).localeCompare(eventGameKey(b)),
      )[0];
      return {
        _osuId: best.osuId,
        Player: best.player,
        Team: best.team,
        MC: p[0].mc ?? null,
        Played: p.length,
        "Participation rate":
          p.length /
          new Set(
            eligible.filter((s) => s.teamId === best.teamId).map(eventGameKey),
          ).size,
        MVPs: p.filter(
          (s) =>
            !eligible.some(
              (other) =>
                eventGameKey(other) === eventGameKey(s) &&
                other.score > s.score,
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
        const best = [...p].sort(
          (a, b) =>
            b.score - a.score ||
            a.osuId - b.osuId ||
            eventGameKey(a).localeCompare(eventGameKey(b)),
        )[0];
        const teams = eventTeamGames(p);
        return {
          Map: `${map.round} · ${map.slot}`,
          Beatmap: map.title,
          "Map ID": map.mapId,
          _bestOsuId: best?.osuId ?? null,
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
    if (plays.some((s) => (s.scoreMultiplier ?? 1) !== 1))
      columns.splice(
        columns.indexOf("Score") + 1,
        0,
        "Raw MP score",
        "Score multiplier",
      );
    rows = plays.map((s) => ({
      _osuId: s.osuId,
      Map: s.slot,
      Beatmap: s.title,
      Player: s.player,
      Team: s.team,
      Score: s.score,
      "Raw MP score": s.rawScore ?? s.score,
      "Score multiplier": s.scoreMultiplier ?? 1,
      Accuracy: s.accuracy,
      Combo: s.combo,
      Mods: s.mods,
      Match: s.mp,
      "Team score": plays
        .filter(
          (p) => eventGameKey(p) === eventGameKey(s) && p.teamId === s.teamId,
        )
        .reduce((n, p) => n + p.score, 0),
    }));
  } else if (ranking) {
    columns = ["Player", "Team", "Appearances", "MRA", "ERA", "DRA", "RWS"];
    rows = visibleSeriesPlayers(ranking.players, team, query).map((p) => ({
      _rank: p.rank,
      _osuId: p.userId,
      Player: p.username,
      Team: p.team,
      Appearances: p.appearances,
      MRA: p.mra,
      ERA: p.era,
      DRA: p.dra,
      RWS: p.rws,
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
  rows = rows.filter(
    (row) =>
      showSeries ||
      columns.some((column) => {
        const value = row[column];
        return String(value ?? "")
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
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
  function cell(key: string, value: Cell, row: Row) {
    if (value === null || value === undefined) return "—";
    const playerEdition = coverage?.slug ?? (showSeries ? edition : undefined);
    if ((key === "Player" || key === "Best player") && playerEdition) {
      const osuId = row[key === "Best player" ? "_bestOsuId" : "_osuId"];
      if (typeof osuId === "number")
        return (
          <Link href={`/players/${osuId}?edition=${playerEdition}`}>
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
    if (typeof value === "number" && ["MRA", "ERA", "DRA", "RWS"].includes(key))
      return number(value, 4);
    if (typeof value === "number")
      return /accuracy|rate/i.test(key)
        ? `${number(value * 100, 2)}%`
        : number(
            value,
            key === "Score multiplier" ? 4 : /MC|placement/.test(key) ? 3 : 0,
          );
    return value;
  }
  function filters(index: number) {
    const isSeries = index === SERIES_VIEW;
    return [
      {
        label: "Rounds",
        value: round,
        set: setRound,
        options: isSeries
          ? seriesOptions.rounds
          : (coverage?.stages ?? [...new Set(scores.map((s) => s.round))]).map(
              (value) => ({ value, label: value }),
            ),
      },
      {
        label: "Team",
        value: team,
        set: setTeam,
        options: isSeries
          ? seriesOptions.teams
          : (coverage?.teams.map((t) => ({ value: t.id, label: t.name })) ?? [
              ...new Map(
                scores.map((s) => [
                  s.teamId,
                  { value: s.teamId, label: s.team },
                ]),
              ).values(),
            ]),
      },
      {
        label: "Map",
        value: slot,
        set: setSlot,
        options: isSeries
          ? seriesOptions.maps.filter((m) => !round || m.round === round)
          : (index === 1
              ? eventMappoolRows(scores, poolFixtures).map(({ key, map }) => ({
                  key,
                  label: `${map.round} · ${map.slot} · ${map.mapId ?? map.title}`,
                }))
              : groupEventMaps(scores)
            ).map((m) => ({ value: m.key, label: m.label })),
      },
    ];
  }
  if (view !== previousView) {
    setPreviousView(view);
    setSort(views[view].sort);
    if (showSeries) setDescending(true);
    for (const { value, set, options } of filters(view)) {
      if (value && !options.some((option) => option.value === value)) set("");
    }
  }
  return (
    <section className="event-statistics">
      <h1>{tr("Statistics")}</h1>
      {coverage && !showSeries && (
        <StatisticsNotice>
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
          {view === 1 && (
            <p className="muted">
              {tr(
                "Rates require known mappools and complete coverage. Coverage shows recorded / applicable matches. Unknown mappool matches are listed separately.",
              )}
            </p>
          )}
        </StatisticsNotice>
      )}
      {coverage && !showSeries && (
        <section aria-label={tr("Statistics coverage")}>
          <div className="statistics-summary">
            <div>
              <strong>
                {coverageFixtures!.filter((f) => f.covered).length} /{" "}
                {coverageFixtures!.length}
              </strong>
              <span>{tr("Reviewed matches")}</span>
            </div>
            <div>
              <strong>{new Set(plays.map(eventGameKey)).size}</strong>
              <span>{tr("Scoring games")}</span>
            </div>
            <div>
              <strong>{new Set(plays.map((p) => p.osuId)).size}</strong>
              <span>{tr("Players with data")}</span>
            </div>
          </div>
        </section>
      )}
      <div className="event-tabs">
        {views.map(({ id, label }, i) => (
          <button
            key={id}
            aria-pressed={view === i}
            onClick={() => selectFragment(`#${id}`)}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      <div className="event-tools">
        {filters(view).map(({ label, value, set, options }) => (
          <label key={label}>
            {tr(label)}
            <select
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                set(next);
                if (
                  showSeries &&
                  label === "Rounds" &&
                  next &&
                  slot &&
                  !seriesOptions.maps.some(
                    (m) => m.round === next && m.value === slot,
                  )
                )
                  setSlot("");
              }}
            >
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
      <h2>{tr(views[view].label)}</h2>
      {ranking && (
        <>
          <p className="muted">
            {tr(
              "Round and map change the rating. Team and search only filter the ranked players.",
            )}
          </p>
          <p className="muted">
            {tr("Fully rated public matches (before map filter)")}:{" "}
            {number(ranking.fullyRated)} / {number(ranking.publicFixtures)}
            {" · "}
            {tr("Scoring games")}: {number(ranking.gameCount)}
            {" · "}
            {tr("Appearances")}: {number(ranking.scoreCount)}
            {ranking.fullyRated < ranking.publicFixtures && (
              <> · {tr("Partial coverage")}</>
            )}
          </p>
          {!ranking.gameCount ? (
            <p>{tr("No published games can be rated in this scope.")}</p>
          ) : (
            !rows.length && <p>{tr("No players match these filters.")}</p>
          )}
        </>
      )}
      <div
        className="event-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={tr(views[view].label)}
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
                    {placementLabels.get(c) ?? labels[c] ?? tr(c)}{" "}
                    {sort === c ? (descending ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={showSeries ? String(r._osuId) : i}>
                <td>{r._rank ?? i + 1}</td>
                {columns.map((c) => (
                  <td key={c}>{cell(c, r[c], r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
