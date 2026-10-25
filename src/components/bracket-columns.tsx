"use client";

import { TeamAvatar } from "./team-avatar";
import { useAppTranslations } from "@/i18n/shared";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ResolvedBracket, ResolvedMatch } from "@/lib/bracket-model";
export function BracketColumns({
  bracket,
  renderMatch,
  teamUrls,
  hideGroupTabs = false,
}: {
  bracket: ResolvedBracket;
  hideGroupTabs?: boolean;
  teamUrls?: Record<string, string>;
  renderMatch?: (match: ResolvedMatch) => ReactNode;
}) {
  const tr = useAppTranslations();

  const [groupId, setGroup] = useState(bracket.groups[0].id);
  const frame = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{
    width: number;
    height: number;
    paths: string[];
  }>({ width: 0, height: 0, paths: [] });
  const group =
    bracket.groups.find((g) => g.id === groupId) ?? bracket.groups[0];
  const flat = group.layout === "grid";
  useEffect(() => {
    const node = frame.current;
    if (!node || flat) return;
    const observer = new ResizeObserver(() => {
      const origin = node.getBoundingClientRect();
      const cards = new Map(
        [...node.querySelectorAll<HTMLElement>("[data-match-id]")].map((el) => [
          el.dataset.matchId!,
          el,
        ]),
      );
      const paths: string[] = [];
      for (const round of group.rounds)
        for (const match of round.matches)
          for (const [index, slot] of match.slots.entries()) {
            const source = slot.sourceMatchId
              ? cards.get(slot.sourceMatchId)
              : null;
            const target = cards
              .get(match.id)
              ?.querySelectorAll("[data-bracket-slot]")[index];
            if (!source || !target) continue;
            const a = source.getBoundingClientRect();
            const b = target.getBoundingClientRect();
            const x1 = a.right - origin.left;
            const y1 = a.top + a.height / 2 - origin.top;
            const x2 = b.left - origin.left;
            const y2 = b.top + b.height / 2 - origin.top;
            const middle = (x1 + x2) / 2;
            paths.push(`M${x1},${y1} H${middle} V${y2} H${x2}`);
          }
      setLines({ width: node.scrollWidth, height: node.scrollHeight, paths });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [group, flat]);
  return (
    <>
      {!renderMatch && !hideGroupTabs && (
        <div
          className="bracket-tabs"
          role="group"
          aria-label={tr("Bracket sections")}
        >
          {bracket.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={g.id === group.id ? "" : "secondary"}
              aria-pressed={g.id === group.id}
              onClick={() => setGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
      {!flat && (
        <p className="muted small">
          {renderMatch
            ? tr(
                "Scroll across rounds. Switch to Schedule for a chronological list.",
              )
            : tr("Scroll across rounds.")}
        </p>
      )}
      <div
        className={`bracket-scroll${flat ? " bracket-group-scroll" : ""}`}
        role="region"
        aria-label={
          flat
            ? group.label
            : tr("{value0} bracket; scroll horizontally", {
                value0: group.label,
              })
        }
        tabIndex={0}
      >
        <div
          className={`bracket-frame${flat ? " bracket-group-grid" : ""}`}
          ref={frame}
        >
          {!flat && (
            <svg
              className="bracket-connectors"
              width={lines.width}
              height={lines.height}
              aria-hidden="true"
            >
              {lines.paths.map((path, i) => (
                <path key={i} d={path} />
              ))}
            </svg>
          )}
          {group.rounds.map((round) => (
            <section
              className="bracket-round"
              key={round.id}
              aria-labelledby={`round-${group.id}-${round.id}`}
            >
              <h2 id={`round-${group.id}-${round.id}`}>{round.label}</h2>
              <div className="round-matches">
                {round.matches.map((match) => (
                  <article
                    data-match-id={match.id}
                    className="match-card"
                    key={match.id}
                    aria-labelledby={`match-${match.id}`}
                  >
                    {renderMatch ? (
                      renderMatch(match)
                    ) : (
                      <>
                        <div className="match-meta">
                          <h3 id={`match-${match.id}`}>{match.label}</h3>
                          <span>
                            {match.status === "completed"
                              ? tr("Completed")
                              : tr("Pending")}
                          </span>
                        </div>
                        {match.slots.map((slot, index) => (
                          <div
                            key={index}
                            data-bracket-slot
                            className={`match-slot ${match.winnerSlot === index ? "match-winner" : match.status === "completed" && match.winnerSlot !== null ? "match-loser" : ""}`}
                          >
                            <span>
                              {slot.teamId ? (
                                <Link
                                  href={
                                    teamUrls?.[slot.teamId] ??
                                    `/tournaments/${bracket.editionSlug}/teams/${slot.teamId}`
                                  }
                                >
                                  <TeamAvatar
                                    team={{
                                      id: slot.teamId,
                                      name: slot.label,
                                      avatarKey: slot.avatarKey,
                                    }}
                                  />{" "}
                                  {slot.label}
                                </Link>
                              ) : (
                                slot.label
                              )}
                              {match.winnerSlot === index && (
                                <span className="sr-only">
                                  {" "}
                                  {tr(" (winner)")}
                                </span>
                              )}
                            </span>
                            <strong
                              aria-label={tr("Score {value0}", {
                                value0: match.scores[index] ?? "unreported",
                              })}
                            >
                              {match.scores[index] ?? "—"}
                            </strong>
                          </div>
                        ))}
                        {match.note && (
                          <p className="match-note">{match.note}</p>
                        )}
                        {match.detailsUrl && (
                          <p className="match-note">
                            <Link className="text-link" href={match.detailsUrl}>
                              {tr("Match details")}
                            </Link>
                          </p>
                        )}
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
