import type { CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { PlayerMapPerformance } from "@/lib/player-map-performance";
import styles from "./player-performance-summary.module.css";

const share = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;

const placement = (value: number | null, fieldSize: number) => (
  <>
    {value === null ? "—" : value.toFixed(2)}
    {value !== null && (
      <span className={styles.ratioDenominator}>/{fieldSize}</span>
    )}
  </>
);

const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SWEEP = 0.75;
const RING_LENGTH = RING_CIRCUMFERENCE * RING_SWEEP;
const RING_START_ANGLE = 135;

const pointOnRing = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: 100 + RING_RADIUS * Math.cos(radians),
    y: 100 + RING_RADIUS * Math.sin(radians),
  };
};

/** Red, cyan and green pairs borrowed from the match statistics bar fills. */
const RING_COLORS = {
  red: ["#fd5392", "#d32f2f"],
  cyan: ["#4facfe", "#00f2fe"],
  green: ["#5edc5b", "#caf881"],
} as const;

function ringColors(value: number | null): readonly [string, string] {
  if (value !== null && value < 0.9) return RING_COLORS.red;
  if (value !== null && value > 1.1) return RING_COLORS.green;
  return RING_COLORS.cyan;
}

function score(value: number | null) {
  if (value === null) return null;
  return value.toFixed(2);
}

/**
 * A three-quarter gauge with the gap at the bottom: 0 at the lower-left end,
 * 1 at the top and 2 at the lower-right end. The accent arc follows the
 * average effective rating, clamped to the 0–2 scale.
 */
function EfficiencyRing({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const visible = score(value);
  // Pin the arc to the 0–2 scale so values near either end cannot overrun the
  // track or slide past the lower-right cap.
  const fraction =
    value === null || !Number.isFinite(value)
      ? 0
      : Math.min(Math.max(value / 2, 0), 1);
  const [from, to] = ringColors(value);
  const arcStart = pointOnRing(RING_START_ANGLE);
  const arcEnd = pointOnRing(RING_START_ANGLE + fraction * 270);
  return (
    <div
      className={styles.ring}
      role="img"
      aria-label={`${label}: ${visible ?? "—"} / 2`}
      style={
        {
          "--ring-from": from,
          "--ring-to": to,
          "--ring-angle": `${fraction * 270}deg`,
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
          {visible ?? "—"}
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
  return (
    <div className={`panel ${styles.card}`}>
      <div className={styles.ringColumn}>
        <EfficiencyRing
          value={record.averageEffectiveRating}
          label={tr("Average effective rating")}
        />
        <span className={styles.caption}>{tr("Average effective rating")}</span>
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>{tr("Maps played")}</dt>
          <dd>
            {record.mapsPlayed}
            <span className={styles.ratioDenominator}>/{record.ratedMaps}</span>
          </dd>
        </div>
        <div>
          <dt>3v3 · {tr("Average placement")}</dt>
          <dd>{placement(record.averagePlacement3v3, 6)}</dd>
        </div>
        <div>
          <dt>4v4 · {tr("Average placement")}</dt>
          <dd>{placement(record.averagePlacement4v4, 8)}</dd>
        </div>
        <div>
          <dt>{tr("First-place maps")}</dt>
          <dd>{record.firstPlaces}</dd>
        </div>
        <div>
          <dt>{tr("Average accuracy")}</dt>
          <dd>{share(record.averageAccuracy)}</dd>
        </div>
      </dl>
    </div>
  );
}
