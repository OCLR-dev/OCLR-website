"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { classRules, type PlayerClass } from "@/lib/player-class";
import type { PlayerLeaderboardRow } from "@/lib/player-leaderboard";
import { PlayerClassBadge } from "./player-class-badge";
import styles from "./player-leaderboard-table.module.css";

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
type Ranked = { row: PlayerLeaderboardRow; rank: number };

// The v1 category order: BC > CA > MF > SP > WF > GE > GU > SU > SG > NO > FU.
const CLASS_ORDER = Object.keys(classRules) as (keyof typeof classRules)[];

function classKey(classification: PlayerClass | null) {
  if (!classification) return null;
  const category = CLASS_ORDER.indexOf(classification.category);
  const codes: readonly string[] = classRules[classification.category].codes;
  return [category, codes.indexOf(classification.code)] as const;
}

function numericValue(row: PlayerLeaderboardRow, key: SortKey) {
  switch (key) {
    case "pp":
      return row.pp;
    case "mra":
      return row.mra;
    case "rws":
      return row.rws;
    case "wins":
      return row.wins;
    case "losses":
      return row.losses;
    case "appearances":
      return row.appearances;
    case "winRate":
      return row.winRate;
    case "participation":
      return row.participation;
    case "nm":
      return row.nm;
    case "mod":
      return row.mod;
    case "hd":
      return row.hd;
    case "hr":
      return row.hr;
    case "dt":
      return row.dt;
    default:
      return null;
  }
}

function compareRows(a: Ranked, b: Ranked, sort: Sort) {
  const { key, dir } = sort;
  if (key === "rank") return dir === "desc" ? a.rank - b.rank : b.rank - a.rank;
  if (key === "player") {
    const cmp =
      a.row.username < b.row.username
        ? -1
        : a.row.username > b.row.username
          ? 1
          : 0;
    return dir === "desc" ? -cmp : cmp;
  }
  if (key === "type") {
    const ka = classKey(a.row.classification);
    const kb = classKey(b.row.classification);
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;
    const cmp = ka[0] - kb[0] || ka[1] - kb[1];
    return dir === "desc" ? cmp : -cmp;
  }
  const av = numericValue(a.row, key);
  const bv = numericValue(b.row, key);
  if (av === null || bv === null) {
    if (av === bv) return 0;
    return av === null ? 1 : -1;
  }
  return dir === "desc" ? bv - av : av - bv;
}

function number(value: number | null, digits: number) {
  return value === null ? "—" : value.toFixed(digits);
}

export function PlayerLeaderboardTable({
  rows,
}: {
  rows: PlayerLeaderboardRow[];
}) {
  const tr = useAppTranslations();
  const [sort, setSort] = useState<Sort | null>(null);

  const sorted = useMemo(() => {
    const entries = rows.map((row, index) => ({ row, rank: index + 1 }));
    if (!sort) return entries;
    return [...entries].sort(
      (a, b) =>
        compareRows(a, b, sort) || a.rank - b.rank || a.row.osuId - b.row.osuId,
    );
  }, [rows, sort]);

  const columns: { key: SortKey; label: string }[] = [
    { key: "rank", label: "#" },
    { key: "player", label: tr("Player") },
    { key: "pp", label: tr("pp") },
    { key: "mra", label: tr("MRA v4") },
    { key: "rws", label: tr("RWS") },
    { key: "type", label: tr("type") },
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

  const toggle = (key: SortKey) =>
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "desc" };
      if (current.dir === "desc") return { key, dir: "asc" };
      return null;
    });

  return (
    <div className="table-scroll">
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map(({ key, label }) => {
              const active = sort?.key === key;
              const dir = active ? sort?.dir : undefined;
              return (
                <th
                  key={key}
                  scope="col"
                  aria-sort={
                    dir === "asc"
                      ? "ascending"
                      : dir === "desc"
                        ? "descending"
                        : "none"
                  }
                >
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => toggle(key)}
                  >
                    <span>{label}</span>
                    <span
                      className={styles.indicator}
                      data-active={active || undefined}
                      aria-hidden="true"
                    >
                      {dir === "desc" ? "▼" : dir === "asc" ? "▲" : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ row, rank }) => {
            const rws = row.rws === null ? null : row.rws * 100;
            return (
              <tr key={row.osuId}>
                <td>{rank}</td>
                <td>
                  <Link href={`/players/${row.osuId}`}>{row.username}</Link>
                </td>
                <td>
                  {row.pp === null
                    ? "—"
                    : Math.round(row.pp).toLocaleString("en-US")}
                </td>
                <td title={row.mra.toFixed(4)}>{number(row.mra, 2)}</td>
                <td>{number(rws, 1)}</td>
                <td>
                  {row.classification ? (
                    <PlayerClassBadge
                      classification={row.classification}
                      showNotes={false}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.appearances}</td>
                <td>{percent(row.winRate)}</td>
                <td>{percent(row.participation)}</td>
                <td title={row.nm.toFixed(4)}>{number(row.nm, 2)}</td>
                <td title={row.mod.toFixed(4)}>{number(row.mod, 2)}</td>
                <td title={row.hd.toFixed(4)}>{number(row.hd, 2)}</td>
                <td title={row.hr.toFixed(4)}>{number(row.hr, 2)}</td>
                <td title={row.dt.toFixed(4)}>{number(row.dt, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}
