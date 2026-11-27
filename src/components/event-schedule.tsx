"use client";
import "../app/tournaments/[edition]/event-pages.css";
import { selectFragment, useUrlFragment } from "./url-fragment";
import { useEffect, useState, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { BracketDisplay, BracketDisplayMatch } from "@/lib/bracket-model";
import type { EventMatch } from "@/lib/event-preview";
import type { PublicGroup } from "@/lib/public-competition";
import { BracketColumns } from "./bracket-columns";
import { GroupStandings } from "./public-matches";
export function EventSchedule({
  matches,
  groups = [],
  edition,
  phases,
  heading = true,
  timeZone,
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
  const stages = new Set(matches.map((match) => match.stage));
  const hasExhibition = stages.has("exhibition");
  const phaseOptions = phases ?? [
    { id: "group", label: tr("Group stage / Swiss") },
    { id: "knockout", label: tr("Double elimination") },
    ...(hasExhibition ? [{ id: "exhibition", label: tr("Exhibition") }] : []),
  ];
  function openingPhase() {
    if (phases) return phases[0]?.id ?? "";
    if (hasExhibition && stages.size === 1) return "exhibition";
    if (groups.length) return "group";
    return phaseOptions.find(({ id }) => stages.has(id))?.id ?? "group";
  }
  const fragment = useUrlFragment();
  const linkedMatch = matches.find(
    (match) =>
      fragment === `#match-${match.id}` || fragment === `#row-${match.id}`,
  );
  const phase =
    linkedMatch?.stage ??
    phaseOptions.find(
      (option) => fragment === `#${encodeURIComponent(option.id)}`,
    )?.id ??
    openingPhase();
  useEffect(() => {
    if (linkedMatch && fragment.startsWith("#match-"))
      document
        .getElementById(fragment.slice(1))
        ?.scrollIntoView({ block: "nearest" });
  }, [fragment, linkedMatch]);
  const [status, setStatus] = useState(initialStatus);
  const listed = matches.filter(
    (m) => status === "all" || m.recorded === (status === "recorded"),
  );
  const [filter, setFilter] = useState("");
  const selected = listed.filter((m) => m.stage === phase);
  const columns = [
    tr("Mappool"),
    tr("Match time"),
    tr("Red team"),
    tr("Score"),
    tr("Blue team"),
    tr("Match result"),
    tr("First pick"),
    tr("Red bans"),
    tr("Blue bans"),
    tr("MPLink"),
    tr("Recording"),
    tr("Referee"),
    tr("Streamer"),
  ];
  function matchName(match: EventMatch) {
    return match.label || `${match.red} ${tr("vs")} ${match.blue}`;
  }

  function matchRounds() {
    type Round = BracketDisplay["groups"][number]["rounds"][number];
    const roundsById = new Map<string, Round>();
    const matchIds = new Set(selected.map((match) => match.id));
    for (const match of selected) {
      const id = match.roundId ?? match.round;
      const round = roundsById.get(id) ?? {
        id,
        label: match.round,
        matches: [],
      };
      const slot = (
        index: 0 | 1,
        label: string,
      ): BracketDisplayMatch["slots"][number] => {
        const side = match.sides?.[index];
        const team = side?.team;
        const previewSource = index === 0 ? match.sourceRed : match.sourceBlue;
        const previewSourceId =
          previewSource && matchIds.has(previewSource) ? previewSource : null;
        return {
          teamId: team?.exhibition ? null : (team?.id ?? null),
          avatarKey: team?.avatarKey,
          label,
          sourceMatchId: side?.sourceId ?? previewSourceId,
          groupSeed: previewSourceId === null ? previewSource : undefined,
          kind: side?.outcome ?? (team ? "team" : "tba"),
        };
      };
      round.matches.push({
        id: match.id,
        label: matchName(match),
        status: match.score ? "completed" : "pending",
        statusLabel:
          match.status === "cancelled"
            ? tr("Cancelled")
            : match.status === "ended"
              ? tr("Ended")
              : !match.score && match.status === "in_progress"
                ? tr("In progress")
                : undefined,
        slots: [slot(0, match.red), slot(1, match.blue)],
        scores: match.score ?? [null, null],
        winnerSlot: match.winner ?? null,
        note: match.record ?? null,
        detailsUrl:
          match.href ?? (!match.sides ? `#row-${match.id}` : undefined),
        scheduledTime:
          match.time !== "—" && match.status !== "cancelled"
            ? match.time
            : undefined,
      });
      roundsById.set(id, round);
    }
    return (
      <BracketColumns
        key={phase}
        bracket={{
          editionSlug: edition,
          groups: [
            {
              id: phase,
              label:
                phaseOptions.find((option) => option.id === phase)?.label ??
                phase,
              layout: phase === "knockout" ? undefined : "grid",
              rounds: [...roundsById.values()],
            },
          ],
        }}
        hideGroupTabs
      />
    );
  }

  return (
    <div className="event-schedule">
      {heading && (
        <div className="event-section-heading">
          <h1>{tr("Schedule")}</h1>
          {timeZone && <span>{timeZone}</span>}
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
                onClick={() =>
                  selectFragment(`#${encodeURIComponent(option.id)}`)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {selected.length ? (
            matchRounds()
          ) : (
            <p className="event-schedule-empty muted">
              {tr("No matches in this view.")}
            </p>
          )}
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
                      <time>{m.time}</time>
                      {m.roomOpenedAt && (
                        <small>
                          {tr("MP room opened")} · {m.roomOpenedAt}
                        </small>
                      )}
                      {m.status === "cancelled" && (
                        <small>{tr("Cancelled")}</small>
                      )}
                      {m.status === "ended" && <small>{tr("Ended")}</small>}
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
                      <a href={m.href ?? `#match-${m.id}`}>{matchName(m)}</a>
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
