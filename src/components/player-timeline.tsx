"use client";

import Link from "next/link";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { appearanceLabel } from "@/i18n/appearance";
import { useAppTranslations } from "@/i18n/shared";
import type { AppTranslator } from "@/i18n/translate";
import {
  axisFraction,
  logAxisFraction,
  type PlayerTimeline,
  type TimelineMarkKind,
  type TimelineSpan,
} from "@/lib/player-timeline";
import { seasonAccentPair } from "@/lib/season-accent";
import { seasonArtworkPair, type SeasonArtwork } from "@/lib/season-artwork";
import styles from "./player-timeline.module.css";

/**
 * Appearances style every `button`, so each timeline control resets the button
 * chrome inline (inline wins over any theme rule) and keeps its visuals on a
 * child span that the theme rules never touch.
 */
const reset: CSSProperties = {
  appearance: "none",
  background: "none",
  border: 0,
  borderRadius: 0,
  boxShadow: "none",
  padding: 0,
  margin: 0,
  minHeight: 0,
  minWidth: 0,
  transform: "none",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: "inherit",
  fontWeight: "inherit",
  lineHeight: "inherit",
  letterSpacing: "inherit",
  textAlign: "inherit",
  textDecoration: "none",
};

/** Dot crowding: two instants closer than this fraction would overlap. */
const DOT_CROWDING = 0.012;
const DOT_STEP = 21;

/** Keep the tooltip away from the viewport edges when it is clamped. */
const TIP_GUTTER = 12;

function month(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function markLabel(kind: TimelineMarkKind, tr: AppTranslator) {
  switch (kind) {
    case "joined":
      return tr("Joined");
    case "lastSeen":
      return tr("Last seen");
    case "updated":
      return tr("Last updated");
  }
}

export function PlayerTimeline({ timeline }: { timeline: PlayerTimeline }) {
  const tr = useAppTranslations();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? selected;

  // The tooltip is centred on the hovered span or milestone dot. Its text
  // width varies, so the centre is clamped to the viewport after measuring.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);

  const start = Date.parse(timeline.start);
  const end = Date.parse(timeline.end);
  const fraction = (value: string) =>
    axisFraction(Date.parse(value), start, end);
  const logFraction = (value: string) =>
    logAxisFraction(Date.parse(value), start, end);

  // ICU versions can choose thin or nonbreaking spaces differently per runtime.
  const formatter = new Intl.DateTimeFormat(tr.locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const day = (value: string) =>
    formatter.format(new Date(value)).replace(/\s+/g, " ");

  const seasonTitle = (span: TimelineSpan) =>
    span.appearance
      ? appearanceLabel(span.appearance, tr)
      : (span.editionName ?? `S${span.season}`);

  const spanDetail = (span: TimelineSpan) =>
    `${seasonTitle(span)} · ${
      span.point ? day(span.start) : `${day(span.start)} – ${day(span.end)}`
    } · ${span.participated ? tr("Participated") : tr("Did not participate")}${
      span.provisional ? ` · ${tr("Inferred from recorded matches")}` : ""
    }`;

  const details = new Map<string, string>();
  for (const mark of timeline.marks)
    details.set(
      `mark-${mark.kind}`,
      `${markLabel(mark.kind, tr)} · ${day(mark.at)}`,
    );
  for (const span of timeline.spans) details.set(span.key, spanDetail(span));
  const activeText = active ? details.get(active) : undefined;

  // The span paints its season's page-heading artwork into the detail bubble.
  const artworks = new Map<string, SeasonArtwork>();
  for (const span of timeline.spans) {
    const artwork = seasonArtworkPair(span.appearance);
    if (artwork) artworks.set(span.key, artwork);
  }
  const activeArtwork = active ? artworks.get(active) : undefined;

  // Both scales are rendered as custom properties, so the media query picks one
  // without a hydration mismatch. The capsule is centred on the true midpoint,
  // which keeps the 16px minimum from pushing the start of the season right.
  const spanGeometry = (span: TimelineSpan) => {
    const from = fraction(span.start);
    const to = Math.max(from, fraction(span.end));
    const logFrom = logFraction(span.start);
    const logTo = Math.max(logFrom, logFraction(span.end));
    return {
      "--tl-left": `${(((from + to) / 2) * 100).toFixed(4)}%`,
      "--tl-width": `${((to - from) * 100).toFixed(4)}%`,
      "--tl-left-log": `${(((logFrom + logTo) / 2) * 100).toFixed(4)}%`,
      "--tl-width-log": `${((logTo - logFrom) * 100).toFixed(4)}%`,
      transform: "translateX(-50%)",
    } as CSSProperties;
  };

  const accentStyle = (span: TimelineSpan) => {
    const accent = seasonAccentPair(span.appearance);
    if (!accent) return undefined;
    return {
      "--timeline-accent": accent.light,
      "--timeline-accent-dark": accent.dark,
    } as CSSProperties;
  };

  // Instants a few days apart land on the same pixel of a nineteen-year axis, so
  // the later marker steps left instead of hiding behind the earlier one. Left
  // is always inside the plot, whereas a rightward step can leave the card.
  const dotShifts: number[] = [];
  const placedDots: number[] = [];
  for (const mark of timeline.marks) {
    const at = fraction(mark.at);
    const crowded = placedDots.filter(
      (placed) => Math.abs(placed - at) < DOT_CROWDING,
    ).length;
    dotShifts.push(crowded * DOT_STEP);
    placedDots.push(at);
  }

  const marks = timeline.marks.map((mark) => ({
    key: `mark-${mark.kind}`,
    mark,
    left: fraction(mark.at) * 100,
    logLeft: logFraction(mark.at) * 100,
  }));

  // Two-digit year ticks below the rail. The last year always stays; on narrow
  // screens only five-year marks survive so the log scale cannot collide.
  const firstYear = new Date(start).getUTCFullYear();
  const lastYear = new Date(end).getUTCFullYear();
  const years: {
    year: number;
    label: string;
    left: number;
    logLeft: number;
    sparse: boolean;
  }[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const at = year === firstYear ? start : Date.UTC(year, 0, 1);
    years.push({
      year,
      label: String(year % 100).padStart(2, "0"),
      left: axisFraction(at, start, end) * 100,
      logLeft: logAxisFraction(at, start, end) * 100,
      sparse: year % 5 !== 0,
    });
  }

  const placeTip = useCallback(() => {
    const card = cardRef.current;
    const tip = tipRef.current;
    if (!card || !tip || !active) return;
    const anchor = card.querySelector<HTMLElement>(
      `[data-tl-key="${CSS.escape(active)}"]`,
    );
    if (!anchor) return;
    const frame = card.getBoundingClientRect();
    const origin = frame.left + card.clientLeft;
    const box = anchor.getBoundingClientRect();
    const width = tip.offsetWidth;
    const viewport = document.documentElement.clientWidth;
    const centered = box.left + box.width / 2 - origin - width / 2;
    const minimum = TIP_GUTTER - origin;
    const maximum = viewport - TIP_GUTTER - origin - width;
    setTipLeft(Math.round(Math.max(minimum, Math.min(centered, maximum))));
  }, [active]);

  useLayoutEffect(() => {
    if (active) placeTip();
  }, [active, activeText, placeTip]);

  return (
    <section
      className={`spaced ${styles.section}`}
      aria-labelledby="player-timeline"
    >
      <div className={styles.titleRow}>
        <h2 id="player-timeline">{tr("Player timeline")}</h2>
      </div>
      <div className={styles.card} ref={cardRef}>
        <div className={styles.metaRow}>
          <span>
            {"osu! · "}
            <time dateTime={timeline.start}>2007.07</time>
          </span>
          <span>
            <time dateTime={timeline.end}>{month(timeline.end)}</time>
            {" · UTC"}
          </span>
        </div>
        <div className={styles.plot}>
          <div className={styles.track}>
            {timeline.spans.map((span) => {
              const label = spanDetail(span);
              const shared = {
                className: styles.period,
                "data-tl-key": span.key,
                style: {
                  ...reset,
                  position: "absolute" as const,
                  top: 0,
                  bottom: 0,
                  display: "block",
                  cursor: "pointer",
                  ...spanGeometry(span),
                },
                "aria-label": label,
                onPointerEnter: () => setHovered(span.key),
                onPointerLeave: () => setHovered(null),
                onFocus: () => setHovered(span.key),
                onBlur: () => setHovered(null),
              };
              const fill = (
                <span
                  className={styles.periodFill}
                  style={accentStyle(span)}
                  data-participated={span.participated}
                  data-provisional={span.provisional}
                  data-point={span.point}
                  data-active={active === span.key}
                />
              );
              // A published edition is open to the public, so the span is a link.
              return span.editionSlug ? (
                <Link
                  key={span.key}
                  href={`/tournaments/${span.editionSlug}`}
                  {...shared}
                >
                  {fill}
                </Link>
              ) : (
                <button
                  key={span.key}
                  type="button"
                  aria-pressed={selected === span.key}
                  onClick={() =>
                    setSelected(selected === span.key ? null : span.key)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSelected(null);
                  }}
                  {...shared}
                >
                  {fill}
                </button>
              );
            })}
          </div>
          {marks.map((item, index) => (
            <span
              key={`point-${item.key}`}
              className={styles.markPoint}
              aria-hidden="true"
              data-active={active === item.key}
              data-tl-key={item.key}
              style={
                {
                  "--tl-left": `calc(${item.left.toFixed(4)}% - ${dotShifts[index] ?? 0}px)`,
                  "--tl-left-log": `calc(${item.logLeft.toFixed(4)}% - ${dotShifts[index] ?? 0}px)`,
                } as CSSProperties
              }
              onPointerEnter={() => setHovered(item.key)}
              onPointerLeave={() => setHovered(null)}
              onClick={() =>
                setSelected(selected === item.key ? null : item.key)
              }
            />
          ))}
          <div className={styles.years} aria-hidden="true">
            {years.map((item) => (
              <span
                key={item.year}
                className={styles.year}
                data-sparse={item.sparse ? "true" : undefined}
                data-last={item.year === lastYear ? "true" : undefined}
                style={
                  {
                    "--tl-year": `${item.left.toFixed(4)}%`,
                    "--tl-year-log": `${item.logLeft.toFixed(4)}%`,
                  } as CSSProperties
                }
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
        {activeText ? (
          <div
            ref={tipRef}
            className={styles.tip}
            role="note"
            style={tipLeft === null ? undefined : { left: tipLeft }}
          >
            {activeArtwork ? (
              <span
                className={styles.tipVisual}
                aria-hidden="true"
                style={
                  {
                    "--tip-art-light": `url("${activeArtwork.light}")`,
                    "--tip-art-dark": `url("${activeArtwork.dark}")`,
                  } as CSSProperties
                }
              />
            ) : null}
            <span className={styles.tipText}>{activeText}</span>
          </div>
        ) : null}
      </div>
      {/* The tooltip is visual only; screen readers still get the live detail. */}
      <p className="sr-only" role="status" aria-live="polite">
        {activeText ?? ""}
      </p>
    </section>
  );
}
