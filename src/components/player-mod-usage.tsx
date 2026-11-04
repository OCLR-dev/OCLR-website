"use client";

import type { CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  playerModBreakdown,
  type ModUsage,
} from "@/lib/player-mod-breakdown";
import type { PlayerMapPerformance } from "@/lib/player-map-performance";
import { getModInfo } from "@/lib/mod-colors";
import { accentForColor } from "@/lib/panel-accent";
import accentStyles from "./panel-accent.module.css";
import styles from "./player-mod-usage.module.css";

const PIE_RADIUS = 37;

/** A full-circle donut whose slices follow the mod colours used elsewhere. */
function ModPie({
  mods,
  total,
  centerTotal,
  label,
}: {
  mods: ModUsage[];
  total: number;
  centerTotal: number;
  label: string;
}) {
  const gap = mods.length > 1 ? 1.2 : 0;
  let offset = 0;
  return (
    <svg
      className={styles.pie}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${label}: ${mods
        .map((mod) => `${mod.mod} ${mod.count}`)
        .join(", ")}`}
    >
      <circle
        className={styles.pieTrack}
        cx="50"
        cy="50"
        r={PIE_RADIUS}
        strokeWidth="20"
        fill="none"
      />
      <g className={styles.pieSlices}>
        {mods.map((mod) => {
          const value = total ? (mod.count / total) * 100 : 0;
          const visible = Math.max(value - gap, 0);
          const circle = (
            <circle
              key={mod.mod}
              cx="50"
              cy="50"
              r={PIE_RADIUS}
              fill="none"
              stroke={getModInfo(mod.mod).bg}
              strokeWidth="20"
              strokeLinecap="butt"
              pathLength={100}
              strokeDasharray={`${visible} 100`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += value;
          return circle;
        })}
      </g>
      <text
        className={styles.pieValue}
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {centerTotal}
      </text>
    </svg>
  );
}

export function PlayerModUsage({
  record,
}: {
  record: PlayerMapPerformance;
}) {
  const tr = useAppTranslations();
  const breakdown = playerModBreakdown(record);
  const listed = breakdown.mods.slice(0, 5);
  const topCount = listed[0]?.count ?? 1;
  // NM is the default play style, so the centre total subtracts its count.
  const nmCount = breakdown.mods.find((mod) => mod.mod === "NM")?.count ?? 0;
  const centerTotal = breakdown.totalMods - nmCount;
  const topMod = breakdown.mods[0];
  const accent =
    topMod && topMod.count > 0
      ? accentForColor(getModInfo(topMod.mod).bg)
      : undefined;
  return (
    <div
      className={`panel ${styles.card} ${accent ? accentStyles.border : ""}`}
      style={accent}
    >
      {breakdown.mods.length ? (
        <>
          <div className={styles.pieColumn}>
            <div className={styles.pieWrap}>
              <ModPie
                mods={breakdown.mods}
                total={breakdown.totalMods}
                centerTotal={centerTotal}
                label={tr("Mod usage")}
              />
            </div>
            <span className={styles.caption}>{tr("Mod usage")}</span>
          </div>
          <div className={styles.listColumn}>
            <ol className={styles.modList}>
              {listed.map((mod) => {
                const info = getModInfo(mod.mod);
                return (
                  <li key={mod.mod}>
                    <div className={styles.modHead}>
                      <span
                        className={styles.chip}
                        style={{
                          backgroundColor: info.bg,
                          color: info.color,
                        } as CSSProperties}
                      >
                        {mod.mod}
                      </span>
                      <span className={styles.value}>
                        {mod.count}
                        <span className={styles.unit}> {tr("times")}</span>
                      </span>
                    </div>
                    <div className={styles.track} aria-hidden="true">
                      <span
                        style={{
                          width: `${(mod.count / topCount) * 100}%`,
                          backgroundColor: info.bg,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      ) : (
        <p className={`${styles.empty} notice`}>{tr("No mods recorded yet.")}</p>
      )}
    </div>
  );
}
