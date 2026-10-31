"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";

/** Daily global-rank history. A log axis keeps a top-100 run readable next to
 * a five-digit rank, mirroring the osu! profile rank chart. */
type RankPoint = { day: number; rank: number };

/** The chart fills its card, which the profile grid stretches to the height
 * of the statistics column; this is the floor before that measurement lands. */
const MIN_HEIGHT = 184;
const PAD = { top: 5, right: 10, bottom: 6, left: 10 };
/** Share of the rank span kept as breathing room above and below the line, so
 * the best and worst samples never sit flush against the frame edges. Scaling
 * it to the span keeps the plot filled instead of reserving a fixed margin that
 * looks empty whenever the history barely moves. */
const LOG_HEADROOM = 0.02;

function toPoints(data: readonly number[], globalRank: number | null) {
  const points: RankPoint[] = [];
  data.forEach((rank, index) => {
    if (Number.isFinite(rank) && rank > 0)
      points.push({ day: index - (data.length - 1), rank });
  });
  const today = globalRank !== null && globalRank > 0 ? globalRank : null;
  if (today !== null) {
    // The last history sample is the previous day; pin the line to today's rank.
    if (points.length) points[points.length - 1] = { day: 0, rank: today };
    else points.push({ day: 0, rank: today });
  }
  if (points.length === 1)
    points.unshift({ day: points[0].day - 1, rank: points[0].rank });
  return points;
}

function tickRanks(lo: number, hi: number) {
  const candidates = [
    1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000,
    1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000,
    100000, 150000, 200000, 300000, 500000, 750000, 1000000,
  ];
  const inside = candidates.filter(
    (value) => value > lo * 1.05 && value < hi / 1.05,
  );
  const stride = Math.max(1, Math.ceil(inside.length / 3));
  // Rank 1 sits at the top edge; skipping `lo` leaves that boundary unframed.
  return [...inside.filter((_, index) => index % stride === 0), hi];
}

export function RankChart({
  data,
  globalRank,
}: {
  data: readonly number[];
  globalRank: number | null;
}) {
  const tr = useAppTranslations();
  const gradientId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [active, setActive] = useState<{ index: number; at: number } | null>(
    null,
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      const nextWidth = rect?.width ?? host.clientWidth;
      const nextHeight = rect?.height ?? host.clientHeight;
      setWidth(Math.max(0, Math.floor(nextWidth)));
      setHeight(Math.max(MIN_HEIGHT, Math.floor(nextHeight)));
    });
    observer.observe(host);
    setWidth(host.clientWidth);
    setHeight(Math.max(MIN_HEIGHT, host.clientHeight));
    return () => observer.disconnect();
  }, []);

  const points = useMemo(() => toPoints(data, globalRank), [data, globalRank]);
  const geometry = useMemo(() => {
    if (width < 40 || points.length < 2) return null;
    const ranks = points.map((point) => point.rank);
    const rawLo = Math.min(...ranks);
    const rawHi = Math.max(...ranks);
    const logSpan = Math.max(Math.log10(rawHi / rawLo), 0.05);
    const headroom = logSpan * LOG_HEADROOM;
    const logLo = Math.log10(rawLo) - headroom;
    const logHi = Math.log10(rawHi) + headroom;
    const lo = Math.max(1, Math.floor(10 ** logLo));
    const hi = Math.max(lo + 1, Math.ceil(10 ** logHi));
    const minDay = points[0].day;
    const span = minDay === 0 ? -1 : minDay;
    const innerWidth = width - PAD.left - PAD.right;
    const innerHeight = height - PAD.top - PAD.bottom;
    const toX = (day: number) =>
      PAD.left + ((day - minDay) / (0 - span)) * innerWidth;
    const toY = (rank: number) => {
      const t = (Math.log10(Math.max(1, rank)) - logLo) / (logHi - logLo || 1);
      return PAD.top + Math.min(1, Math.max(0, t)) * innerHeight;
    };
    const line = points
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${toX(point.day).toFixed(2)} ${toY(point.rank).toFixed(2)}`,
      )
      .join(" ");
    const area = `${line} L${toX(0).toFixed(2)} ${PAD.top + innerHeight} L${toX(minDay).toFixed(2)} ${PAD.top + innerHeight} Z`;
    return {
      lo,
      hi,
      toX,
      toY,
      line,
      area,
      ticks: tickRanks(lo, hi),
      minDay,
    };
  }, [points, width, height]);

  const number = (value: number) =>
    new Intl.NumberFormat(tr.locale, { maximumFractionDigits: 0 }).format(
      value,
    );

  const formattedDay = (day: number, at: number) => {
    const date = new Date(at);
    date.setDate(date.getDate() + day);
    return new Intl.DateTimeFormat(tr.locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const pick = (clientX: number) => {
    const host = hostRef.current;
    if (!host || !geometry || !points.length) return;
    const rect = host.getBoundingClientRect();
    const x = Math.min(
      width - PAD.right,
      Math.max(PAD.left, ((clientX - rect.left) / rect.width) * width),
    );
    let nearest = 0;
    let distance = Infinity;
    points.forEach((point, index) => {
      const delta = Math.abs(geometry.toX(point.day) - x);
      if (delta < distance) {
        distance = delta;
        nearest = index;
      }
    });
    setActive({ index: nearest, at: Date.now() });
  };

  const activePoint = active ? points[active.index] : null;

  // A tap has no hover to end: touch pointers fire `pointerleave` right after
  // `pointerup`, which used to drop the readout instantly. Keep a touch pick
  // until the next tap outside the chart instead.
  useEffect(() => {
    if (!active) return;
    const dismiss = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [active]);

  return (
    <div className="rank-chart" ref={hostRef}>
      {geometry ? (
        <svg
          className="rank-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`${tr("Global rank")}: #${number(points[points.length - 1].rank)}`}
          onPointerMove={(event) => pick(event.clientX)}
          onPointerDown={(event) => pick(event.clientX)}
          onPointerLeave={(event) => {
            // Touch releases the pointer after every tap; a mouse leaving is
            // the only real "stop inspecting" signal.
            if (event.pointerType !== "touch") setActive(null);
          }}
          onPointerCancel={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop className="rank-chart-stop-top" offset="0" />
              <stop className="rank-chart-stop-bottom" offset="1" />
            </linearGradient>
          </defs>
          {geometry.ticks.map((rank) => (
            <line
              key={rank}
              className="rank-chart-grid"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geometry.toY(rank)}
              y2={geometry.toY(rank)}
            />
          ))}
          <path
            className="rank-chart-area"
            d={geometry.area}
            fill={`url(#${gradientId})`}
          />
          <path className="rank-chart-line" d={geometry.line} />
          {activePoint && (
            <>
              <line
                className="rank-chart-pointer"
                x1={geometry.toX(activePoint.day)}
                x2={geometry.toX(activePoint.day)}
                y1={PAD.top}
                y2={height - PAD.bottom}
              />
              <circle
                className="rank-chart-dot"
                cx={geometry.toX(activePoint.day)}
                cy={geometry.toY(activePoint.rank)}
                r={4}
              />
            </>
          )}
        </svg>
      ) : (
        <div className="rank-chart-blank" aria-hidden="true" />
      )}
      {geometry && activePoint && (
        <div
          className="rank-chart-tip"
          style={{
            left: Math.min(
              width - 56,
              Math.max(56, geometry.toX(activePoint.day)),
            ),
            top: geometry.toY(activePoint.rank),
          }}
        >
          <strong>#{number(activePoint.rank)}</strong>
          <span>{formattedDay(activePoint.day, active!.at)}</span>
        </div>
      )}
    </div>
  );
}
