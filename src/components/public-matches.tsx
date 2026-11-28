"use client";
import {
  competitionStageLabel,
  exhibitionNotice,
} from "@/lib/competition-stage";

import { TeamAvatar } from "./team-avatar";
import { useAppTranslations } from "@/i18n/shared";

import Link from "./pending-link";
import { useState } from "react";
import type { PublicFixture, PublicGroup } from "@/lib/public-competition";
import { formatDate } from "@/lib/editions";
import styles from "./public-standings.module.css";

export function MatchCard({
  fixture: f,
  slug,
}: {
  fixture: PublicFixture;
  slug: string;
}) {
  const tr = useAppTranslations();

  const status =
    f.status === "cancelled"
      ? "Cancelled"
      : f.result
        ? "Published result"
        : f.status === "ended"
          ? "Ended"
          : f.confirmed
            ? f.status.replaceAll("_", " ")
            : "Awaiting fixture confirmation";
  return (
    <article className="panel public-match-card">
      <div className="match-meta">
        <span className="eyebrow">
          {tr(competitionStageLabel(f.stage))} / {f.roundName}
        </span>
        <span className="badge">{tr(status)}</span>
      </div>
      <h3>
        <Link
          href={`/tournaments/${slug}/matches/${f.id}`}
          className="text-link"
        >
          {f.label}
        </Link>
      </h3>
      <div className="match-versus">
        <span>
          {f.home.team && <TeamAvatar team={f.home.team} />} {f.home.label}
        </span>
        <strong
          aria-label={
            f.result
              ? tr("Score {value0} to {value1}", {
                  value0: f.result.homeWins,
                  value1: f.result.awayWins,
                })
              : tr("Versus")
          }
        >
          {f.result ? `${f.result.homeWins} : ${f.result.awayWins}` : tr("vs")}
        </strong>
        <span>
          {f.away.team && <TeamAvatar team={f.away.team} />} {f.away.label}
        </span>
      </div>
      <p className="match-time muted">
        {f.scheduledAt ? (
          <time dateTime={f.scheduledAt}>
            {tr(formatDate(f.scheduledAt, f.timeZone, tr.locale))}
          </time>
        ) : (
          tr("Match time TBA")
        )}
      </p>
      {f.result?.vodUrl && (
        <a
          className="text-link"
          href={f.result.vodUrl}
          target="_blank"
          rel="noreferrer"
        >
          {tr("Watch match recording")}
        </a>
      )}
      <details className="match-public-details">
        <summary>{tr("Match details")}</summary>
        <div>
          {f.pool && (
            <p>
              <Link
                className="text-link"
                href={`/tournaments/${slug}/mappools/${f.pool.id}`}
              >
                {tr("Released mappool: ")}
                {f.pool.name}
              </Link>
            </p>
          )}
          {f.result && (
            <>
              <p className="small muted">
                {f.result.draw
                  ? tr("Approved draw")
                  : tr("Winner: {value0}", {
                      value0:
                        f.result.winnerTeamId === f.home.team?.id
                          ? f.home.label
                          : f.away.label,
                    })}{" "}
                {tr("· Updated")}{" "}
                {tr(formatDate(f.result.updatedAt, f.timeZone, tr.locale))}
              </p>
              {f.result.mpUrl && (
                <a className="text-link" href={f.result.mpUrl}>
                  {tr("osu! match source")}
                </a>
              )}
            </>
          )}
          <p>
            <Link
              className="text-link"
              href={`/tournaments/${slug}/matches/${f.id}`}
            >
              {tr("Open match")}
            </Link>
          </p>
        </div>
      </details>
    </article>
  );
}

export function PublicMatches({
  fixtures,
  slug,
  groups = [],
}: {
  fixtures: PublicFixture[];
  slug: string;
  groups?: PublicGroup[];
}) {
  const tr = useAppTranslations();

  const [stage, setStage] = useState("");
  const [round, setRound] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "compact">("cards");
  const stages = [...new Set(fixtures.map((f) => f.stage))];
  const stageFixtures = fixtures.filter((f) => !stage || f.stage === stage);
  const rounds = [
    ...new Map(stageFixtures.map((f) => [f.roundId, f.roundName])).entries(),
  ];
  const hasGroupFixtures = (roundId: string) =>
    stageFixtures.some(
      (f) => f.stage === "group" && (!roundId || f.roundId === roundId),
    );
  const showGroupFilter = groups.length > 0 && hasGroupFixtures(round);
  const selectedGroup = showGroupFilter
    ? groups.find((g) => g.key === group)
    : undefined;
  const term = search.trim().toLocaleLowerCase();
  const matches = stageFixtures.filter(
    (f) =>
      (!round || f.roundId === round) &&
      (!selectedGroup ||
        (f.stage === "group" &&
          selectedGroup.rows.some((r) => r.team.id === f.home.team?.id) &&
          selectedGroup.rows.some((r) => r.team.id === f.away.team?.id))) &&
      (!status ||
        (status === "completed"
          ? Boolean(f.result)
          : status === "pending"
            ? !f.result && f.status !== "cancelled"
            : f.status === "cancelled")) &&
      (!term ||
        [f.label, f.roundName, f.home.label, f.away.label, f.result?.mpId]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term)),
  );
  return (
    <section className="public-matches stack">
      <div className="public-match-toolbar">
        <div
          className="event-pills"
          role="group"
          aria-label={tr("Competition stage")}
        >
          {[
            ["", "All stages"],
            ...stages.map((value) => [value, competitionStageLabel(value)]),
          ].map(([value, label]) => (
            <button
              key={value}
              className="secondary"
              type="button"
              aria-pressed={stage === value}
              onClick={() => {
                setStage(value);
                setRound("");
                setGroup("");
              }}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        <div className="event-pills" role="group" aria-label={tr("Match view")}>
          {(["cards", "compact"] as const).map((value) => (
            <button
              className="secondary"
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {value === "cards" ? tr("Cards") : tr("Compact")}
            </button>
          ))}
        </div>
      </div>
      <div className="public-match-filters">
        <label className="field">
          <span>{tr("Search matches")}</span>
          <input
            type="search"
            value={search}
            placeholder={tr("Team, match or MP ID")}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {rounds.length > 1 && (
          <label className="field">
            <span>{tr("Competition round")}</span>
            <select
              value={round}
              onChange={(e) => {
                const next = e.target.value;
                setRound(next);
                if (!hasGroupFixtures(next)) setGroup("");
              }}
            >
              <option value="">{tr("All rounds")}</option>
              {rounds.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {showGroupFilter && (
          <label className="field">
            <span>{tr("Group")}</span>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">{tr("All groups")}</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>{tr("Match publication status")}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{tr("All matches")}</option>
            <option value="completed">{tr("Published results")}</option>
            <option value="pending">{tr("Awaiting result")}</option>
            <option value="cancelled">{tr("Cancelled")}</option>
          </select>
        </label>
      </div>
      <p className="muted small" role="status">
        {tr(
          "{count, plural, one {# published fixture} other {# published fixtures}}",
          { count: matches.length },
        )}
      </p>
      {[...new Set(matches.map((f) => f.roundId))].map((roundId) => {
        const group = matches.filter((f) => f.roundId === roundId);
        return (
          <section
            className="public-match-round"
            key={roundId}
            aria-labelledby={`public-round-${roundId}`}
          >
            <h2 id={`public-round-${roundId}`}>
              {tr(competitionStageLabel(group[0].stage))} · {group[0].roundName}
            </h2>
            {group[0].stage === "exhibition" && (
              <p className="notice">{tr(exhibitionNotice)}</p>
            )}
            <div className="public-match-list" data-view={view}>
              {group.map((f) => (
                <MatchCard key={f.id} fixture={f} slug={slug} />
              ))}
            </div>
          </section>
        );
      })}
      {!matches.length && (
        <p className="notice">
          {tr(
            "No published fixtures match these filters. Confirmed matches will appear here when released.",
          )}
        </p>
      )}
    </section>
  );
}
export function GroupStandings({
  groups,
  slug,
}: {
  groups: PublicGroup[];
  slug: string;
}) {
  const tr = useAppTranslations();
  const orders = new Map<
    string,
    { criteria: NonNullable<PublicGroup["criteria"]>; groups: string[] }
  >();
  for (const group of groups) {
    if (!group.criteria) continue;
    const key = group.criteria.join(",");
    const order = orders.get(key) ?? { criteria: group.criteria, groups: [] };
    order.groups.push(group.name);
    orders.set(key, order);
  }
  const labels = {
    points: tr("Points"),
    map_difference: tr("Difference"),
    maps_won: tr("Maps won"),
    wins: tr("Wins"),
  };

  return (
    <section
      className={`section-space ${styles.standings}`}
      aria-labelledby="standings-heading"
    >
      <header className={styles.heading}>
        <p className="eyebrow">{tr("GROUP STAGE")}</p>
        <h2 id="standings-heading">{tr("Standings")}</h2>
      </header>
      {orders.size > 0 && (
        <div className={styles.order}>
          <h3>{tr("Ranking order")}</h3>
          {[...orders].map(([key, order]) => (
            <div className={styles.orderRow} key={key}>
              {orders.size > 1 && <strong>{order.groups.join(" · ")}</strong>}
              <ol className={styles.criteria} role="list">
                {order.criteria.map((criterion, i) => (
                  <li key={criterion}>
                    {i > 0 && <span aria-hidden="true">→</span>}
                    <strong>{labels[criterion]}</strong>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      <p className={`muted small ${styles.note}`}>
        {tr(
          "Only approved, published match results count. Equal ranks remain tied until the configured criteria resolve them.",
        )}
      </p>
      {!groups.length && (
        <p className="notice">
          {tr(
            "Groups and ranking rules await publication. No ranking is assumed.",
          )}
        </p>
      )}
      {groups.map((g) => (
        <article className={styles.group} key={g.key}>
          <h3>{g.name}</h3>
          {g.rankingPending && (
            <p className="notice">
              {tr(
                "Ranking pending: confirmed fixtures, points or tiebreak rules are incomplete or inconsistent.",
              )}
            </p>
          )}
          <div
            className={styles.scroll}
            role="region"
            tabIndex={0}
            aria-label={tr("{value0} standings; scroll horizontally", {
              value0: g.name,
            })}
          >
            <table>
              <caption className="sr-only">{g.name}</caption>
              <thead>
                <tr>
                  <th scope="col">{tr("Rank")}</th>
                  <th scope="col">{tr("Team")}</th>
                  <th scope="col">{labels.points}</th>
                  <th scope="col">{labels.map_difference}</th>
                  <th scope="col">{labels.maps_won}</th>
                  <th scope="col">{tr("Matches played")}</th>
                  <th scope="col">W</th>
                  <th scope="col">L</th>
                  <th scope="col">D</th>
                  <th scope="col">{tr("Maps lost")}</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.team.id}>
                    <td>{r.rank ?? "—"}</td>
                    <th scope="row">
                      <Link
                        className="text-link"
                        href={`/tournaments/${slug}/teams/${r.team.id}`}
                      >
                        {r.team.name}
                      </Link>
                    </th>
                    <td>{r.points ?? "—"}</td>
                    <td>{r.mapDifference}</td>
                    <td>{r.mapsWon}</td>
                    <td>{r.played}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td>{r.draws}</td>
                    <td>{r.mapsLost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </section>
  );
}
