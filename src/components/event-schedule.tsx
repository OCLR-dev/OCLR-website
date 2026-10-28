"use client";
import "../app/tournaments/[edition]/event-pages.css";
import { useState, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { EventMatch } from "@/lib/event-preview";
import type { PublicGroup } from "@/lib/public-competition";
import { GroupStandings } from "./public-matches";
export function EventSchedule({
  matches,
  groups = [],
  edition,
  phases,
  heading = true,
  timeZone = "UTC+8",
  reviewMode = false,
  initialStatus = "all",
  competition,
}: {
  matches: EventMatch[];
  groups?: PublicGroup[];
  edition: string;
  phases?: { id: string; label: string }[];
  heading?: boolean;
  timeZone?: string;
  reviewMode?: boolean;
  initialStatus?: "all" | "recorded" | "unconfirmed";
  competition?: ReactNode;
}) {
  const tr = useAppTranslations();
  const phaseOptions = phases ?? [
    { id: "group", label: tr("Group stage / Swiss") },
    { id: "knockout", label: tr("Double elimination") },
  ];
  const [phase, setPhase] = useState(phaseOptions[0]?.id ?? "");
  const [status, setStatus] = useState(initialStatus);
  const listed = matches.filter(
    (m) => status === "all" || m.recorded === (status === "recorded"),
  );
  const [filter, setFilter] = useState("");
  const selected = listed.filter((m) => m.stage === phase);
  const rounds = [...new Set(selected.map((m) => m.round))];
  const positions: Record<string, [number, number]> = {
    W1: [20, 56],
    W2: [20, 164],
    L1: [20, 310],
    L2: [20, 418],
    L3: [280, 310],
    L4: [280, 418],
    W3: [540, 110],
    L5: [540, 364],
    L6: [800, 256],
    GF: [1060, 110],
    GF2: [1060, 418],
  };
  const seededLayout =
    selected.length > 0 && selected.every((m) => positions[m.id]);
  if (!seededLayout)
    rounds.forEach((round, x) =>
      selected
        .filter((m) => m.round === round)
        .forEach((m, y) => {
          positions[m.id] = [20 + x * 260, 56 + y * 108];
        }),
    );
  const chartWidth = seededLayout
    ? 1570
    : Math.max(600, rounds.length * 260 + 20);
  const chartHeight = seededLayout
    ? 530
    : Math.max(240, ...selected.map((m) => positions[m.id][1] + 110));
  const structured = phase === "knockout" && selected.length > 0;
  const columns = [
    tr("Mappool"),
    tr("Match number & time"),
    tr("Red team"),
    tr("Score"),
    tr("Blue team"),
    tr("First pick"),
    tr("Red bans"),
    tr("Blue bans"),
    tr("MPLink"),
    tr("Recording"),
    tr("Referee"),
    tr("Streamer"),
  ];
  function card(m: EventMatch) {
    return (
      <article className="event-match-card" id={`match-${m.id}`} key={m.id}>
        <header>
          <a href={m.href ?? `#row-${m.id}`}>{m.label ?? `#${m.id}`}</a>
          {m.status === "cancelled" ? (
            <span>{tr("Cancelled")}</span>
          ) : (
            <time>{m.time}</time>
          )}
        </header>
        {[m.red, m.blue].map((name, i) => (
          <div
            className="event-match-side"
            key={i}
            data-winner={m.winner === i || undefined}
          >
            <span>{i + 1}</span>
            <strong>
              {(i === 0 ? m.redHref : m.blueHref) ? (
                <a href={i === 0 ? m.redHref : m.blueHref}>{name}</a>
              ) : (
                name
              )}
              {m.winner === i && (
                <span className="sr-only">{tr(" (winner)")}</span>
              )}
            </strong>
            <b>
              {m.forfeit
                ? m.winner === i
                  ? tr("Winner")
                  : tr("Forfeit")
                : ((m.reviewScore ?? m.score)?.[i] ?? "—")}
            </b>
          </div>
        ))}
        {m.reviewScore && (
          <p className="muted small">{tr("Unconfirmed records")}</p>
        )}
        {(m.sourceRed || m.sourceBlue) && (
          <footer>
            {m.sourceRed} / {m.sourceBlue}
          </footer>
        )}
      </article>
    );
  }
  return (
    <div className="event-schedule">
      {heading && (
        <div className="event-section-heading">
          <h1>{tr("Schedule")}</h1>
          <span>{timeZone}</span>
        </div>
      )}
      {reviewMode && (
        <label>
          {tr("Match status")}
          <select
            aria-label={tr("Match status")}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">{tr("All matches")}</option>
            <option value="recorded">{tr("Recorded results")}</option>
            <option value="unconfirmed">{tr("Unconfirmed records")}</option>
          </select>
        </label>
      )}
      {competition ?? (
        <>
          <div className="event-tabs" role="group" aria-label={tr("Stage")}>
            {phaseOptions.map((option) => (
              <button
                key={option.id}
                aria-pressed={phase === option.id}
                onClick={() => setPhase(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div
            className="event-bracket-scroll"
            tabIndex={0}
            role="region"
            aria-label={tr("Bracket")}
          >
            {!selected.length ? (
              <p className="event-schedule-empty muted">
                {tr("No matches in this view.")}
              </p>
            ) : structured ? (
              <div
                className="event-knockout"
                style={{ minWidth: chartWidth, height: chartHeight }}
              >
                {seededLayout && (
                  <>
                    <span className="event-knockout-label" style={{ top: 24 }}>
                      {tr("Winners bracket")}
                    </span>
                    <span className="event-knockout-label" style={{ top: 270 }}>
                      {tr("Losers bracket")}
                    </span>
                  </>
                )}
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  aria-hidden="true"
                >
                  {selected.flatMap((m) =>
                    [m.sourceRed, m.sourceBlue]
                      .filter((source) => source && positions[source])
                      .map((source, i) => {
                        const [sx, sy] = positions[source!];
                        const [tx, ty] = positions[m.id];
                        const y = ty + 30 + i * 24;
                        return (
                          <path
                            key={`${source}-${m.id}-${i}`}
                            d={
                              tx > sx
                                ? `M ${sx + 225} ${sy + 42} H ${sx + 242} V ${y} H ${tx}`
                                : `M ${sx + 225} ${sy + 42} H ${sx + 245 + i * 8} V ${y} H ${tx + 225}`
                            }
                          />
                        );
                      }),
                  )}
                </svg>
                {selected.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      position: "absolute",
                      left: positions[m.id][0],
                      top: positions[m.id][1],
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -20,
                        fontSize: ".7rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.round}
                    </div>
                    {card(m)}
                  </div>
                ))}
                {seededLayout && (
                  <div className="event-knockout-ranks">
                    <h2>{tr("Final standings")}</h2>
                    {[
                      "#GF / #GF2 胜者",
                      "#GF / #GF2 败者",
                      "#L6 败者",
                      "#L5 败者",
                      "#L3 / #L4 败者",
                      "#L1 / #L2 败者",
                    ].map((name, i) => (
                      <div className="event-standing" key={name}>
                        <b>{["1", "2", "3", "4", "5–6", "7–8"][i]}</b>
                        <span>{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`event-bracket ${phase === "knockout" ? "event-double" : ""}`}
              >
                {rounds.map((round) => (
                  <section className="event-bracket-round" key={round}>
                    <h2>{round}</h2>
                    {[
                      ...new Set(
                        selected
                          .filter((m) => m.round === round)
                          .map((m) => m.record ?? ""),
                      ),
                    ].map((record) => (
                      <div className="event-record" key={record}>
                        {record && <h3>{record}</h3>}
                        {selected
                          .filter(
                            (m) =>
                              m.round === round && (m.record ?? "") === record,
                          )
                          .map(card)}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
          {phase === "group" && (
            <GroupStandings groups={groups} slug={edition} />
          )}
        </>
      )}
      <section className="event-match-summary">
        <div className="event-section-heading">
          <h2>{tr("Match information")}</h2>
          <label>
            {tr("Rounds")}
            <select
              aria-label={tr("Rounds")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">{tr("All rounds")}</option>
              {[...new Set(matches.map((m) => m.round))].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="event-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={tr("Match information")}
        >
          <table className="event-table event-matches">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed
                .filter((m) => !filter || m.round === filter)
                .map((m) => (
                  <tr
                    key={m.id}
                    id={`row-${m.id}`}
                    data-status={m.status}
                    data-forfeit={m.forfeit || undefined}
                    data-recorded={m.recorded}
                  >
                    <td>
                      <strong>
                        {m.poolHref ? (
                          <a href={m.poolHref}>{m.pool}</a>
                        ) : (
                          m.pool
                        )}
                      </strong>
                      <small>{m.round}</small>
                    </td>
                    <td>
                      <a
                        href={m.href ?? `#match-${m.id}`}
                        onClick={() => {
                          if (!m.href) setPhase(m.stage);
                        }}
                      >
                        {m.label ?? `#${m.id}`}
                      </a>
                      <small>{m.time}</small>
                      {m.roomOpenedAt && (
                        <small>
                          {tr("MP room opened")} · {m.roomOpenedAt}
                        </small>
                      )}
                      {m.status === "cancelled" && (
                        <small>{tr("Cancelled")}</small>
                      )}
                    </td>
                    <td>
                      {m.redHref ? <a href={m.redHref}>{m.red}</a> : m.red}
                    </td>
                    <td className="event-score">
                      {m.forfeit
                        ? m.winner === 0
                          ? `${tr("Winner")} : ${tr("Forfeit")}`
                          : `${tr("Forfeit")} : ${tr("Winner")}`
                        : (m.reviewScore ?? m.score)
                          ? (m.reviewScore ?? m.score)!.join(" : ")
                          : "—"}
                      {m.reviewScore && (
                        <small>{tr("Unconfirmed records")}</small>
                      )}
                    </td>
                    <td>
                      {m.blueHref ? <a href={m.blueHref}>{m.blue}</a> : m.blue}
                    </td>
                    <td>
                      {m.first
                        ? m.first === "red"
                          ? tr("Red team")
                          : tr("Blue team")
                        : "—"}
                    </td>
                    <td>{m.redBan ?? "—"}</td>
                    <td>{m.blueBan ?? "—"}</td>
                    <td>
                      {(m.mps ?? (m.mp ? [m.mp] : [])).length
                        ? (m.mps ?? [m.mp!]).map((url, index) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {m.mps
                                ? `MP ${index + 1}`
                                : `${url.split("/").at(-1)} ↗`}{" "}
                            </a>
                          ))
                        : "—"}
                    </td>
                    <td>
                      {m.vod ? (
                        <a href={m.vod} target="_blank" rel="noreferrer">
                          {tr("Recording")} ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{m.referee ?? "—"}</td>
                    <td>{m.streamer ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
