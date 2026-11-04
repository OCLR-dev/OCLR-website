"use client";

import type { CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { PlayerMapPerformance } from "@/lib/player-map-performance";
import { RATING_COLORS, ratingColors } from "@/lib/rating-colors";
import { accentForScore, averageOf } from "@/lib/panel-accent";
import accentStyles from "./panel-accent.module.css";
import styles from "./player-performance-summary.module.css";
import { PlacementTrophy } from "./player-trophy";
import { useAnimatedNumber } from "./use-animated-number";

const share = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;

const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SWEEP = 0.75;
const RING_LENGTH = RING_CIRCUMFERENCE * RING_SWEEP;
const RING_START_ANGLE = 135;

const roundCoordinate = (value: number) => Math.round(value * 1000) / 1000;

const pointOnRing = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: roundCoordinate(100 + RING_RADIUS * Math.cos(radians)),
    y: roundCoordinate(100 + RING_RADIUS * Math.sin(radians)),
  };
};

const clampFraction = (value: number, min: number, max: number) =>
  Math.min(Math.max((value - min) / (max - min), 0), 1);

const placementColors = (
  value: number,
  greenBelow: number,
  redAbove: number,
) =>
  value < greenBelow
    ? RATING_COLORS.green
    : value > redAbove
      ? RATING_COLORS.red
      : RATING_COLORS.blue;

/**
 * A three-quarter gauge with the gap at the bottom. Values run from `min` at
 * the lower-left end to `max` at the lower-right end; the accent arc follows
 * the animated value inside that range.
 */
function GaugeRing({
  value,
  min,
  max,
  colors,
  label,
  ariaScale,
}: {
  value: number | null;
  min: number;
  max: number;
  colors: (value: number) => readonly [string, string];
  label: string;
  ariaScale?: string;
}) {
  // The arc follows the previous value until the new one settles, so switching
  // an edition reads as a sweep instead of a jump.
  const target =
    typeof value === "number" && Number.isFinite(value) ? value : min;
  const animated = useAnimatedNumber(target);
  const fraction = clampFraction(animated, min, max);
  const [from, to] = colors(animated);
  const display =
    typeof value === "number" && Number.isFinite(value)
      ? value.toFixed(2)
      : "—";
  const arcStart = pointOnRing(RING_START_ANGLE);
  const arcEnd = pointOnRing(RING_START_ANGLE + fraction * 270);
  return (
    <div
      className={styles.ring}
      role="img"
      aria-label={`${label}: ${display}${ariaScale ? ` ${ariaScale}` : ""}`}
      style={
        {
          "--ring-from": from,
          "--ring-to": to,
          "--ring-angle": `${(fraction * 270).toFixed(2)}deg`,
        } as CSSProperties
      }
    >
      <svg
        className={styles.ringSvg}
        viewBox="0 0 200 200"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className={styles.track}
          cx="100"
          cy="100"
          r={RING_RADIUS}
          strokeWidth="20"
          strokeLinecap="round"
          strokeDasharray={`${RING_LENGTH} ${RING_CIRCUMFERENCE}`}
          transform="rotate(135 100 100)"
        />
        <text
          className={styles.ringValue}
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {display}
        </text>
      </svg>
      {fraction > 0 && (
        <>
          <span className={styles.ringArc} aria-hidden="true" />
          <svg
            className={styles.ringCaps}
            viewBox="0 0 200 200"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx={arcStart.x} cy={arcStart.y} r="10" fill={from} />
            <circle cx={arcEnd.x} cy={arcEnd.y} r="10" fill={to} />
          </svg>
          <span className={styles.ringBubbles} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

export function PlayerPerformanceSummary({
  record,
}: {
  record: PlayerMapPerformance;
}) {
  const tr = useAppTranslations();
  const ratingLabel = tr("Average effective rating");
  const placement3Label = `3v3 · ${tr("Average placement")}`;
  const placement4Label = `4v4 · ${tr("Average placement")}`;
  const performanceScore = averageOf([
    record.averageEffectiveRating === null
      ? null
      : Math.min(Math.max(record.averageEffectiveRating, 0), 2) / 2,
    record.averagePlacement3v3 === null
      ? null
      : 1 - (record.averagePlacement3v3 - 1) / 5,
    record.averagePlacement4v4 === null
      ? null
      : 1 - (record.averagePlacement4v4 - 1) / 7,
  ]);
  const accent = accentForScore(performanceScore);
  return (
    <div
      className={`panel ${styles.card} ${accent ? accentStyles.border : ""}`}
      style={accent}
    >
      <div className={styles.ringColumn}>
        <GaugeRing
          value={record.averageEffectiveRating}
          min={0}
          max={2}
          colors={ratingColors}
          label={ratingLabel}
          ariaScale="/ 2"
        />
        <span className={styles.caption}>{ratingLabel}</span>
      </div>
      <div className={styles.ringColumn}>
        <GaugeRing
          value={record.averagePlacement3v3}
          min={6}
          max={1}
          colors={(value) => placementColors(value, 3, 4)}
          label={placement3Label}
        />
        <span className={styles.caption}>{placement3Label}</span>
      </div>
      <div className={styles.ringColumn}>
        <GaugeRing
          value={record.averagePlacement4v4}
          min={8}
          max={1}
          colors={(value) => placementColors(value, 3.8, 5.2)}
          label={placement4Label}
        />
        <span className={styles.caption}>{placement4Label}</span>
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>{tr("First-place map count")}</dt>
          <dd className={styles.medalValue}>
            <PlacementTrophy tier="champion" />
            <span>{record.firstPlaces}</span>
          </dd>
        </div>
        <div>
          <dt>{tr("Second-place map count")}</dt>
          <dd className={styles.medalValue}>
            <PlacementTrophy tier="runnerUp" />
            <span>{record.secondPlaces}</span>
          </dd>
        </div>
        <div>
          <dt>{tr("Third-place map count")}</dt>
          <dd className={styles.medalValue}>
            <PlacementTrophy tier="third" />
            <span>{record.thirdPlaces}</span>
          </dd>
        </div>
        <div>
          <dt>{tr("Maps played")}</dt>
          <dd>
            {record.mapsPlayed}
            {record.teamMaps > 0 && (
              <span className={styles.ratioDenominator}>
                /{record.teamMaps}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>{tr("Average accuracy")}</dt>
          <dd>{share(record.averageAccuracy)}</dd>
        </div>
      </dl>
    </div>
  );
}
