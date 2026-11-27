"use client";
import Image from "next/image";
import { useAppTranslations } from "@/i18n/shared";

import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import type {
  BroadcastBoard,
  DraftBoard,
  DraftIdentity,
} from "@/lib/draft-types";
import { Avatar } from "./avatar";
import {
  copyPickLayers,
  transitionPickLayers,
} from "./broadcast-pick-transition";
import { DraftTierBadge } from "./draft-tier-badge";
import { BroadcastRatingRadars } from "./player-rating-radar";
import { RemoteReadOnlyContext } from "./staff-read-only";
import { usePoll } from "./use-poll";
import styles from "./broadcast-draft.module.css";

const liruPoses = [
  "01-wave",
  "02-ready",
  "03-wink",
  "04-cheer",
  "05-thumbs-up",
  "06-listen",
  "07-surprise",
  "08-think",
  "09-high-five",
  "10-bow",
];

function LiruRotation({ position }: { position: "header" | "selection" }) {
  return (
    <div
      className={styles.liruRotation}
      data-liru-position={position}
      aria-hidden="true"
    >
      {liruPoses.map((pose, index) => (
        <Image
          key={pose}
          src={`/mascot/liru/draft/${pose}.png`}
          alt=""
          fill
          sizes={
            position === "header"
              ? "(max-width: 733px) 44px, 6vw"
              : "(max-width: 600px) 45vw, 30vw"
          }
          unoptimized
          style={{ animationDelay: `${index * 6 - 0.4}s` }}
        />
      ))}
    </div>
  );
}

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

function cancelBroadcastTransitions(overlay: HTMLDivElement | null) {
  for (const animation of overlay?.getAnimations({ subtree: true }) ?? []) {
    if (animation.id.startsWith("oclr-")) animation.cancel();
  }
  overlay
    ?.querySelectorAll("[data-outgoing-pick]")
    .forEach((layer) => layer.remove());
}

function Portrait({
  player,
  featured = false,
}: {
  player: DraftIdentity;
  featured?: boolean;
}) {
  return (
    <div className={featured ? styles.portrait : styles.smallPortrait}>
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
  const pickLayers = useRef<ReturnType<typeof copyPickLayers>>(undefined);
  const positions = useRef(new Map<string, number>());
  const suspended = useRef(false);
  useEffect(() => {
    const overlay = root.current;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const hide = () => {
      if (document.hidden) {
        suspended.current = true;
        cancelBroadcastTransitions(overlay);
      }
    };
    const reduce = () => {
      if (preference.matches) cancelBroadcastTransitions(overlay);
    };
    document.addEventListener("visibilitychange", hide);
    preference.addEventListener("change", reduce);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      preference.removeEventListener("change", reduce);
      cancelBroadcastTransitions(overlay);
    };
  }, []);
  useLayoutEffect(() => {
    const overlay = root.current;
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
    const newRevision = sameSession && board.version > old.version;
    if (!continuous || !sameSession || newRevision)
      cancelBroadcastTransitions(overlay);
    const motion =
      continuous &&
      newRevision &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !document.hidden;
    function enter(
      el: Element | null | undefined,
      id: string,
      opacity: number,
    ) {
      el?.animate([{ opacity }, { opacity: 1 }], {
        id,
        duration: 360,
        easing: "ease-out",
      });
    }
    if (motion) {
      if (additions.length) {
        if (overlay) transitionPickLayers(overlay, pickLayers.current);
        overlay
          ?.querySelectorAll<HTMLElement>("[data-history-pick]")
          .forEach((el) => {
            if (additions.some((p) => p.id === el.dataset.historyPick))
              enter(el, "oclr-history", 0.4);
            else {
              const before = positions.current.get(el.dataset.historyPick!);
              if (before !== undefined) {
                const delta = before - el.offsetTop;
                if (delta)
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
                  );
              }
            }
          });
      }
      // Corrections update immediately; ordinary turn transitions settle softly.
      if (
        board.picks.length >= old.picks.length &&
        old.picks.every((p, i) => board.picks[i]?.id === p.id)
      ) {
        if (
          old.activeTeam?.id !== board.activeTeam?.id ||
          old.turnIndex !== board.turnIndex ||
          old.state !== board.state
        )
          enter(overlay?.querySelector("[data-turn-card]"), "oclr-turn", 0.85);
      }
    }
    positions.current = new Map(
      Array.from(
        overlay?.querySelectorAll<HTMLElement>("[data-history-pick]") ?? [],
      ).map((el) => [el.dataset.historyPick!, el.offsetTop]),
    );
    pickLayers.current =
      overlay && board?.picks.length ? copyPickLayers(overlay) : undefined;
    board?.picks.forEach((p) => seen.current.add(p.id));
    previous.current = board;
    wasConnected.current = connected;
    wasReceived.current = received;
    if (connected && board !== old) suspended.current = false;
  }, [board, connected, received]);
  const latest = board?.picks.at(-1);
  const seasonEleven = slug === "s11" || slug === "dev-s11";
  const waitingForFirstPick = !latest && board?.state === "live";
  const showFirstPickHeadline = seasonEleven && waitingForFirstPick;
  const showHeaderLiru =
    seasonEleven &&
    latest !== undefined &&
    (board?.state === "live" || board?.state === "paused");
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
      {background === "opaque" && (
        <div className={styles.starlight} aria-hidden="true" />
      )}
      <header className={styles.header}>
        <div className={styles.branding}>
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
          <h1>{tr("Draft Day")}</h1>
        </div>
        <section
          className={styles.streamChat}
          aria-label={tr("Live stream chat")}
        >
          {showHeaderLiru && <LiruRotation position="header" />}
          <div className={styles.streamChatSlot} data-stream-chat-slot />
        </section>
      </header>

      <div className={styles.stage}>
        <section
          className={styles.selection}
          data-featured
          data-first-pick-waiting={showFirstPickHeadline || undefined}
          aria-label={tr("Latest published selection")}
        >
          {!showFirstPickHeadline && (
            <div className={styles.selectionHeading} data-pick-heading>
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
            data-pick-player
            aria-live="polite"
            aria-atomic="true"
          >
            {latest && <Portrait player={latest.player} featured />}
            <div className={styles.identity}>
              <h2
                className={showFirstPickHeadline ? styles.firstPick : undefined}
              >
                {latest?.player.username ??
                  (showFirstPickHeadline
                    ? tr("Starting soon...")
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
                  <p className={styles.destination}>{latest.team.name}</p>
                </>
              ) : null}
            </div>
          </div>
          {showFirstPickHeadline && <LiruRotation position="selection" />}
        </section>
        <section
          className={styles.turn}
          data-turn-card
          data-state={board?.state ?? "waiting"}
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
