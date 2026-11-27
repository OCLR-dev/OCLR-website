"use client";
import Image from "next/image";
import { useAppTranslations } from "@/i18n/shared";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  BroadcastBoard,
  DraftBoard,
  DraftIdentity,
} from "@/lib/draft-types";
import { Avatar } from "./avatar";
import {
  captureBroadcastScene,
  createBroadcastMotion,
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
    !previous.picks.every((pick, index) => {
      const current = next.picks[index];
      return (
        current?.id === pick.id &&
        current.turnIndex === pick.turnIndex &&
        current.player.osuId === pick.player.osuId &&
        current.team.id === pick.team.id &&
        ("tier" in current ? current.tier : undefined) ===
          ("tier" in pick ? pick.tier : undefined)
      );
    })
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
      data-feature-part={featured ? "portrait" : undefined}
    >
      <Avatar
        key={`${player.osuId}:${player.profile?.avatarUrl ?? "default"}`}
        osuId={player.osuId}
        username={player.username}
        avatarUrl={player.profile?.avatarUrl ?? undefined}
      />
      {featured && (
        <span
          className={styles.partGlow}
          data-part-glow="portrait"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
const format = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );

function MotionNumber({
  id,
  value,
  text,
}: {
  id: string;
  value?: number | null;
  text: string;
}) {
  return (
    <dd className={styles.motionStat}>
      <span className={styles.statMeasure} aria-hidden="true">
        {text}
      </span>
      <span
        data-motion-number={id}
        data-value={value ?? undefined}
        data-value-text={text}
      >
        {text}
      </span>
    </dd>
  );
}

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
  const scene = useRef<ReturnType<typeof captureBroadcastScene>>(undefined);
  const [motion] = useState(createBroadcastMotion);
  const suspended = useRef(false);
  const locale = tr.locale;
  useEffect(() => {
    const overlay = root.current;
    if (!overlay) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      motion.stop(overlay);
      motion.sync(overlay);
    };
    const visibility = () => {
      if (document.hidden) {
        suspended.current = true;
        settle();
      }
    };
    const reduce = () => {
      if (preference.matches) settle();
    };
    document.addEventListener("visibilitychange", visibility);
    preference.addEventListener("change", reduce);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", reduce);
      motion.stop(overlay);
    };
  }, [motion]);
  useLayoutEffect(() => {
    const overlay = root.current;
    if (!overlay) return;
    const old = previous.current;
    const continuous =
      connected &&
      wasConnected.current &&
      received &&
      wasReceived.current &&
      !suspended.current &&
      !document.hidden;
    const sameSession = old && board && old.sessionId === board.sessionId;
    if (!sameSession && board) seen.current.clear();
    const additions =
      continuous && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? newPublishedPicks(old, board).filter(
            (pick) => !seen.current.has(pick.id),
          )
        : [];
    if (additions.length && board) {
      const previousPick = old?.picks.at(-1);
      motion.reveal(
        overlay,
        scene.current,
        locale,
        previousPick?.tier === board.picks.at(-1)?.tier,
        old?.activeTeam?.id === board.activeTeam?.id,
      );
    } else if (
      !continuous ||
      !sameSession ||
      old.version !== board.version ||
      !board ||
      !motion.running
    ) {
      motion.stop(overlay);
      motion.sync(overlay);
    }
    scene.current = board ? captureBroadcastScene(overlay) : undefined;
    board?.picks.forEach((pick) => seen.current.add(pick.id));
    previous.current = board;
    wasConnected.current = connected;
    wasReceived.current = received;
    if (connected && received && board !== old && !document.hidden)
      suspended.current = false;
  }, [board, connected, received, locale, motion]);
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
  const order = board?.turnCount
    ? Math.min(board.turnIndex + (complete ? 0 : 1), board.turnCount)
    : null;
  const selecting =
    connected && board?.state === "live" && board.activeTeam != null;
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
          <span
            className={styles.borderGlow}
            data-border-glow
            aria-hidden="true"
          />
          <span
            className={styles.starSweep}
            data-star-sweep
            aria-hidden="true"
          />
          <div className={styles.featureViewport}>
            <div data-pick-feature>
              {!showFirstPickHeadline && (
                <div className={styles.selectionHeading}>
                  <p
                    className={styles.stageLabel}
                    data-feature-part={latest ? "heading" : undefined}
                  >
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
                    <div className={styles.tierFrame} data-feature-tier>
                      <DraftTierBadge
                        tier={latest.tier}
                        className={styles.featuredTier}
                      />
                      <span
                        className={styles.partGlow}
                        data-part-glow="tier"
                        aria-hidden="true"
                      />
                    </div>
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
                    data-feature-part={latest ? "name" : undefined}
                    className={
                      showFirstPickHeadline ? styles.firstPick : undefined
                    }
                  >
                    {latest?.player.username ??
                      (showFirstPickHeadline
                        ? tr("Starting soon...")
                        : tr("No picks published yet."))}
                  </h2>
                  {latest ? (
                    <>
                      {latest.careerAppearance && (
                        <p
                          className={styles.appearance}
                          data-feature-part="appearance"
                        >
                          {latest.careerAppearance === 1
                            ? tr("First OCLR appearance")
                            : tr("OCLR appearance {count}", {
                                count: latest.careerAppearance,
                              })}
                        </p>
                      )}
                      <dl
                        className={styles.statistics}
                        data-feature-part="stats"
                        data-profile-status={
                          latest.player.profile?.status ?? "loading"
                        }
                      >
                        <div>
                          <dt>PP</dt>
                          <MotionNumber
                            id="pp"
                            value={latest.player.profile?.pp}
                            text={format(latest.player.profile?.pp)}
                          />
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
                          <MotionNumber
                            id="rank"
                            value={latest.player.profile?.globalRank}
                            text={
                              latest.player.profile?.globalRank == null
                                ? "—"
                                : `#${format(latest.player.profile.globalRank)}`
                            }
                          />
                        </div>
                        <div>
                          <dt>o!TR</dt>
                          <MotionNumber
                            id="otr"
                            value={ratings?.otr}
                            text={
                              ratings?.otr == null
                                ? "—"
                                : ratingNumber.format(ratings.otr)
                            }
                          />
                        </div>
                        <div>
                          <dt>{tr("SIP")}</dt>
                          <MotionNumber
                            id="sip"
                            value={ratings?.sip}
                            text={
                              ratings?.sip == null
                                ? "—"
                                : ratingNumber.format(ratings.sip)
                            }
                          />
                        </div>
                        <div>
                          <dt>{tr("ETX")}</dt>
                          <MotionNumber
                            id="etx"
                            value={ratings?.etx}
                            text={
                              ratings?.etx == null
                                ? "—"
                                : etxNumber.format(ratings.etx)
                            }
                          />
                        </div>
                      </dl>
                      <p
                        className={styles.destination}
                        data-feature-part="team"
                      >
                        {latest.team.name}
                        <span
                          className={styles.partGlow}
                          data-part-glow="team"
                          aria-hidden="true"
                        />
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
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
          <div className={styles.turnHeading}>
            <p className={styles.stageLabel}>
              {complete
                ? tr("DRAFT COMPLETE")
                : board?.state === "paused"
                  ? tr("ON HOLD")
                  : tr("Next pick")}
            </p>
            {selecting && (
              <span
                className={styles.pickingStatus}
                role="img"
                aria-label={tr("Captain is picking")}
              >
                <span className={styles.pickingIndicator} aria-hidden="true" />
                <span
                  className={styles.pickingPulse}
                  data-picking-pulse
                  aria-hidden="true"
                />
              </span>
            )}
          </div>
          <div className={styles.turnContent}>
            <div className={styles.turnLine}>
              <span
                className={styles.turnTeamGlow}
                data-turn-team-glow
                aria-hidden="true"
              />
              <h2 data-turn-team>
                {board?.activeTeam?.name ??
                  (complete
                    ? tr("Teams assembled.")
                    : tr("Waiting for the next stage."))}
              </h2>
            </div>
            {board?.activeRound && (
              <div className={styles.turnLine}>
                <p className={styles.round} data-turn-round>
                  {tr("Round {round} · Pick {position}", board.activeRound)}
                </p>
              </div>
            )}
            <div className={styles.progress}>
              <span className={styles.turnValue}>
                {order === null ? (
                  "—"
                ) : (
                  <>
                    <span
                      className={styles.turnDigit}
                      style={{
                        minInlineSize: `${String(board?.turnCount).length}ch`,
                      }}
                    >
                      <span data-turn-digit>{order}</span>
                    </span>
                    {" / "}
                    {board?.turnCount}
                  </>
                )}
              </span>
              <p>{tr("Overall pick order")}</p>
            </div>
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
                    <span
                      className={styles.historyGlow}
                      data-history-glow
                      aria-hidden="true"
                    />
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
