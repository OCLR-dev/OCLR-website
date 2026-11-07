"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { classRules, type PlayerClass } from "@/lib/player-class";
import {
  PlayerRankCard,
  type PlayerRankCardData,
  type RankStatAnchors,
  type RankStatKey,
} from "./player-rank-card";
import styles from "./player-leaderboard-cards.module.css";

type SortKey = "rank" | "player" | "pp" | "mra" | "type" | RankStatKey;
type Direction = "desc" | "asc";
type Sort = { key: SortKey; dir: Direction };

const DEFAULT_SORT: Sort = { key: "mra", dir: "desc" };
const PAGE_SIZE = 50;

// The v1 category order: BC > CA > MF > SP > WF > GE > GU > SU > SG > NO > FU.
const CLASS_ORDER = Object.keys(classRules) as (keyof typeof classRules)[];

function classKey(classification: PlayerClass | null) {
  if (!classification) return null;
  const category = CLASS_ORDER.indexOf(classification.category);
  const codes: readonly string[] = classRules[classification.category].codes;
  return [category, codes.indexOf(classification.code)] as const;
}

function compareRows(a: PlayerRankCardData, b: PlayerRankCardData, sort: Sort) {
  const { key, dir } = sort;
  const direction = dir === "desc" ? -1 : 1;
  if (key === "rank") return (a.rank - b.rank) * direction;
  if (key === "player") return a.username.localeCompare(b.username) * direction;
  if (key === "type") {
    const left = classKey(a.classification);
    const right = classKey(b.classification);
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return (left[0] - right[0] || left[1] - right[1]) * direction;
  }
  const directValue = key === "pp" || key === "mra";
  const left = directValue ? a[key] : a.stats[key];
  const right = directValue ? b[key] : b.stats[key];
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const activeSort = sort ?? DEFAULT_SORT;

  const sorted = useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          compareRows(a, b, activeSort) || a.rank - b.rank || a.osuId - b.osuId,
      ),
    [players, activeSort],
  );

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

  return (
    <div className={styles.board}>
      <div
        className={styles.sortBar}
        role="toolbar"
        aria-label={tr("Player leaderboard")}
      >
        {columns.map((column) => {
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
      <div className={styles.list}>
        {shown.map((player) => (
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
