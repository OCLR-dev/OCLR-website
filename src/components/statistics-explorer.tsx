"use client";
import { PageNotes } from "./page-notes";
import { useMemo, useState } from "react";
import Link from "./pending-link";
import { useAppTranslations } from "@/i18n/shared";
import type { PublicArchiveStatistics } from "@/lib/archive-statistics";
import { aggregateStatistics } from "@/lib/archive-statistics-model";
import { Avatar } from "./avatar";
export function StatisticsExplorer({
  data,
}: {
  data: PublicArchiveStatistics;
}) {
  const tr = useAppTranslations();
  const [stage, setStage] = useState(""),
    [team, setTeam] = useState(""),
    [query, setQuery] = useState("");
  const [sort, setSort] = useState("relative"),
    [selected, setSelected] = useState<number | null>(null);
  const plays = useMemo(
    () =>
      data.plays.filter(
        (p) => (!stage || p.stage === stage) && (!team || p.teamId === team),
      ),
    [data.plays, stage, team],
  );
  const rows = aggregateStatistics(data, plays)
    .filter(
      (p) =>
        (!team || p.teamId === team) &&
        [
          p.username,
          String(p.osuId),
          data.teams.find((t) => t.id === p.teamId)?.name ?? "",
        ].some((v) =>
          v.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
        ),
    )
    .sort((a, b) => {
      const key = sort as "relative" | "total" | "accuracy" | "maps";
      return (
        (b[key] ?? -1) - (a[key] ?? -1) || a.username.localeCompare(b.username)
      );
    });
  const fmt = (n: number | null, digits = 0) =>
    n === null
      ? "—"
      : n.toLocaleString(tr.locale, { maximumFractionDigits: digits });
  const pct = (n: number | null) => (n === null ? "—" : fmt(n * 100, 2) + "%");
  const fixtures = data.fixtures.filter((f) => !stage || f.stage === stage);
  const player = data.players.find((p) => p.osuId === selected);
  return (
    <section className="statistics-workspace stack">
      <div
        className="statistics-summary"
        aria-label={tr("Statistics coverage")}
      >
        <div>
          <strong>
            {fixtures.filter((f) => f.covered).length} / {fixtures.length}
          </strong>
          <span>{tr("Reviewed matches")}</span>
        </div>
        <div>
          <strong>{new Set(plays.map((p) => p.gameId)).size}</strong>
          <span>{tr("Scoring games")}</span>
        </div>
        <div>
          <strong>{new Set(plays.map((p) => p.osuId)).size}</strong>
          <span>{tr("Players with data")}</span>
        </div>
      </div>
      <div
        className="tab-nav statistics-rounds"
        role="group"
        aria-label={tr("Statistics rounds")}
      >
        <button
          type="button"
          aria-pressed={stage === ""}
          onClick={() => setStage("")}
        >
          {tr("All rounds")}
        </button>
        {data.stages.map((s) => (
          <button
            type="button"
            key={s}
            aria-pressed={stage === s}
            onClick={() => setStage(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="statistics-filters">
        <label className="field">
          <span>{tr("Search players")}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Username, osu! ID or team")}
          />
        </label>
        <label className="field">
          <span>{tr("Team")}</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{tr("All teams")}</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{tr("Sort by")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relative">{tr("Relative score")}</option>
            <option value="total">{tr("Total score")}</option>
            <option value="accuracy">{tr("Accuracy")}</option>
            <option value="maps">{tr("Maps played")}</option>
          </select>
        </label>
      </div>
      {!data.plays.length && (
        <p className="notice">
          {tr("Statistics have not been published yet.")}
        </p>
      )}
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={tr("Player statistics")}
      >
        <table className="statistics-table">
          <caption className="sr-only">{tr("Player statistics")}</caption>
          <thead>
            <tr>
              {[
                "Player",
                "Team",
                "Maps played",
                "Matches",
                "Total score",
                "Average score",
                "Relative score",
                "Accuracy",
                "Max combo",
                "Misses",
                "Pass rate",
              ].map((h) => (
                <th key={h} scope="col">
                  {tr(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.osuId} data-player-id={p.osuId}>
                <th scope="row">
                  <button
                    type="button"
                    className="statistics-player"
                    onClick={() => setSelected(p.osuId)}
                    aria-expanded={selected === p.osuId}
                  >
                    <Avatar osuId={p.osuId} username={p.username} />
                    <span>
                      {p.username}
                      <small>
                        {p.role === "captain"
                          ? "Captain"
                          : p.role === "coach"
                            ? tr("Coach")
                            : p.tier
                              ? "Tier " + p.tier
                              : "osu! " + p.osuId}
                      </small>
                    </span>
                  </button>
                </th>
                <td>
                  {data.teams.find((t) => t.id === p.teamId)?.name ?? "—"}
                </td>
                <td>
                  {!p.maps && fixtures.some((f) => !f.covered) ? "—" : p.maps}
                </td>
                <td>
                  {!p.maps && fixtures.some((f) => !f.covered)
                    ? "—"
                    : p.matches}
                </td>
                <td>{fmt(p.total)}</td>
                <td>{fmt(p.mean, 1)}</td>
                <td>{pct(p.relative)}</td>
                <td>
                  {pct(p.accuracy)}
                  {p.accuracy !== null && (
                    <small>
                      {p.accuracyMaps} / {p.maps}
                    </small>
                  )}
                </td>
                <td>{fmt(p.combo)}</td>
                <td>{fmt(p.misses)}</td>
                <td>{pct(p.passRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p role="status">{tr("No matching players.")}</p>}
      {player && (
        <section
          className="stack statistics-detail"
          aria-label={tr("Player game details")}
        >
          <div className="section-heading">
            <h2>{player.username}</h2>
            <Link
              href={"/tournaments/" + data.slug + "/players/" + player.osuId}
            >
              {tr("Player profile")}
            </Link>
            <button
              className="secondary"
              type="button"
              onClick={() => setSelected(null)}
            >
              {tr("Close")}
            </button>
          </div>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={tr("Player game details")}
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Round",
                    "Match",
                    "Beatmap",
                    "Mods",
                    "Scoring system",
                    "Score",
                    "Accuracy",
                    "Max combo",
                    "300 / 100 / 50 / Miss",
                    "Result",
                  ].map((s) => (
                    <th key={s} scope="col">
                      {tr(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plays
                  .filter((p) => p.osuId === selected)
                  .map((p) => (
                    <tr key={p.gameId}>
                      <td>{p.stage}</td>
                      <td>
                        <Link
                          href={
                            "/tournaments/" +
                            data.slug +
                            "/matches/" +
                            p.fixtureId
                          }
                        >
                          {
                            data.fixtures.find((f) => f.id === p.fixtureId)
                              ?.label
                          }
                        </Link>
                        <br />
                        <a
                          href={
                            "https://osu.ppy.sh/community/matches/" + p.mpId
                          }
                        >
                          {tr("MP link")}
                        </a>
                      </td>
                      <td>
                        <a href={"https://osu.ppy.sh/beatmaps/" + p.beatmapId}>
                          {p.slot} · {p.title}
                        </a>
                      </td>
                      <td>{p.mods.join(" ") || "NM"}</td>
                      <td>{p.scoringType}</td>
                      <td>{fmt(p.score)}</td>
                      <td>{pct(p.accuracy)}</td>
                      <td>{fmt(p.combo)}</td>
                      <td>
                        {[
                          p.hits?.great ?? null,
                          p.hits?.ok ?? null,
                          p.hits?.meh ?? null,
                          p.hits?.miss ?? null,
                        ]
                          .map((n) => fmt(n))
                          .join(" / ")}
                      </td>
                      <td>
                        {p.passed === null
                          ? "—"
                          : p.passed
                            ? tr("Passed")
                            : tr("Failed")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <PageNotes>
        <p className="muted">
          {tr(
            "Only reviewed and published MP games are counted. Missing data is not zero.",
          )}
        </p>
        {fixtures.some((f) => f.technicalAdjudication) && (
          <p>
            {tr(
              "Some matches include confirmed technical adjudication. Historical series results are retained; player statistics reflect actual MP scores, without invented scores for awarded points.",
            )}
          </p>
        )}
        <details className="statistics-method">
          <summary>{tr("Statistics calculation")}</summary>
          <p>
            {tr(
              "Each included game counts as one appearance, including failed plays with a recorded score. Relative score is the player's score divided by the highest player score in that game, then averaged. Accuracy is the arithmetic mean of recorded accuracy values; its coverage is shown. Different score systems and small samples should be compared with care. Forfeits without games are excluded.",
            )}
          </p>
        </details>
        <details>
          <summary>{tr("Match coverage")}</summary>
          <ul className="statistics-coverage">
            {fixtures.map((f) => (
              <li key={f.id}>
                <Link href={"/tournaments/" + data.slug + "/matches/" + f.id}>
                  {f.label} · {f.stage}
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
                      {tr("Player statistics reflect recorded MP scores only.")}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </PageNotes>
    </section>
  );
}
