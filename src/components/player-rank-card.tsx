"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { contrastInk } from "@/lib/color-contrast";
import { modColors } from "@/lib/mod-colors";
import type { PlayerClass } from "@/lib/player-class";
import { playerClassLabels } from "@/lib/player-class-labels";
import { Avatar } from "./avatar";
import { PlacementTrophy } from "./player-trophy";
import styles from "./player-rank-card.module.css";

const STAT_STOPS = {
  red: "#d32f2f",
  yellow: "#fedc45",
  green: "#31b16c",
} as const;

const WHITE = "#ffffff";

function linearChannel(channel: number) {
  return (channel / 255) ** 2.2;
}

function gammaChannel(value: number) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return Math.round(clamped ** (1 / 2.2) * 255);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Mix two sRGB colours in linear light so the mid-tones stay even. */
function mixColor(from: string, to: string, t: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const channels = start.map((channel, index) =>
    gammaChannel(
      linearChannel(channel) * (1 - t) + linearChannel(end[index]) * t,
    ),
  );
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

type ColorStops = { min: string; mid: string; max: string };

const PERFORMANCE_STOPS: ColorStops = {
  min: STAT_STOPS.red,
  mid: STAT_STOPS.yellow,
  max: STAT_STOPS.green,
};

const WIN_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, STAT_STOPS.green, 0.5),
  max: STAT_STOPS.green,
};

const LOSS_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, STAT_STOPS.red, 0.5),
  max: STAT_STOPS.red,
};

const APPEARANCE_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, "#00b7ee", 0.5),
  max: "#00b7ee",
};

const GRAY_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, "#aaaaaa", 0.5),
  max: "#aaaaaa",
};

/** The podium metals, matching the trophy marks used on player profiles. */
const TROPHY_STOPS = {
  champion: {
    min: WHITE,
    mid: mixColor(WHITE, "#f3c33f", 0.5),
    max: "#f3c33f",
  },
  runnerUp: {
    min: WHITE,
    mid: mixColor(WHITE, "#c8d2dc", 0.5),
    max: "#c8d2dc",
  },
  third: {
    min: WHITE,
    mid: mixColor(WHITE, "#c9834a", 0.5),
    max: "#c9834a",
  },
} satisfies Record<"champion" | "runnerUp" | "third", ColorStops>;

/** Ten-step colour anchors for every stat box. */
const STAT_COLOR_STOPS: Record<StatKey, ColorStops> = {
  rws: PERFORMANCE_STOPS,
  wins: WIN_STOPS,
  losses: LOSS_STOPS,
  appearances: APPEARANCE_STOPS,
  winRate: PERFORMANCE_STOPS,
  participation: PERFORMANCE_STOPS,
  nm: GRAY_STOPS,
  mod: {
    min: WHITE,
    mid: mixColor(WHITE, modColors.FM.bg, 0.5),
    max: modColors.FM.bg,
  },
  hd: {
    min: WHITE,
    mid: mixColor(WHITE, modColors.HD.bg, 0.5),
    max: modColors.HD.bg,
  },
  hr: {
    min: WHITE,
    mid: mixColor(WHITE, modColors.HR.bg, 0.5),
    max: modColors.HR.bg,
  },
  dt: {
    min: WHITE,
    mid: mixColor(WHITE, modColors.DT.bg, 0.5),
    max: modColors.DT.bg,
  },
  championships: TROPHY_STOPS.champion,
  runnerUps: TROPHY_STOPS.runnerUp,
  thirdPlaces: TROPHY_STOPS.third,
  seasons: APPEARANCE_STOPS,
  firstPlaces: TROPHY_STOPS.champion,
  secondPlaces: TROPHY_STOPS.runnerUp,
  thirdPlaceMaps: TROPHY_STOPS.third,
  mapsWon: WIN_STOPS,
  mapsLost: LOSS_STOPS,
  mapWinRate: PERFORMANCE_STOPS,
  averageAccuracy: PERFORMANCE_STOPS,
  longestWinStreak: PERFORMANCE_STOPS,
};

const MRA_COLOR_STOPS = PERFORMANCE_STOPS;

const BAND_COUNT = 10;
const MID_BAND = 5;

/**
 * Turn a 0-1 rank position into one of ten solid colour bands. The minimum,
 * middle and maximum values land on bands 1, 5 and 10; the lower band owns a
 * shared boundary.
 */
function bandColor(stops: ColorStops, position: number): string {
  const clamped = Math.min(Math.max(position, 0), 1);
  const band = Math.max(
    1,
    Math.min(BAND_COUNT, Math.ceil(clamped * BAND_COUNT)),
  );
  if (band <= MID_BAND) {
    return mixColor(stops.min, stops.mid, (band - 1) / (MID_BAND - 1));
  }
  return mixColor(
    stops.mid,
    stops.max,
    (band - MID_BAND) / (BAND_COUNT - MID_BAND),
  );
}

function statColor(
  key: StatKey,
  value: number | null,
  position: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return "#aaaaaa";
  if (position === null || !Number.isFinite(position)) return "#aaaaaa";
  return bandColor(STAT_COLOR_STOPS[key], position);
}

/** Split a number into the large integer part and the smaller fraction. */
function formatStat(value: number | null, digits: number, suffix = "") {
  if (value === null || !Number.isFinite(value)) {
    return { text: "—", integer: "—", fraction: "" };
  }
  const [integer, fraction = ""] = value.toFixed(digits).split(".");
  if (digits === 0) {
    const text = `${integer}${suffix}`;
    return { text, integer: text, fraction: "" };
  }
  const trimmed = fraction.replace(/0+$/, "");
  if (!trimmed) {
    return { text: `${integer}${suffix}`, integer, fraction: suffix };
  }
  return {
    text: `${integer}.${trimmed}${suffix}`,
    integer,
    fraction: `.${trimmed}${suffix}`,
  };
}

export type PlayerRankStats = {
  rws: number | null;
  wins: number;
  losses: number;
  appearances: number;
  winRate: number | null;
  participation: number | null;
  nm: number;
  mod: number;
  hd: number;
  hr: number;
  dt: number;
};

export type RankStatKey = keyof PlayerRankStats;

/** The 12 career values a player card can show instead of the season stats. */
export type PlayerCareerStats = {
  championships: number;
  runnerUps: number;
  thirdPlaces: number;
  seasons: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaceMaps: number;
  mapsWon: number;
  mapsLost: number;
  mapWinRate: number | null;
  averageAccuracy: number | null;
  longestWinStreak: number;
};

export type CareerStatKey = keyof PlayerCareerStats;

/** Every key that owns a colour band in `STAT_COLOR_STOPS`. */
export type StatKey = RankStatKey | CareerStatKey;

export type PlayerRankCardData = {
  rank: number;
  osuId: number;
  username: string;
  pp: number | null;
  mra: number;
  stats: PlayerRankStats;
  /** 0-1 position of this player's MRA among all ranked players. */
  mraPosition: number;
  /** 0-1 position of each stat, keyed by the stat name. */
  statPositions: Record<RankStatKey, number | null>;
  classification: PlayerClass | null;
  avatarUrl: string | null;
  coverUrl: string | null;
};

export type PlayerCareerRankCardData = {
  rank: number;
  osuId: number;
  username: string;
  pp: number | null;
  classification: PlayerClass | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  career: PlayerCareerStats;
  /** 0-1 position of each career stat among all ranked players. */
  careerPositions: Record<CareerStatKey, number | null>;
};

type TrophyTier = "champion" | "runnerUp" | "third";

type StatBoxData = {
  key: StatKey;
  label: string;
  width?: number;
  color: string;
  ink: string;
  text: string;
  integer: string;
  fraction: string;
  trophy?: TrophyTier;
};

function StatBox({ stat }: { stat: StatBoxData }) {
  return (
    <span
      className={styles.statItem}
      style={stat.width === undefined ? undefined : { width: stat.width }}
    >
      <span className={styles.statLabel}>
        {stat.trophy && <PlacementTrophy tier={stat.trophy} />}
        <span className={styles.statLabelText}>{stat.label}</span>
      </span>
      <span
        className={styles.stat}
        style={{ backgroundColor: stat.color, color: stat.ink }}
        title={`${stat.label} ${stat.text}`}
      >
        <span className={styles.statValue}>
          <span className={styles.statInteger}>{stat.integer}</span>
          {stat.fraction && (
            <span className={styles.statFraction}>{stat.fraction}</span>
          )}
        </span>
      </span>
    </span>
  );
}

/**
 * One ranked player's banner card. The left band repeats the player-class
 * colour, the avatar sits over it, and the osu! cover fills the remaining
 * width. Add more cards to the same container as further ranks appear.
 */
export function PlayerRankCard({
  player,
}: {
  player: PlayerRankCardData | PlayerCareerRankCardData;
}) {
  const tr = useAppTranslations();
  const names = player.classification ? playerClassLabels(tr) : null;
  const nameViewportRef = useRef<HTMLSpanElement>(null);
  const nameTextRef = useRef<HTMLAnchorElement>(null);
  const [nameWidth, setNameWidth] = useState(0);
  const [nameOverflow, setNameOverflow] = useState(0);
  const positions: Partial<Record<StatKey, number | null>> =
    "career" in player ? player.careerPositions : player.statPositions;
  const mraValue = "career" in player ? null : formatStat(player.mra, 2);
  const mraColor =
    "career" in player
      ? "#aaaaaa"
      : bandColor(MRA_COLOR_STOPS, player.mraPosition);
  const mraInk = contrastInk(mraColor);

  useEffect(() => {
    const viewport = nameViewportRef.current;
    const text = nameTextRef.current;
    if (!viewport || !text) return;
    const measure = () => {
      const width = text.scrollWidth;
      setNameWidth(width);
      setNameOverflow(Math.max(0, width - viewport.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    return () => observer.disconnect();
  }, [player.username]);

  const marquee = nameOverflow > 0;
  const box = (
    key: StatKey,
    label: string,
    value: number | null,
    digits: number,
    width: number | undefined,
    suffix = "",
    trophy?: TrophyTier,
  ): StatBoxData => {
    const formatted = formatStat(value, digits, suffix);
    const color = statColor(key, value, positions[key] ?? null);
    return {
      key,
      label,
      width,
      trophy,
      color,
      ink: contrastInk(color),
      ...formatted,
    };
  };
  const careerBoxes =
    "career" in player
      ? [
          box(
            "championships",
            tr("Champion"),
            player.career.championships,
            0,
            undefined,
            "",
            "champion",
          ),
          box(
            "runnerUps",
            tr("Runner-up"),
            player.career.runnerUps,
            0,
            undefined,
            "",
            "runnerUp",
          ),
          box(
            "thirdPlaces",
            tr("Third place"),
            player.career.thirdPlaces,
            0,
            undefined,
            "",
            "third",
          ),
          box(
            "seasons",
            tr("Tournament appearances"),
            player.career.seasons,
            0,
            undefined,
          ),
          box(
            "firstPlaces",
            tr("1st place"),
            player.career.firstPlaces,
            0,
            undefined,
            "",
            "champion",
          ),
          box(
            "secondPlaces",
            tr("2nd place"),
            player.career.secondPlaces,
            0,
            undefined,
            "",
            "runnerUp",
          ),
          box(
            "thirdPlaceMaps",
            tr("3rd place"),
            player.career.thirdPlaceMaps,
            0,
            undefined,
            "",
            "third",
          ),
          box("mapsWon", tr("Maps won"), player.career.mapsWon, 0, undefined),
          box(
            "mapsLost",
            tr("Maps lost"),
            player.career.mapsLost,
            0,
            undefined,
          ),
          box(
            "mapWinRate",
            tr("Map win rate"),
            player.career.mapWinRate === null
              ? null
              : player.career.mapWinRate * 100,
            1,
            undefined,
            "%",
          ),
          box(
            "averageAccuracy",
            tr("Average accuracy"),
            player.career.averageAccuracy === null
              ? null
              : player.career.averageAccuracy * 100,
            2,
            undefined,
            "%",
          ),
          box(
            "longestWinStreak",
            tr("Longest win streak"),
            player.career.longestWinStreak,
            0,
            undefined,
          ),
        ]
      : null;
  const statBoxes =
    "career" in player
      ? []
      : [
          box(
            "rws",
            tr("RWS"),
            player.stats.rws === null ? null : player.stats.rws * 100,
            1,
            50,
          ),
          box("wins", tr("Wins"), player.stats.wins, 0, 50),
          box("losses", tr("Losses"), player.stats.losses, 0, 50),
          box(
            "appearances",
            tr("Appearances"),
            player.stats.appearances,
            0,
            50,
          ),
          box(
            "winRate",
            tr("Win rate"),
            player.stats.winRate === null ? null : player.stats.winRate * 100,
            1,
            65,
            "%",
          ),
          box(
            "participation",
            tr("Participation"),
            player.stats.participation === null
              ? null
              : player.stats.participation * 100,
            1,
            65,
            "%",
          ),
          box("nm", tr("NM force"), player.stats.nm, 2, 50),
          box("mod", tr("MOD force"), player.stats.mod, 2, 50),
          box("hd", tr("HD force"), player.stats.hd, 2, 50),
          box("hr", tr("HR force"), player.stats.hr, 2, 50),
          box("dt", tr("DT force"), player.stats.dt, 2, 50),
        ];
  return (
    <section
      className={styles.card}
      data-category={player.classification?.category}
      data-variant={careerBoxes ? "career" : undefined}
      aria-label={`#${player.rank} ${player.username}`}
    >
      {player.coverUrl && (
        <Image
          className={styles.banner}
          src={player.coverUrl}
          alt=""
          width={1600}
          height={400}
          sizes="(max-width: 900px) 100vw, 900px"
          unoptimized
        />
      )}
      <span className={styles.scrim} aria-hidden="true" />
      <span className={styles.typeBand} aria-hidden="true" />
      <Link
        prefetch={false}
        className={styles.avatarFrame}
        href={`/players/${player.osuId}`}
        aria-label={player.username}
      >
        <Avatar
          osuId={player.osuId}
          username={player.username}
          avatarUrl={player.avatarUrl ?? undefined}
        />
      </Link>
      <span className={styles.rank}>#{player.rank}</span>
      <div className={styles.info}>
        <span className={styles.identity}>
          <span className={styles.nameViewport} ref={nameViewportRef}>
            <span
              className={styles.nameTrack}
              data-marquee={marquee ? "true" : undefined}
              style={
                marquee
                  ? ({
                      "--marquee-duration": `${Math.max(
                        6,
                        (nameWidth + 40) / 48,
                      )}s`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <Link
                prefetch={false}
                ref={nameTextRef}
                className={styles.name}
                href={`/players/${player.osuId}`}
              >
                {player.username}
              </Link>
              {marquee && (
                <span className={styles.nameClone} aria-hidden="true">
                  {player.username}
                </span>
              )}
            </span>
          </span>
        </span>
        <span className={styles.pp}>
          {player.pp === null
            ? "—"
            : `${Math.round(player.pp).toLocaleString("en-US")} ${tr("PP")}`}
        </span>
        {player.classification && names && (
          <span className={styles.type}>
            {names[player.classification.code]} ·{" "}
            {player.classification.category}
          </span>
        )}
      </div>
      <div className={styles.stats}>
        {careerBoxes ? (
          careerBoxes.map((stat) => <StatBox key={stat.key} stat={stat} />)
        ) : (
          <>
            {mraValue && (
              <span className={styles.statItem} style={{ width: 50 }}>
                <span className={`${styles.statLabel} ${styles.mraLabel}`}>
                  {tr("MRA v4")}
                </span>
                <span
                  className={styles.mraBox}
                  style={{ backgroundColor: mraColor, color: mraInk }}
                  title={`${tr("MRA v4")} ${mraValue.text}`}
                >
                  <span className={styles.mraValue}>
                    <span className={styles.mraInteger}>
                      {mraValue.integer}
                    </span>
                    {mraValue.fraction && (
                      <span className={styles.mraFraction}>
                        {mraValue.fraction}
                      </span>
                    )}
                  </span>
                </span>
              </span>
            )}
            {statBoxes.map((stat) => (
              <StatBox key={stat.key} stat={stat} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
