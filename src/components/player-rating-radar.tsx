import { useId, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { etxMods, type EtxMod } from "@/lib/etx-rating-model";
import type { BroadcastBoard } from "@/lib/draft-types";
import { sipSkillsets } from "@/lib/sip-rating-model";
import { getModInfo } from "@/lib/mod-colors";
import { accentForColor, accentForColors } from "@/lib/panel-accent";
import type { ProfileRatings } from "@/lib/profile-ratings-model";
import { RATING_COLORS } from "@/lib/rating-colors";
import accentStyles from "./panel-accent.module.css";
import {
  broadcastRadarMaximum,
  radarCenter as center,
  radarFrame,
  radarGeometry,
  radarRadius as radius,
} from "./broadcast-radar-motion";
import modStyles from "./player-mod-usage.module.css";
import styles from "./player-rating-radar.module.css";

const sipMods = [
  ["NM", "NoMod"],
  ["HD", "Hidden"],
  ["HR", "Hard Rock"],
  ["DT", "Double Time"],
] as const;

const rings = [0.2, 0.4, 0.6, 0.8, 1];

type Point = { x: number; y: number };
type RatingAxis = { label: string; value: number | null; mod?: EtxMod };

function starRating(value: number | undefined): number | null {
  return value !== undefined && value >= 0 ? value : null;
}

function pointOnAxis(axis: Point, distance: number): Point {
  return {
    x: center.x + axis.x * distance,
    y: center.y + axis.y * distance,
  };
}

function pointsAttribute(points: Point[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

function RatingPlot({
  axes,
  locale,
  highlighted,
  onPreview,
  broadcast,
}: {
  axes: RatingAxis[];
  locale: string;
  highlighted: string | null;
  onPreview?: (label: string | null) => void;
  broadcast?: "etx" | "sip";
}) {
  const gradient = useId();
  const highest = Math.max(10, ...axes.map(({ value }) => value ?? 0));
  const rounded = Math.ceil(highest / rings.length) * rings.length;
  const maximum = broadcast
    ? broadcastRadarMaximum
    : Number.isFinite(rounded)
      ? rounded
      : highest;
  const ticks = new Intl.NumberFormat(locale, {
    notation: maximum >= 1e4 ? "scientific" : "standard",
    maximumFractionDigits: 1,
  });
  const directions = axes.map((_, index) => {
    const angle = (index / axes.length) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const points = axes.map(({ value }, index) =>
    value === null
      ? null
      : pointOnAxis(directions[index], (value / maximum) * radius),
  );
  const complete = points.every((point) => point !== null);
  const segments = complete
    ? ""
    : points
        .map((point, index) => {
          const next = points[(index + 1) % points.length];
          return point && next
            ? `M ${point.x} ${point.y} L ${next.x} ${next.y}`
            : "";
        })
        .join(" ")
        .trim();
  const values = axes.map(({ value }) =>
    value === null ? null : Math.min(1, Math.max(0, value / maximum)),
  );
  const frame = broadcast ? radarFrame(values) : null;
  const geometry = frame && radarGeometry(frame);

  return (
    <svg className={styles.radar} viewBox="0 0 320 244" aria-hidden="true">
      {rings.map((ring) => (
        <polygon
          className={styles.gridLine}
          data-outer={ring === 1 || undefined}
          key={ring}
          points={pointsAttribute(
            directions.map((axis) => pointOnAxis(axis, radius * ring)),
          )}
        />
      ))}
      {axes.map(({ label }, index) => {
        const edge = pointOnAxis(directions[index], radius);
        const position = pointOnAxis(directions[index], radius + 21);
        return (
          <g key={label} data-highlighted={highlighted === label || undefined}>
            <line
              className={styles.spoke}
              x1={center.x}
              y1={center.y}
              x2={edge.x}
              y2={edge.y}
            />
            <text
              className={styles.axisLabel}
              x={position.x}
              y={position.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {label}
            </text>
          </g>
        );
      })}
      {frame && geometry ? (
        <>
          <defs>
            <linearGradient id={gradient} x2="0" y2="1">
              <stop className={styles.areaTop} offset="0" />
              <stop className={styles.areaBottom} offset="1" />
            </linearGradient>
          </defs>
          <g
            id={`${gradient}-geometry`}
            data-motion-radar={broadcast}
            data-radii={JSON.stringify(values)}
          >
            <polygon
              className={styles.outline}
              points={geometry.polygon}
              fill={`url(#${gradient})`}
              opacity={frame.fill}
            />
            <path
              className={styles.outline}
              d={geometry.segments}
              fill="none"
              opacity={1 - frame.fill}
            />
            {geometry.points.map(({ x, y }, index) => (
              <circle
                key={axes[index].label}
                className={styles.marker}
                cx={x}
                cy={y}
                r="4.5"
                opacity={frame.visibility[index]}
                fill={
                  axes[index].mod
                    ? getModInfo(axes[index].mod).bg
                    : "var(--accent-bottom)"
                }
              />
            ))}
          </g>
          <use
            href={`#${gradient}-geometry`}
            data-radar-glow
            className={styles.radarGlow}
          />
        </>
      ) : complete ? (
        <>
          <defs>
            <linearGradient id={gradient} x2="0" y2="1">
              <stop className={styles.areaTop} offset="0" />
              <stop className={styles.areaBottom} offset="1" />
            </linearGradient>
          </defs>
          <polygon
            className={styles.outline}
            points={pointsAttribute(points)}
            fill={`url(#${gradient})`}
          />
        </>
      ) : (
        segments && <path className={styles.outline} d={segments} fill="none" />
      )}
      {rings.map((ring) => (
        <text
          className={styles.tick}
          key={ring}
          x={center.x + 5}
          y={center.y - radius * ring - 3}
        >
          {ticks.format(maximum * ring)}
        </text>
      ))}
      {!broadcast &&
        points.map((point, index) => {
          const { mod, label } = axes[index];
          return (
            point && (
              <g
                key={label}
                data-highlighted={highlighted === label || undefined}
                onMouseEnter={onPreview ? () => onPreview(label) : undefined}
                onMouseLeave={onPreview ? () => onPreview(null) : undefined}
              >
                <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
                <circle
                  className={styles.marker}
                  cx={point.x}
                  cy={point.y}
                  r="4.5"
                  fill={mod ? getModInfo(mod).bg : "var(--accent-bottom)"}
                />
              </g>
            )
          );
        })}
    </svg>
  );
}

function RatingPanel({
  id,
  title,
  axes,
}: {
  id: string;
  title: string;
  axes: RatingAxis[];
}) {
  const tr = useAppTranslations();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const highlighted = preview ?? selected;
  const strongest = axes.reduce<RatingAxis | null>((best, axis) => {
    if (axis.value === null) return best;
    return best === null || axis.value > (best.value ?? 0) ? axis : best;
  }, null);
  if (!strongest) return null;

  const accent = strongest.mod
    ? accentForColor(getModInfo(strongest.mod).bg)
    : accentForColors(RATING_COLORS.blue[1], RATING_COLORS.blue[0]);
  const stars = new Intl.NumberFormat(tr.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const largeStars = new Intl.NumberFormat(tr.locale, {
    notation: "scientific",
    maximumFractionDigits: 2,
  });

  return (
    <article
      className={`panel ${styles.card} ${accentStyles.border}`}
      style={accent}
      aria-labelledby={id}
    >
      <h3 id={id}>{title}</h3>
      <div className={styles.content}>
        <RatingPlot
          axes={axes}
          locale={tr.locale}
          highlighted={highlighted}
          onPreview={setPreview}
        />
        <ul className={styles.values} role="list">
          {axes.map(({ label, mod, value }) => {
            const color = mod ? getModInfo(mod) : null;
            const row = (
              <>
                <span className={styles.category}>
                  {color ? (
                    <span
                      className={modStyles.chip}
                      style={{ backgroundColor: color.bg, color: color.color }}
                    >
                      {label}
                    </span>
                  ) : (
                    label
                  )}
                </span>
                <span className={modStyles.value}>
                  {value === null ? (
                    <>
                      <span className={modStyles.unit} aria-hidden="true">
                        —
                      </span>
                      <span className="sr-only">{tr("No rating data")}</span>
                    </>
                  ) : (
                    <>
                      {value >= 1e6
                        ? largeStars.format(value)
                        : stars.format(value)}
                      <span className={modStyles.unit}> ★</span>
                    </>
                  )}
                </span>
              </>
            );
            return (
              <li key={label}>
                {value === null ? (
                  <div className={styles.row}>{row}</div>
                ) : (
                  <button
                    type="button"
                    className={styles.row}
                    aria-pressed={selected === label}
                    data-highlighted={highlighted === label || undefined}
                    onMouseEnter={() => setPreview(label)}
                    onMouseLeave={() => setPreview(null)}
                    onClick={() =>
                      setSelected((previous) =>
                        previous === label ? null : label,
                      )
                    }
                  >
                    {row}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

export function PlayerRatingRadar({ ratings }: { ratings?: ProfileRatings }) {
  const tr = useAppTranslations();
  const sip = ratings?.sip.api?.snapshot;
  const panels = [
    {
      id: "player-rating-etx-mods",
      title: `${tr("ETX")} · ${tr("Mod ratings")}`,
      axes: etxMods.map((mod) => ({
        label: mod,
        mod,
        value: ratings?.etx?.mods?.[mod] ?? null,
      })),
    },
    {
      id: "player-rating-sip-mods",
      title: `${tr("SIP")} · ${tr("Mod ratings")}`,
      axes: sipMods.map(([mod, name]) => ({
        label: mod,
        mod,
        value: starRating(sip?.modifications?.[name]?.sr),
      })),
    },
    {
      id: "player-rating-sip-skills",
      title: `${tr("SIP")} · ${tr("Skillset ratings")}`,
      axes: sipSkillsets.map((label) => ({
        label,
        value: starRating(sip?.skillsets?.[label]?.sr),
      })),
    },
  ];
  if (panels.every(({ axes }) => axes.every(({ value }) => value === null))) {
    return null;
  }

  return (
    <section className="spaced" aria-labelledby="player-rating-radar">
      <h2 id="player-rating-radar">{tr("Player ratings")}</h2>
      <div className={styles.panels}>
        {panels.map((panel) => (
          <RatingPanel key={panel.id} {...panel} />
        ))}
      </div>
    </section>
  );
}

export function BroadcastRatingRadars({
  ratings,
}: {
  ratings?: BroadcastBoard["picks"][number]["ratings"];
}) {
  const tr = useAppTranslations();
  const format = new Intl.NumberFormat(tr.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const charts: {
    id: "etx" | "sip";
    label: string;
    title: string;
    axes: RatingAxis[];
  }[] = [
    {
      id: "etx",
      label: tr("ETX"),
      title: tr("Mod ratings"),
      axes: etxMods.map((mod) => ({
        label: mod,
        mod,
        value: ratings?.etxMods?.[mod] ?? null,
      })),
    },
    {
      id: "sip",
      label: tr("SIP"),
      title: tr("Skillset ratings"),
      axes: sipSkillsets.map((label) => ({
        label,
        value: ratings?.sipSkills[label] ?? null,
      })),
    },
  ];
  return (
    <div className={styles.broadcastCharts} data-pick-ratings>
      {charts.map(({ id, label, title, axes }) => (
        <figure className={styles.broadcastChart} key={id}>
          <RatingPlot
            axes={axes}
            locale={tr.locale}
            highlighted={null}
            broadcast={id}
          />
          {axes.some(({ value }) => value !== null) ? (
            <ul className="sr-only">
              {axes.map(({ label, value }) => (
                <li key={label}>
                  {label}{" "}
                  {value === null ? tr("No rating data") : format.format(value)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sr-only">{tr("No rating data")}</p>
          )}
          <figcaption>
            <strong>{label}</strong>
            <span>{title}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
