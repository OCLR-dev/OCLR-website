"use client";
import Image from "next/image";
import { useAppTranslations } from "@/i18n/shared";

import { useContext, useEffect, useRef } from "react";
import type {
  BroadcastBoard,
  DraftBoard,
  DraftIdentity,
} from "@/lib/draft-types";
import { Avatar } from "./avatar";
import { DraftTierBadge } from "./draft-tier-badge";
import { BroadcastRatingRadars } from "./player-rating-radar";
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
  initial,
  available,
  background,
}: {
  slug: string;
  initial: BroadcastBoard | null;
  available: boolean;
  background: "opaque" | "transparent";
}) {
  const tr = useAppTranslations();
  const remote = useContext(RemoteReadOnlyContext);

  const {
    value: board,
    connected,
    received,
  } = usePoll<BroadcastBoard>(
    `/api/tournaments/${slug}/draft?overlay=1`,
    initial,
    {
      accept: acceptBroadcastSnapshot,
      credentials: remote ? "same-origin" : "omit",
      initiallyConnected: available,
      refreshBroadcastProfile: true,
    },
  );
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
  const seasonEleven = slug === "s11" || slug === "dev-s11";
  const waitingForFirstPick = !latest && board?.state === "live";
  const showFirstPickHeadline = seasonEleven && waitingForFirstPick;
  const ratings = latest?.ratings;
  const ratingNumber = new Intl.NumberFormat(tr.locale, {
    maximumFractionDigits: 2,
  });
  const etxNumber = new Intl.NumberFormat(tr.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
          {seasonEleven ? (
            <Image
              src="/branding/oclr-s11-logo.svg"
              alt="OCLR S11"
              width={1200}
              height={490}
              unoptimized
            />
          ) : (
            <>
              OCLR<span>osu! Chinese League Rookie</span>
            </>
          )}
        </div>
        <div className={styles.heading}>
          <h1>{tr("Draft Day")}</h1>
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
          {!showFirstPickHeadline && (
            <div className={styles.selectionHeading}>
              <p className={styles.stageLabel}>
                {latest
                  ? latest.roundPosition
                    ? tr(
                        "Round {round} · Pick {position} · Overall pick {overall}",
                        {
                          ...latest.roundPosition,
                          overall: latest.turnIndex + 1,
                        },
                      )
                    : tr("Overall pick {overall}", {
                        overall: latest.turnIndex + 1,
                      })
                  : tr("Latest published selection")}
              </p>
              {latest?.tier ? (
                <DraftTierBadge
                  tier={latest.tier}
                  className={styles.featuredTier}
                />
              ) : null}
            </div>
          )}
          <div
            className={styles.featured}
            aria-live="polite"
            aria-atomic="true"
          >
            {latest && <Portrait player={latest.player} featured />}
            <div className={styles.identity}>
              <h2
                data-reveal="name"
                className={showFirstPickHeadline ? styles.firstPick : undefined}
              >
                {latest?.player.username ??
                  (showFirstPickHeadline
                    ? tr("The OCLR S11 first overall pick is...")
                    : tr("No picks published yet."))}
              </h2>
              {latest ? (
                <>
                  {latest.careerAppearance && (
                    <p className={styles.appearance}>
                      {latest.careerAppearance === 1
                        ? tr("First OCLR appearance")
                        : tr("OCLR appearance {count}", {
                            count: latest.careerAppearance,
                          })}
                    </p>
                  )}
                  <dl
                    className={styles.statistics}
                    data-reveal="stats"
                    data-profile-status={
                      latest.player.profile?.status ?? "loading"
                    }
                  >
                    <div>
                      <dt>PP</dt>
                      <dd>{format(latest.player.profile?.pp)}</dd>
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
                    <div>
                      <dt>o!TR</dt>
                      <dd>
                        {ratings?.otr == null
                          ? "—"
                          : ratingNumber.format(ratings.otr)}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("SIP")}</dt>
                      <dd>
                        {ratings?.sip == null
                          ? "—"
                          : ratingNumber.format(ratings.sip)}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("ETX")}</dt>
                      <dd>
                        {ratings?.etx == null
                          ? "—"
                          : etxNumber.format(ratings.etx)}
                      </dd>
                    </div>
                  </dl>
                  <p data-reveal="team" className={styles.destination}>
                    {latest.team.name}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>
        <section
          className={styles.turn}
          data-turn-card
          aria-label={tr("Current published captain turn")}
        >
          <p className={styles.stageLabel}>
            {complete
              ? tr("DRAFT COMPLETE")
              : board?.state === "paused"
                ? tr("ON HOLD")
                : tr("Next pick")}
          </p>
          <h2>
            {board?.activeTeam?.name ??
              (complete
                ? tr("Teams assembled.")
                : tr("Waiting for the next stage."))}
          </h2>
          {board?.activeRound && (
            <p className={styles.round}>
              {tr("Round {round} · Pick {position}", board.activeRound)}
            </p>
          )}
          <div className={styles.progress}>
            <span>
              {board?.turnCount
                ? `${Math.min(board.turnIndex + (complete ? 0 : 1), board.turnCount)} / ${board.turnCount}`
                : "—"}
            </span>
            <p>{tr("Overall pick order")}</p>
          </div>
        </section>
      </div>

      <div className={styles.details}>
        <section
          className={styles.ratings}
          data-ratings
          aria-labelledby="broadcast-ratings-heading"
        >
          <h2 id="broadcast-ratings-heading">{tr("Player ratings")}</h2>
          {latest ? (
            <BroadcastRatingRadars ratings={ratings} />
          ) : (
            <p className={styles.caption}>
              {waitingForFirstPick
                ? tr("Draft in progress...")
                : tr("No rating data")}
            </p>
          )}
        </section>
        <section
          className={styles.history}
          data-history
          aria-labelledby="broadcast-results-heading"
          tabIndex={0}
        >
          <h2 id="broadcast-results-heading">{tr("Recent draft results")}</h2>
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
                      <p>{pick.team.name}</p>
                    </div>
                    {pick.tier ? <DraftTierBadge tier={pick.tier} /> : null}
                  </li>
                ))}
            </ol>
          ) : (
            <p className={styles.caption}>
              {waitingForFirstPick
                ? tr("Draft in progress...")
                : tr("No selections published yet.")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
