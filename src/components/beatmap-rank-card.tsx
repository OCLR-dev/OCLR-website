"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { appearanceLabel } from "@/i18n/appearance";
import { beatmapCoverUrl, beatmapListCoverUrl } from "@/lib/beatmap-artwork";
import { starColor } from "@/lib/beatmap-star-color";
import { contrastInk } from "@/lib/color-contrast";
import { mappoolDisplayName } from "@/lib/mappool-label";
import { slotModInfo } from "@/lib/mod-colors";
import { seasonAppearances, type Appearance } from "@/lib/preferences";
import {
  APPEARANCE_STOPS,
  bandColor,
  LOSS_STOPS,
  PERFORMANCE_STOPS,
  WIN_STOPS,
  type ColorStops,
} from "@/lib/rank-colors";
import { formatStat } from "@/lib/stat-format";
import styles from "./beatmap-rank-card.module.css";

/** Stats that receive a rank-band colour on a beatmap card. */
export type BeatmapStatKey =
  "picks" | "bans" | "plays" | "averageAccuracy" | "averageCombo";

export type BeatmapRankCardData = {
  rank: number;
  beatmapId: number;
  beatmapSetId: number | null;
  title: string;
  difficulty: string | null;
  slot: string;
  /** Season of the edition whose pool owns the slot. */
  season: string | null;
  /** Edition name used when the season has no theme label. */
  editionName: string;
  /** Season theme the owning edition configures, if any. */
  appearance: Appearance | null;
  /** Round (live pool) or pool name (archive) that owns the slot. */
  round: string;
  /** Whether `round` is a stored archive pool name or a live round name. */
  archive: boolean;
  /** Stored pool id for archive rows, empty for live rounds. */
  roundId: string;
  stars: number | null;
  fittedStars: number | null;
  /** Signed fitted-difficulty correction, or null when the map has no rating. */
  fittedOffset: number | null;
  /** Precomputed cell colour for the offset: 0 white, max positive red, min negative green. */
  offsetColor: string | null;
  picks: number | null;
  bans: number | null;
  plays: number;
  averageAccuracy: number | null;
  averageCombo: number | null;
  /** 0-1 position of each stat among all ranked beatmaps. */
  statPositions: Record<BeatmapStatKey, number | null>;
};

type StatBoxData = {
  key: string;
  label: string;
  width: number;
  color: string;
  ink: string;
  text: string;
  integer: string;
  fraction: string;
};

function StatBox({ stat }: { stat: StatBoxData }) {
  return (
    <span className={styles.statItem} style={{ width: stat.width }}>
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
  );
}

function bandStat(
  stops: ColorStops,
  value: number | null,
  position: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return "#aaaaaa";
  if (position === null || !Number.isFinite(position)) return "#aaaaaa";
  return bandColor(stops, position);
}

/** Signed offset so an easier-than-rated map reads `+0.18` and `0` stays plain. */
function offsetStat(value: number | null) {
  if (value === null || !Number.isFinite(value))
    return { text: "—", integer: "—", fraction: "" };
  if (Math.abs(value) < 0.005)
    return { text: "0", integer: "0", fraction: "" };
  const formatted = formatStat(Math.abs(value), 2);
  const sign = value > 0 ? "+" : "−";
  return {
    text: `${sign}${formatted.text}`,
    integer: `${sign}${formatted.integer}`,
    fraction: formatted.fraction,
  };
}

function starStat(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "#aaaaaa"
    : starColor(value);
}

/** Registered theme labels read `S8 · 樱花折线`, carrying their own season. */
const themeLabel = /^S(\d+)\s*·\s*(.+)$/;

/**
 * Theme name of a season. The owning edition's configured theme wins; a season
 * without one still has its registered theme, so look it up by season number.
 */
function seasonTheme(
  season: number,
  appearance: Appearance | null,
  tr: (message: string) => string,
): string | null {
  const configured = appearance
    ? themeLabel.exec(appearanceLabel(appearance, tr))
    : null;
  if (configured) return configured[2].trim();
  for (const candidate of seasonAppearances) {
    const label = themeLabel.exec(appearanceLabel(candidate, tr));
    if (label && Number(label[1]) === season) return label[2].trim();
  }
  return null;
}

/** Season label such as `S8 樱花折线`, falling back to the edition name. */
function seasonLabel(
  season: string | null,
  editionName: string,
  appearance: Appearance | null,
  tr: (message: string) => string,
) {
  const name = editionName.trim();
  const match = /(\d+)/.exec(season?.trim() ?? "");
  if (!match) return name;
  const number = Number(match[1]);
  const theme = seasonTheme(number, appearance, tr);
  if (theme) return `S${number} ${theme}`;
  // An edition named "OCLR Season 8" already states its season, so only add
  // the prefixed form when the name never mentions that number.
  const marker = new RegExp(
    `(?:^|[^0-9A-Za-z])(?:S|Season\\s*|第\\s*)0*${number}(?![0-9])`,
    "i",
  );
  if (marker.test(name)) return name;
  return name ? `S${number} ${name}` : `S${number}`;
}

/**
 * One beatmap's ranking card. The pooled mod colour fills the left band, the
 * title replaces the player name, and every value below is aggregated across
 * the published editions that contained the map.
 */
export function BeatmapRankCard({ map }: { map: BeatmapRankCardData }) {
  const tr = useAppTranslations();
  const mod = slotModInfo(map.slot);
  const [coverFailed, setCoverFailed] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const coverSrc = beatmapCoverUrl(map.beatmapSetId);
  const listSrc = beatmapListCoverUrl(map.beatmapSetId);
  const coverUrl = coverSrc && !coverFailed ? coverSrc : null;
  const listUrl = listSrc && !listFailed ? listSrc : null;

  const fittedColor = starStat(map.fittedStars);
  const starsColor = starStat(map.stars);
  const positions = map.statPositions;
  const origin = [
    seasonLabel(map.season, map.editionName, map.appearance, tr),
    map.archive ? mappoolDisplayName(tr, map.round, map.roundId) : map.round,
  ]
    .filter(Boolean)
    .join(" ");
  const poolLine = origin ? `${map.slot} · ${origin}` : map.slot;

  const box = (
    key: string,
    label: string,
    value: number | null,
    digits: number,
    width: number,
    color: string,
    suffix = "",
  ): StatBoxData => {
    const formatted = formatStat(value, digits, suffix);
    return {
      key,
      label,
      width,
      color,
      ink: contrastInk(color),
      ...formatted,
    };
  };

  const offsetColor = map.offsetColor ?? "#aaaaaa";
  const offset = offsetStat(map.fittedOffset);

  const boxes: StatBoxData[] = [
    box(
      "fittedStars",
      tr("Fitted difficulty"),
      map.fittedStars,
      2,
      65,
      fittedColor,
    ),
    box("stars", tr("Beatmap difficulty"), map.stars, 2, 65, starsColor),
    {
      key: "fittedOffset",
      label: tr("Offset"),
      width: 65,
      color: offsetColor,
      ink: contrastInk(offsetColor),
      ...offset,
    },
    box(
      "picks",
      tr("Picks"),
      map.picks,
      0,
      50,
      bandStat(WIN_STOPS, map.picks, positions.picks),
    ),
    box(
      "bans",
      tr("Bans"),
      map.bans,
      0,
      50,
      bandStat(LOSS_STOPS, map.bans, positions.bans),
    ),
    box(
      "plays",
      tr("Plays"),
      map.plays,
      0,
      50,
      bandStat(APPEARANCE_STOPS, map.plays, positions.plays),
    ),
    box(
      "averageAccuracy",
      tr("Average accuracy"),
      map.averageAccuracy === null ? null : map.averageAccuracy * 100,
      2,
      75,
      bandStat(
        PERFORMANCE_STOPS,
        map.averageAccuracy,
        positions.averageAccuracy,
      ),
      "%",
    ),
    box(
      "averageCombo",
      tr("Average combo"),
      map.averageCombo === null ? null : Math.round(map.averageCombo),
      0,
      65,
      bandStat(PERFORMANCE_STOPS, map.averageCombo, positions.averageCombo),
    ),
  ];

  return (
    <section
      className={styles.card}
      style={{ "--rank-type-color": mod.bg } as CSSProperties}
      data-cover={coverUrl ? "true" : undefined}
      aria-label={`#${map.rank} ${map.title}`}
    >
      {coverUrl && (
        <Image
          className={styles.banner}
          src={coverUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 760px) 100vw, 1240px"
          onError={() => setCoverFailed(true)}
        />
      )}
      {coverUrl && <span className={styles.scrim} aria-hidden="true" />}
      <span className={styles.typeBand} aria-hidden="true" />
      {listUrl && (
        <span className={styles.avatarFrame} aria-hidden="true">
          <Image
            className={styles.avatarImage}
            src={listUrl}
            alt=""
            width={120}
            height={120}
            unoptimized
            onError={() => setListFailed(true)}
          />
        </span>
      )}
      <span className={styles.rank}>#{map.rank}</span>
      <div className={styles.info}>
        <span className={styles.identity}>
          <span className={styles.nameViewport}>
            <a
              className={styles.name}
              href={`https://osu.ppy.sh/beatmaps/${map.beatmapId}`}
              target="_blank"
              rel="noreferrer"
              title={map.title}
            >
              {map.title}
            </a>
          </span>
        </span>
        <span className={styles.difficulty} title={map.difficulty ?? undefined}>
          {map.difficulty ?? "—"}
        </span>
        <span className={styles.slot} title={poolLine}>
          {poolLine}
        </span>
      </div>
      <div className={styles.stats}>
        {boxes.map((stat) => (
          <StatBox key={stat.key} stat={stat} />
        ))}
      </div>
    </section>
  );
}
