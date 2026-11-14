"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { fitSortRows } from "@/lib/leaderboard-sort";
import { BeatmapRankCard, type BeatmapRankCardData } from "./beatmap-rank-card";
import styles from "./player-leaderboard-cards.module.css";

type SortKey =
  | "beatmapId"
  | "title"
  | "fittedStars"
  | "fittedOffset"
  | "stars"
  | "picks"
  | "bans"
  | "plays"
  | "averageAccuracy"
  | "averageCombo";

type Direction = "desc" | "asc";
type Sort = { key: SortKey; dir: Direction };
type Ranked = {
  map: BeatmapRankCardData;
  rank: number;
};

export type BeatmapLeaderboardColumn = {
  key: SortKey;
  label: string;
};

const DEFAULT_SORT: Sort = { key: "picks", dir: "desc" };
const PAGE_SIZE = 50;

function numericValue(map: BeatmapRankCardData, key: SortKey) {
  switch (key) {
    case "fittedStars":
      return map.fittedStars;
    case "fittedOffset":
      return map.fittedOffset;
    case "stars":
      return map.stars;
    case "picks":
      return map.picks;
    case "bans":
      return map.bans;
    case "plays":
      return map.plays;
    case "averageAccuracy":
      return map.averageAccuracy;
    case "averageCombo":
      return map.averageCombo;
    default:
      return null;
  }
}

function compareRows(left: Ranked, right: Ranked, sort: Sort) {
  const direction = sort.dir === "desc" ? -1 : 1;
  if (sort.key === "beatmapId")
    return (left.map.beatmapId - right.map.beatmapId) * direction;
  if (sort.key === "title")
    return left.map.title.localeCompare(right.map.title) * direction;
  const a = numericValue(left.map, sort.key);
  const b = numericValue(right.map, sort.key);
  // Missing values stay at the end for either direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

export function BeatmapLeaderboardCards({
  maps,
  columns: providedColumns,
  defaultSort = DEFAULT_SORT,
  ariaLabel,
}: {
  maps: BeatmapRankCardData[];
  columns?: BeatmapLeaderboardColumn[];
  defaultSort?: Sort;
  ariaLabel?: string;
}) {
  const tr = useAppTranslations();
  const [sort, setSort] = useState<Sort | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortRowSizes, setSortRowSizes] = useState<number[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const sortBarRef = useRef<HTMLDivElement | null>(null);
  const sortWidthsRef = useRef<number[] | null>(null);
  const activeSort = sort ?? defaultSort;

  const columns: BeatmapLeaderboardColumn[] = providedColumns ?? [
    { key: "title", label: tr("Beatmap") },
    { key: "fittedStars", label: tr("Fitted difficulty") },
    { key: "stars", label: tr("Beatmap difficulty") },
    { key: "fittedOffset", label: tr("Offset") },
    { key: "picks", label: tr("Picks") },
    { key: "bans", label: tr("Bans") },
    { key: "plays", label: tr("Plays") },
    { key: "averageAccuracy", label: tr("Average accuracy") },
    { key: "averageCombo", label: tr("Average combo") },
  ];

  const labelKey = columns
    .map((column) => `${column.key}:${column.label}`)
    .join("\u0001");

  useLayoutEffect(() => {
    const bar = sortBarRef.current;
    if (!bar) return;
    let cancelled = false;
    let frame = 0;
    const update = () => {
      if (cancelled) return;
      const row = bar.firstElementChild;
      if (!(row instanceof HTMLElement)) return;
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const buttons = [...bar.querySelectorAll("button")];
      let widths = sortWidthsRef.current;
      if (!widths || widths.length !== buttons.length) {
        for (const button of buttons) button.style.flex = "0 0 auto";
        const measured: number[] = [];
        try {
          for (const button of buttons) {
            measured.push(button.getBoundingClientRect().width);
          }
        } finally {
          for (const button of buttons) button.style.removeProperty("flex");
        }
        if (measured.length === 0 || measured.some((width) => width <= 0)) {
          return;
        }
        widths = measured;
        sortWidthsRef.current = measured;
      }
      if (widths.length === 0 || widths.some((width) => width <= 0)) return;
      const next = fitSortRows(widths, gap, bar.clientWidth);
      setSortRowSizes((current) =>
        current?.length === next.length &&
        current.every((size, index) => size === next[index])
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (cancelled) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      sortWidthsRef.current = null;
      update();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      sortWidthsRef.current = null;
    };
  }, [labelKey]);

  const sortRows: (typeof columns)[] = [];
  const rowSizes = sortRowSizes ?? [columns.length];
  let rowOffset = 0;
  for (const size of rowSizes) {
    const row = columns.slice(rowOffset, rowOffset + size);
    if (row.length > 0) sortRows.push(row);
    rowOffset += size;
  }

  const sorted = useMemo(() => {
    const ranked: Ranked[] = maps.map((map) => ({ map, rank: map.rank }));
    return [...ranked]
      .sort(
        (a, b) =>
          compareRows(a, b, activeSort) ||
          a.rank - b.rank ||
          a.map.beatmapId - b.map.beatmapId,
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [maps, activeSort]);

  const shown = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) =>
            Math.min(count + PAGE_SIZE, sorted.length),
          );
        }
      },
      { rootMargin: "0px 0px 800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, sorted.length, visibleCount]);

  function toggle(key: SortKey) {
    setVisibleCount(PAGE_SIZE);
    setSort((current) => {
      if (key === defaultSort.key) {
        const effective = current ?? defaultSort;
        if (effective.key !== defaultSort.key) {
          return { key: defaultSort.key, dir: defaultSort.dir };
        }
        return {
          key: defaultSort.key,
          dir: effective.dir === "desc" ? "asc" : "desc",
        };
      }
      if (!current || current.key !== key) return { key, dir: "desc" };
      if (current.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  return (
    <div className={styles.board}>
      <div
        ref={sortBarRef}
        className={styles.sortBar}
        role="toolbar"
        aria-label={ariaLabel ?? tr("Beatmap leaderboard")}
      >
        {sortRows.map((row) => (
          <div
            key={row[0].key}
            className={styles.sortRow}
            data-measuring={sortRowSizes ? undefined : true}
          >
            {row.map((column) => {
              const active = activeSort.key === column.key;
              const ascending = active && activeSort.dir === "asc";
              const descending = active && activeSort.dir === "desc";
              return (
                <button
                  key={column.key}
                  type="button"
                  className={styles.sortButton}
                  data-active={active || undefined}
                  aria-pressed={active}
                  onClick={() => toggle(column.key)}
                >
                  <span
                    className={styles.arrow}
                    data-active={ascending || undefined}
                    aria-hidden="true"
                  >
                    ▲
                  </span>
                  <span className={styles.label}>{column.label}</span>
                  <span
                    className={styles.arrow}
                    data-active={descending || undefined}
                    aria-hidden="true"
                  >
                    ▼
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className={styles.list}>
        {shown.map(({ map }) => (
          <BeatmapRankCard key={map.beatmapId} map={map} />
        ))}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      ) : null}
    </div>
  );
}
