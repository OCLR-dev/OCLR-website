"use client";
import { useAppTranslations } from "@/i18n/shared";

import { useContext, useEffect, useRef, useState } from "react";
import type { DraftBoard, DraftIdentity } from "@/lib/draft-types";
import { Avatar } from "./avatar";
import { draftLabels } from "./draft-board";
import { RemoteReadOnlyContext } from "./staff-read-only";
import { usePoll } from "./use-poll";
import styles from "./broadcast-draft.module.css";

// Retractions always clear the display. A delayed older snapshot must not rewind it.
export function acceptBroadcastSnapshot(
  current: DraftBoard | null,
  next: DraftBoard | null,
) {
  return (
    !current ||
    !next ||
    current.sessionId !== next.sessionId ||
    next.version >= current.version
  );
}

export function shouldRevealPick(
  previous: DraftBoard | null,
  next: DraftBoard | null,
) {
  return newPublishedPicks(previous, next).length > 0;
}

/** A correction/retraction is never a reveal. Require a monotonic append of
 * unique pick IDs, not merely a changed latest player or version. */
export function newPublishedPicks(
  previous: DraftBoard | null,
  next: DraftBoard | null,
) {
  if (
    !previous ||
    !next ||
    previous.sessionId !== next.sessionId ||
    next.version <= previous.version ||
    next.state === "aborted" ||
    next.picks.length <= previous.picks.length ||
    new Set(next.picks.map((p) => p.id)).size !== next.picks.length ||
    !previous.picks.every((p, i) => next.picks[i]?.id === p.id)
  )
    return [];
  return next.picks.slice(previous.picks.length);
}

function Portrait({
  player,
  featured = false,
}: {
  player: DraftIdentity;
  featured?: boolean;
}) {
  return (
    <div
      className={featured ? styles.portrait : styles.smallPortrait}
      data-reveal={featured ? "avatar" : undefined}
    >
      <Avatar
        key={`${player.osuId}:${player.profile?.avatarUrl ?? "default"}`}
        osuId={player.osuId}
        username={player.username}
        avatarUrl={player.profile?.avatarUrl ?? undefined}
      />
    </div>
  );
}
const format = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );

export function BroadcastDraft({
  slug,
  name,
  initial,
  available,
  background,
}: {
  slug: string;
  name: string;
  initial: DraftBoard | null;
  available: boolean;
  background: "opaque" | "transparent";
}) {
  const tr = useAppTranslations();
  const remote = useContext(RemoteReadOnlyContext);

  const {
    value: board,
    connected,
    received,
  } = usePoll<DraftBoard>(`/api/tournaments/${slug}/draft?overlay=1`, initial, {
    accept: acceptBroadcastSnapshot,
    credentials: remote ? "same-origin" : "omit",
    initiallyConnected: available,
  });
  const previous = useRef(initial);
  const wasConnected = useRef(available);
  const wasReceived = useRef(false);
  const seen = useRef(new Set(initial?.picks.map((p) => p.id)));
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const suspended = useRef(false);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) suspended.current = true;
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    const old = previous.current;
    const continuous =
      connected &&
      wasConnected.current &&
      received &&
      wasReceived.current &&
      !suspended.current;
    const sameSession = old && board && old.sessionId === board.sessionId;
    if (!sameSession && board) seen.current.clear();
    const additions = continuous
      ? newPublishedPicks(old, board).filter((p) => !seen.current.has(p.id))
      : [];
    const animations: Animation[] = [];
    const motion =
      continuous &&
      sameSession &&
      board.version > old.version &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !document.hidden;
    function enter(el: Element | null | undefined, id: string, delay = 0) {
      if (el)
        animations.push(
          el.animate(
            [
              { opacity: 0.25, transform: "translateY(12px) scale(.985)" },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ],
            { id, duration: 480, delay, easing: "cubic-bezier(.2,.8,.2,1)" },
          ),
        );
    }
    if (motion) {
      if (additions.length) {
        root.current
          ?.querySelectorAll("[data-reveal]")
          .forEach((el, i) => enter(el, "oclr-pick", i * 65));
        root.current
          ?.querySelectorAll<HTMLElement>("[data-history-pick]")
          .forEach((el) => {
            if (additions.some((p) => p.id === el.dataset.historyPick))
              enter(el, "oclr-history");
            else {
              const before = positions.current.get(el.dataset.historyPick!);
              if (before !== undefined) {
                const delta = before - el.getBoundingClientRect().top;
                if (delta)
                  animations.push(
                    el.animate(
                      [
                        { transform: `translateY(${delta}px)` },
                        { transform: "translateY(0)" },
                      ],
                      {
                        id: "oclr-history-move",
                        duration: 400,
                        easing: "ease-out",
                      },
                    ),
                  );
              }
            }
          });
        root.current
          ?.querySelectorAll<HTMLElement>("[data-roster-player]")
          .forEach((el) => {
            if (
              additions.some(
                (p) =>
                  String(p.player.osuId) === el.dataset.rosterPlayer &&
                  p.team.id === el.dataset.team,
              )
            )
              enter(el, "oclr-roster", 150);
          });
      }
      // Corrections update immediately; ordinary turn and status transitions settle softly.
      if (
        board.picks.length >= old.picks.length &&
        old.picks.every((p, i) => board.picks[i]?.id === p.id)
      ) {
        if (
          old.activeTeam?.id !== board.activeTeam?.id ||
          old.turnIndex !== board.turnIndex ||
          old.state !== board.state
        )
          enter(root.current?.querySelector("[data-turn-card]"), "oclr-turn");
        if (old.state !== board.state)
          enter(
            root.current?.querySelector("[data-live-status]"),
            "oclr-status",
          );
      }
    }
    positions.current = new Map(
      Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-history-pick]") ??
          [],
      ).map((el) => [el.dataset.historyPick!, el.getBoundingClientRect().top]),
    );
    board?.picks.forEach((p) => seen.current.add(p.id));
    previous.current = board;
    wasConnected.current = connected;
    wasReceived.current = received;
    if (connected && board !== old) suspended.current = false;
    return () => animations.forEach((a) => a.cancel());
  }, [board, connected, received]);
  const latest = board?.picks.at(-1);
  const [rosterPage, setRosterPage] = useState<{
    key: string;
    page: number;
  } | null>(null);
  const rosterKey = `${board?.sessionId}:${board?.activeTeam?.id ?? "complete"}`;
  const pageCount = Math.ceil((board?.rosters.length ?? 0) / 2);
  const activeIndex =
    board?.rosters.findIndex((r) => r.team.id === board.activeTeam?.id) ?? -1;
  const rosterIndex = Math.min(
    Math.max(0, pageCount - 1),
    rosterPage?.key === rosterKey
      ? rosterPage.page
      : Math.max(0, Math.floor(activeIndex / 2)),
  );
  const visibleRosters =
    board?.rosters.slice(rosterIndex * 2, rosterIndex * 2 + 2) ?? [];
  const complete = board?.state === "completed" || board?.state === "finalized";
  return (
    <div
      className={styles.broadcast}
      ref={root}
      data-broadcast
      data-background={background}
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          OCLR<span>osu! Chinese League Rookie</span>
        </div>
        <div className={styles.heading}>
          <p className="eyebrow">{tr("CAPTAIN DRAFT")}</p>
          <h1>{name}</h1>
        </div>
        <div className={styles.status}>
          <strong data-live-status data-state={board?.state ?? "waiting"}>
            {board
              ? tr(draftLabels[board.state])
              : tr("Awaiting published draft")}
          </strong>
          <p role="status">
            {connected
              ? tr("Connected · updates every 2s")
              : tr("Reconnecting · last published state")}
          </p>
        </div>
      </header>

      <div className={styles.stage}>
        <section
          className={styles.selection}
          data-featured
          aria-label={tr("Latest published selection")}
        >
          <p className="eyebrow">
            {latest
              ? tr("PICK {value0} / SELECTED", {
                  value0: String(latest.turnIndex + 1).padStart(2, "0"),
                })
              : tr("THE NEXT TEAM STORY")}
          </p>
          <div
            className={styles.featured}
            aria-live="polite"
            aria-atomic="true"
          >
            {latest && <Portrait player={latest.player} featured />}
            <div className={styles.identity}>
              <h2 data-reveal="name">
                {latest?.player.username ?? tr("The stage is ready.")}
              </h2>
              {latest ? (
                <>
                  <dl
                    className={styles.statistics}
                    data-reveal="stats"
                    data-profile-status={
                      latest.player.profile?.status ?? "loading"
                    }
                  >
                    <div>
                      <dt>
                        PP <small>{"osu!standard"}</small>
                      </dt>
                      <dd>
                        {format(latest.player.profile?.pp)} <small>pp</small>
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {tr("Global rank")}
                        {latest.player.profile?.status !== "fresh" && (
                          <small className={styles.profileNotice}>
                            {latest.player.profile?.status === "unavailable"
                              ? tr("Unavailable")
                              : tr("Loading…")}
                          </small>
                        )}
                      </dt>
                      <dd>
                        {latest.player.profile?.globalRank != null
                          ? `#${format(latest.player.profile.globalRank)}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div data-reveal="team">
                    <p className={styles.destination}>{latest.team.name}</p>
                    <p className={styles.caption}>
                      {tr("Selected by Captain ")}
                      {latest.team.captain.username}
                    </p>
                  </div>
                </>
              ) : (
                <p className={styles.caption}>
                  {tr("Selections appear here when published.")}
                </p>
              )}
            </div>
          </div>
        </section>
        <section
          className={styles.turn}
          data-turn-card
          aria-label={tr("Current published captain turn")}
        >
          <p className="eyebrow">
            {complete
              ? tr("DRAFT COMPLETE")
              : board?.state === "paused"
                ? tr("ON HOLD")
                : tr("CURRENT TURN")}
          </p>
          <h2>
            {board?.activeTeam?.name ??
              (complete
                ? tr("Teams assembled.")
                : tr("Waiting for the next stage."))}
          </h2>
          {board?.activeTeam && (
            <p className={styles.caption}>
              {tr("Captain ")}
              {board.activeTeam.captain.username}
            </p>
          )}
          <div className={styles.progress}>
            <span>
              {board?.turnCount
                ? `${Math.min(board.turnIndex + (complete ? 0 : 1), board.turnCount)} / ${board.turnCount}`
                : "—"}
            </span>
            <p>
              {complete
                ? tr("Configured picks completed")
                : tr("Configured pick order")}
            </p>
          </div>
        </section>
      </div>

      <div className={styles.details}>
        <section
          className={styles.rosters}
          data-rosters
          aria-label={tr("Published roster progress")}
          tabIndex={0}
        >
          <div className={styles.rosterHeading}>
            <h2>{tr("Team rosters ")}</h2>
            {pageCount > 1 && (
              <div className={styles.pages}>
                <button
                  type="button"
                  aria-label={tr("Previous teams")}
                  disabled={rosterIndex === 0}
                  onClick={() =>
                    setRosterPage({ key: rosterKey, page: rosterIndex - 1 })
                  }
                >
                  ←
                </button>
                <span>
                  {rosterIndex * 2 + 1}–
                  {Math.min(rosterIndex * 2 + 2, board!.rosters.length)} /{" "}
                  {board!.rosters.length}
                </span>
                <button
                  type="button"
                  aria-label={tr("Next teams")}
                  disabled={rosterIndex === pageCount - 1}
                  onClick={() =>
                    setRosterPage({ key: rosterKey, page: rosterIndex + 1 })
                  }
                >
                  →
                </button>
              </div>
            )}
          </div>
          {board?.rosters.length ? (
            <div className={styles.rosterGrid}>
              {visibleRosters.map(({ team, players }) => (
                <article
                  key={team.id}
                  data-active={board.activeTeam?.id === team.id}
                >
                  <h3>{team.name}</h3>
                  <p className={styles.caption}>
                    {tr("Captain ")}
                    {team.captain.username}
                  </p>
                  <p className={styles.count}>
                    {players.length}{" "}
                    {players.length === 1 ? tr("player") : tr("players")}
                  </p>
                  <ul data-dense={players.length > 6}>
                    {players.map((player) => (
                      <li
                        key={player.osuId}
                        data-roster-player={player.osuId}
                        data-team={team.id}
                      >
                        <Portrait player={player} />
                        <span title={player.username}>{player.username}</span>
                        {player.osuId === team.captain.osuId && (
                          <small>{tr("Captain")}</small>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.caption}>
              {tr("Team rosters have not been published.")}
            </p>
          )}
        </section>
        <section
          className={styles.history}
          data-history
          aria-label={tr("Recent published selections")}
          tabIndex={0}
        >
          <h2>{tr("Recent picks")}</h2>
          {board?.picks.length ? (
            <ol>
              {board.picks
                .slice(-5)
                .reverse()
                .map((pick) => (
                  <li key={pick.id} data-history-pick={pick.id}>
                    <span className={styles.pickNumber}>
                      {String(pick.turnIndex + 1).padStart(2, "0")}
                    </span>
                    <Portrait player={pick.player} />
                    <div>
                      <strong>{pick.player.username}</strong>
                      <p>
                        {pick.team.name} {tr(" · Captain ")}
                        {pick.team.captain.username}
                      </p>
                    </div>
                  </li>
                ))}
            </ol>
          ) : (
            <p className={styles.caption}>
              {tr("No selections published yet.")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
