"use client";
import Link from "./pending-link";
import { useAppTranslations } from "@/i18n/shared";
import { formatDate } from "@/lib/editions";
import type { MatchDetails } from "@/lib/match-details-model";
import { PlayerRatings } from "./player-ratings";
import styles from "./match-details.module.css";

export function MatchDetailsView({
  details,
  slug,
  teams,
  timeZone,
  historical = false,
}: {
  details: MatchDetails | null;
  slug: string;
  teams: { id: string; name: string }[];
  timeZone: string;
  historical?: boolean;
}) {
  const tr = useAppTranslations();
  const number = (value: number | null | undefined) =>
    value == null ? tr("Not recorded") : value.toLocaleString(tr.locale);
  const team = (id: string | null) =>
    teams.find((t) => t.id === id)?.name ?? tr("Unresolved");
  const date = (value: string | null) =>
    value ? formatDate(value, timeZone, tr.locale) : tr("Not recorded");
  if (!details)
    return (
      <section className="section-space stack">
        <h2>{tr("Played maps")}</h2>
        <p role="status" className="notice">
          {tr("Match details unavailable.")}
        </p>
      </section>
    );
  const wins = [0, 0];
  for (const game of details.games.filter((g) => g.included)) {
    const [a, b] = game.effectiveTotals;
    if (a !== null && b !== null && a !== b) wins[a > b ? 0 : 1]++;
  }
  return (
    <>
      <section
        className={`section-space stack ${styles.details}`}
        aria-label={tr("Played maps")}
      >
        <h2>{tr("Played maps")}</h2>
        {details.technicalAdjudication && (
          <p className="notice">
            {tr("Technical adjudication; recorded series score")}
          </p>
        )}
        <p>
          {tr("Reviewed played-map wins")}: {team(details.teamIds[0])} {wins[0]}{" "}
          : {wins[1]} {team(details.teamIds[1])}
        </p>
        <ul>
          {details.sources.map((s) => (
            <li key={s.mpId}>
              <a
                className="text-link"
                href={`https://osu.ppy.sh/community/matches/${s.mpId}`}
                rel="noreferrer"
              >
                MP #{s.mpId}
              </a>
              {!s.complete && <> · {tr("Partial source")}</>}
            </li>
          ))}
        </ul>
        {!details.games.length && (
          <p>{tr("No approved scored games available for rating.")}</p>
        )}
        {details.games.map((g, i) => (
          <article
            className="panel stack"
            id={`game-${g.gameId}`}
            key={`${g.mpId}:${g.gameId}`}
          >
            <div>
              <p className="eyebrow">
                {tr("MAP ")}
                {i + 1} · MP #{g.mpId} ·{" "}
                {tr("Game {value0}", { value0: g.gameId })}
              </p>
              <h3>
                {g.beatmap?.artist ? `${g.beatmap.artist} — ` : ""}
                {g.beatmap?.title ?? tr("Beatmap unavailable")}
              </h3>
              <p className="muted">
                {g.beatmap?.difficulty ?? tr("Not recorded")}
              </p>
              {g.beatmapId && (
                <a
                  className="text-link"
                  href={`https://osu.ppy.sh/beatmaps/${g.beatmapId}`}
                  rel="noreferrer"
                >
                  {tr("Beatmap ")}
                  {g.beatmapId} ↗
                </a>
              )}
            </div>
            <p>
              <strong>
                {g.included
                  ? tr("Included in official result")
                  : tr("Excluded from official result")}
              </strong>{" "}
              · {g.modsKnown ? g.mods.join(" / ") || "NM" : tr("Not recorded")}{" "}
              · {g.mode ?? tr("Not recorded")} ·{" "}
              {g.teamType ?? tr("Not recorded")} ·{" "}
              {g.scoringType ?? tr("Not recorded")}
            </p>
            <p className="small muted">
              {date(g.startTime)} → {date(g.endTime)}
            </p>
            {g.rosterMapping && (
              <p className="notice">{tr("Team mapping adjusted")}</p>
            )}
            {details.failedScorePolicy === "zero" &&
              g.scores.some(
                (s) =>
                  s.included &&
                  s.passed === false &&
                  s.total !== null &&
                  s.total !== 0 &&
                  s.effectiveTotal === 0,
              ) && <p className="notice">{tr("Failed scores counted as 0")}</p>}
            <dl className="detail-list">
              <div>
                <dt>{tr("Actual MP totals")}</dt>
                <dd>
                  {team(details.teamIds[0])}: {number(g.rawTotals[0])} ·{" "}
                  {team(details.teamIds[1])}: {number(g.rawTotals[1])}
                </dd>
              </div>
              <div>
                <dt>{tr("Reviewed totals")}</dt>
                <dd>
                  {g.included
                    ? `${team(details.teamIds[0])}: ${number(g.effectiveTotals[0])} · ${team(details.teamIds[1])}: ${number(g.effectiveTotals[1])}`
                    : tr("Not applicable")}
                </dd>
              </div>
              {g.included && (
                <div>
                  <dt>{tr("Winner")}</dt>
                  <dd>
                    {g.effectiveTotals.some((n) => n === null)
                      ? tr("Not recorded")
                      : g.effectiveTotals[0] === g.effectiveTotals[1]
                        ? tr("Approved tied map")
                        : team(
                            details.teamIds[
                              g.effectiveTotals[0]! > g.effectiveTotals[1]!
                                ? 0
                                : 1
                            ],
                          )}
                  </dd>
                </div>
              )}
            </dl>
            {!!g.withheldScores && (
              <p className="notice">{tr("Player data incomplete")}</p>
            )}
            {!g.scores.length ? (
              <p>{tr("No public player scores available.")}</p>
            ) : (
              <details open={g.included}>
                <summary>{tr("Player scores")}</summary>
                <div
                  className="table-scroll"
                  role="region"
                  tabIndex={0}
                  aria-label={`${tr("Game {value0}", { value0: g.gameId })} · ${tr("Player scores; scroll horizontally")}`}
                >
                  <table className={styles.scores}>
                    <caption>
                      {tr("Actual MP scores and reviewed contribution")}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{tr("Player")}</th>
                        <th scope="col">{tr("Team")}</th>
                        <th scope="col">{tr("Lobby team / slot")}</th>
                        <th scope="col">{tr("Score")}</th>
                        <th scope="col">{tr("Reviewed score")}</th>
                        <th scope="col">{tr("Accuracy")}</th>
                        <th scope="col">{tr("Combo")}</th>
                        <th scope="col">300 / 100 / 50 / {tr("Miss")}</th>
                        <th scope="col">{tr("Mods")}</th>
                        <th scope="col">{tr("Pass / fail")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.scores.map((s, index) => (
                        <tr key={`${s.osuId}:${index}`}>
                          <th scope="row">
                            <Link
                              className="text-link"
                              href={
                                historical
                                  ? `/tournaments/${slug}/players/${s.osuId}`
                                  : `/players/${s.osuId}?edition=${slug}`
                              }
                            >
                              {s.username}
                            </Link>
                            {s.mapping === "substitution" && (
                              <span className="small">
                                {" "}
                                · {tr("Substitute")}
                              </span>
                            )}
                          </th>
                          <td>
                            {s.teamId ? (
                              <Link
                                className="text-link"
                                href={`/tournaments/${slug}/teams/${s.teamId}`}
                              >
                                {team(s.teamId)}
                              </Link>
                            ) : (
                              tr("Unresolved")
                            )}
                          </td>
                          <td>
                            {s.lobbyTeam === "blue"
                              ? tr("Blue")
                              : s.lobbyTeam === "red"
                                ? tr("Red")
                                : s.lobbyTeam === "none"
                                  ? tr("No team")
                                  : tr("Not recorded")}{" "}
                            / {number(s.slot)}
                          </td>
                          <td>{number(s.total)}</td>
                          <td>
                            {s.included
                              ? number(s.effectiveTotal)
                              : tr("Not applicable")}
                          </td>
                          <td>
                            {s.accuracy === null
                              ? tr("Not recorded")
                              : `${(s.accuracy * 100).toFixed(2)}%`}
                          </td>
                          <td>{number(s.combo)}</td>
                          <td>
                            {[
                              s.hits?.great,
                              s.hits?.ok,
                              s.hits?.meh,
                              s.hits?.miss,
                            ]
                              .map(number)
                              .join(" / ")}
                          </td>
                          <td>
                            {s.modsKnown
                              ? s.mods.join(" / ") || "NM"
                              : tr("Not recorded")}
                          </td>
                          <td>
                            {s.passed === null
                              ? tr("Not recorded")
                              : s.passed
                                ? tr("Pass")
                                : tr("Fail")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.scores.some((s) =>
                  Object.values(s.providerScores).some((v) => v !== null),
                ) && (
                  <details>
                    <summary>{tr("Additional provider score values")}</summary>
                    <ul>
                      {g.scores.map((s, index) => (
                        <li key={`${s.osuId}:${index}`}>
                          {s.username}
                          {" · score: "}
                          {number(s.providerScores.score)}
                          {" · legacy_total_score: "}
                          {number(s.providerScores.legacy)}
                          {" · total_score: "}
                          {number(s.providerScores.total)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </details>
            )}
          </article>
        ))}
      </section>
      <section className="section-space stack">
        <h2>{tr("Match Rating")}</h2>
        {details.rating ? (
          <PlayerRatings
            report={details.rating}
            slug={slug}
            historical={historical}
            compact
          />
        ) : (
          <p role="status" className="notice">
            {tr("Rating unavailable; approved score data needs review.")}
          </p>
        )}
      </section>
    </>
  );
}
