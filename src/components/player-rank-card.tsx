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
import styles from "./player-rank-card.module.css";

const MRA_V4_STOPS = [
  { value: 0, rgb: [0xd3, 0x2f, 0x2f] },
  { value: 1, rgb: [0xfe, 0xdc, 0x45] },
  { value: 2, rgb: [0x31, 0xb1, 0x6c] },
] as const;

function linearChannel(channel: number) {
  return (channel / 255) ** 2.2;
}

function gammaChannel(value: number) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return Math.round(clamped ** (1 / 2.2) * 255);
}

/** Interpolate the MRA v4 stops in linear light (gamma 2.2). */
function playerMraColor(mra: number): string {
  if (mra <= 0) return "#aaa";
  const value = Math.min(mra, 2);
  const upper = value > 1 ? 1 : 0;
  const from = MRA_V4_STOPS[upper];
  const to = MRA_V4_STOPS[upper + 1];
  const t = (value - from.value) / (to.value - from.value);
  const channels = from.rgb.map((channel, index) =>
    gammaChannel(
      linearChannel(channel) * (1 - t) + linearChannel(to.rgb[index]) * t,
    ),
  );
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

const STAT_STOPS = {
  red: "#d32f2f",
  yellow: "#fedc45",
  green: "#31b16c",
} as const;

/** Stat-specific maximum colours; their minimum is fixed white. */
const STAT_MAX_COLORS: Partial<Record<RankStatKey, string>> = {
  wins: STAT_STOPS.green,
  losses: STAT_STOPS.red,
  appearances: "#00b7ee",
  nm: "#aaaaaa",
  mod: modColors.FM.bg,
  hd: modColors.HD.bg,
  hr: modColors.HR.bg,
  dt: modColors.DT.bg,
};

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

/**
 * Red at 0, yellow at the player average (half the maximum when there is no
 * average), green at the maximum, for RWS and the percentage stats. The other
 * stats fade from white at 0 to their own colour at the maximum.
 */
function statColor(
  key: RankStatKey,
  value: number | null,
  average: number | null,
  maximum: number,
): string {
  if (value === null || !Number.isFinite(value)) return "#aaaaaa";
  const top = Math.max(maximum, 1e-6);
  const clamped = Math.min(Math.max(value, 0), top);
  const maxColor = STAT_MAX_COLORS[key];
  if (maxColor) {
    return mixColor("#ffffff", maxColor, clamped / top);
  }
  const mid =
    average === null || !Number.isFinite(average)
      ? top / 2
      : Math.min(Math.max(average, 0), top);
  if (clamped <= mid) {
    return mixColor(
      STAT_STOPS.red,
      STAT_STOPS.yellow,
      mid > 0 ? clamped / mid : 0,
    );
  }
  return mixColor(
    STAT_STOPS.yellow,
    STAT_STOPS.green,
    top > mid ? (clamped - mid) / (top - mid) : 1,
  );
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

export type RankStatAnchors = {
  average: Record<RankStatKey, number | null>;
  maximum: Record<RankStatKey, number>;
};

export type PlayerRankCardData = {
  rank: number;
  osuId: number;
  username: string;
  pp: number | null;
  mra: number;
  stats: PlayerRankStats;
  classification: PlayerClass | null;
  avatarUrl: string | null;
  coverUrl: string | null;
};

/**
 * One ranked player's banner card. The left band repeats the player-class
 * colour, the avatar sits over it, and the osu! cover fills the remaining
 * width. Add more cards to the same container as further ranks appear.
 */
export function PlayerRankCard({
  player,
  anchors,
}: {
  player: PlayerRankCardData;
  anchors: RankStatAnchors;
}) {
  const tr = useAppTranslations();
  const names = player.classification ? playerClassLabels(tr) : null;
  const nameViewportRef = useRef<HTMLSpanElement>(null);
  const nameTextRef = useRef<HTMLAnchorElement>(null);
  const [nameWidth, setNameWidth] = useState(0);
  const [nameOverflow, setNameOverflow] = useState(0);
  const mraValue = formatStat(player.mra, 2);
  const mraColor = playerMraColor(player.mra);
  const mraInk = contrastInk(mraColor);
  const stats = player.stats;

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
    key: RankStatKey,
    label: string,
    value: number | null,
    digits: number,
    width: number,
    suffix = "",
  ) => {
    const formatted = formatStat(value, digits, suffix);
    const color = statColor(
      key,
      value,
      anchors.average[key],
      anchors.maximum[key],
    );
    return {
      key,
      label,
      width,
      color,
      ink: contrastInk(color),
      ...formatted,
    };
  };
  const statBoxes = [
    box("rws", tr("RWS"), stats.rws === null ? null : stats.rws * 100, 1, 50),
    box("wins", tr("Wins"), stats.wins, 0, 50),
    box("losses", tr("Losses"), stats.losses, 0, 50),
    box("appearances", tr("Appearances"), stats.appearances, 0, 50),
    box(
      "winRate",
      tr("Win rate"),
      stats.winRate === null ? null : stats.winRate * 100,
      1,
      65,
      "%",
    ),
    box(
      "participation",
      tr("Participation"),
      stats.participation === null ? null : stats.participation * 100,
      1,
      65,
      "%",
    ),
    box("nm", tr("NM force"), stats.nm, 2, 50),
    box("mod", tr("MOD force"), stats.mod, 2, 50),
    box("hd", tr("HD force"), stats.hd, 2, 50),
    box("hr", tr("HR force"), stats.hr, 2, 50),
    box("dt", tr("DT force"), stats.dt, 2, 50),
  ];
  return (
    <section
      className={styles.card}
      data-category={player.classification?.category}
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
              <span className={styles.mraInteger}>{mraValue.integer}</span>
              {mraValue.fraction && (
                <span className={styles.mraFraction}>{mraValue.fraction}</span>
              )}
            </span>
          </span>
        </span>
        {statBoxes.map((stat) => (
          <span
            key={stat.key}
            className={styles.statItem}
            style={{ width: stat.width }}
          >
            <span className={styles.statLabel}>{stat.label}</span>
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
        ))}
      </div>
    </section>
  );
}
