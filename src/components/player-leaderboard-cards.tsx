"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { classRules, type PlayerClass } from "@/lib/player-class";
import {
  PlayerRankCard,
  type PlayerRankCardData,
  type RankStatAnchors,
} from "./player-rank-card";
import styles from "./player-leaderboard-cards.module.css";

type SortKey =
  | "rank"
  | "player"
  | "pp"
  | "mra"
  | "rws"
  | "type"
  | "wins"
  | "losses"
  | "appearances"
  | "winRate"
  | "participation"
  | "nm"
  | "mod"
  | "hd"
  | "hr"
  | "dt";

type Direction = "desc" | "asc";
type Sort = { key: SortKey; dir: Direction };
type Ranked = { player: PlayerRankCardData; rank: number };

// The list starts on MRA descending; that is also how the table ranks players.
const DEFAULT_SORT: Sort = { key: "mra", dir: "desc" };
const PAGE_SIZE = 50;

/** Split `total` controls into `rowCount` rows, earlier rows taking extras. */
function balancedRowSizes(total: number, rowCount: number): number[] {
  if (total <= 0) return [];
  const rows = Math.max(1, Math.min(total, rowCount));
  const base = Math.floor(total / rows);
  const extra = total % rows;
  return Array.from({ length: rows }, (_, index) =>
    index < extra ? base + 1 : base,
  );
}

/**
 * Fit the controls into the fewest balanced rows the width allows. Counts stay
 * within one control of each other, so 16 controls over 3 rows read as
 * 6 + 5 + 5 instead of 6 + 6 + 4, and a final row never holds a lone control.
 */
function fitSortRows(
  widths: number[],
  gap: number,
  available: number,
): number[] {
  for (let rows = 1; rows <= widths.length; rows += 1) {
    const sizes = balancedRowSizes(widths.length, rows);
    let index = 0;
    let fits = true;
    for (const size of sizes) {
      let rowWidth = gap * Math.max(0, size - 1);
      for (let column = 0; column < size; column += 1) {
        rowWidth += widths[index];
        index += 1;
      }
      if (rowWidth > available + 0.5) {
        fits = false;
        break;
      }
    }
    if (fits) return sizes;
  }
  return new Array(widths.length).fill(1);
}

// The v1 category order: BC > CA > MF > SP > WF > GE > GU > SU > SG > NO > FU.
const CLASS_ORDER = Object.keys(classRules) as (keyof typeof classRules)[];

function classKey(classification: PlayerClass | null) {
  if (!classification) return null;
  const category = CLASS_ORDER.indexOf(classification.category);
  const codes: readonly string[] = classRules[classification.category].codes;
  return [category, codes.indexOf(classification.code)] as const;
}

function numericValue(player: PlayerRankCardData, key: SortKey) {
  switch (key) {
    case "pp":
      return player.pp;
    case "mra":
      return player.mra;
    case "rws":
      return player.stats.rws;
    case "wins":
      return player.stats.wins;
    case "losses":
      return player.stats.losses;
    case "appearances":
      return player.stats.appearances;
    case "winRate":
      return player.stats.winRate;
    case "participation":
      return player.stats.participation;
    case "nm":
      return player.stats.nm;
    case "mod":
      return player.stats.mod;
    case "hd":
      return player.stats.hd;
    case "hr":
      return player.stats.hr;
    case "dt":
      return player.stats.dt;
    default:
      return null;
  }
}

function compareRows(a: Ranked, b: Ranked, sort: Sort) {
  const direction = sort.dir === "desc" ? -1 : 1;
  if (sort.key === "rank") return (a.rank - b.rank) * direction;
  if (sort.key === "player")
    return a.player.username.localeCompare(b.player.username) * direction;
  if (sort.key === "type") {
    const left = classKey(a.player.classification);
    const right = classKey(b.player.classification);
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return (left[0] - right[0] || left[1] - right[1]) * direction;
  }
  const left = numericValue(a.player, sort.key);
  const right = numericValue(b.player, sort.key);
  // Missing values stay at the end for either direction.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

export function PlayerLeaderboardCards({
  players,
  anchors,
}: {
  players: PlayerRankCardData[];
  anchors: RankStatAnchors;
}) {
  const tr = useAppTranslations();
  const [sort, setSort] = useState<Sort | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortRowSizes, setSortRowSizes] = useState<number[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const sortBarRef = useRef<HTMLDivElement | null>(null);
  const sortWidthsRef = useRef<number[] | null>(null);
  const activeSort = sort ?? DEFAULT_SORT;

  const columns: { key: SortKey; label: string }[] = [
    { key: "rank", label: "#" },
    { key: "player", label: tr("Player") },
    { key: "pp", label: tr("pp") },
    { key: "type", label: tr("type") },
    { key: "mra", label: tr("MRA v4") },
    { key: "rws", label: tr("RWS") },
    { key: "wins", label: tr("Wins") },
    { key: "losses", label: tr("Losses") },
    { key: "appearances", label: tr("Appearances") },
    { key: "winRate", label: tr("Win rate") },
    { key: "participation", label: tr("Participation") },
    { key: "nm", label: tr("NM force") },
    { key: "mod", label: tr("MOD force") },
    { key: "hd", label: tr("HD force") },
    { key: "hr", label: tr("HR force") },
    { key: "dt", label: tr("DT force") },
  ];

  const labelKey = columns.map((column) => column.label).join("\u0001");

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
      // The settled layout grows the buttons to fill each row. Measure the
      // labels once with that growth overridden, then reuse the intrinsic
      // widths. Re-measuring a grown row would make a wide layout look like it
      // still needs the previous, narrower row count.
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
    sortRows.push(columns.slice(rowOffset, rowOffset + size));
    rowOffset += size;
  }

  const sorted = useMemo(() => {
    const ranked: Ranked[] = players.map((player) => ({
      player,
      rank: player.rank,
    }));
    return [...ranked].sort(
      (a, b) =>
        compareRows(a, b, activeSort) ||
        a.rank - b.rank ||
        a.player.osuId - b.player.osuId,
    );
  }, [players, activeSort]);

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
      // MRA is the default order, so it only switches between descending and
      // ascending. It goes dark only while another column owns the sort.
      if (key === "mra") {
        const effective = current ?? DEFAULT_SORT;
        if (effective.key !== "mra") {
          return { key: "mra", dir: "desc" };
        }
        return { key: "mra", dir: effective.dir === "desc" ? "asc" : "desc" };
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
        aria-label={tr("Player leaderboard")}
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
        {shown.map(({ player }) => (
          <PlayerRankCard
            key={player.osuId}
            player={player}
            anchors={anchors}
          />
        ))}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      ) : null}
    </div>
  );
}
