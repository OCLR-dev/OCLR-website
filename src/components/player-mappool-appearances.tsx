"use client";

import type { CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { playerModBreakdown } from "@/lib/player-mod-breakdown";
import type { PlayerMapPerformance } from "@/lib/player-map-performance";
import { getModInfo, slotModInfo } from "@/lib/mod-colors";
import { accentForColor } from "@/lib/panel-accent";
import { ratingColors } from "@/lib/rating-colors";
import accentStyles from "./panel-accent.module.css";
import styles from "./player-mappool-appearances.module.css";

const MAX_RATING = 2;

export function PlayerMappoolAppearances({
  record,
}: {
  record: PlayerMapPerformance;
}) {
  const tr = useAppTranslations();
  const breakdown = playerModBreakdown(record);
  const topCount = breakdown.topSlots[0]?.plays ?? 1;
  const topRating = breakdown.topRatings[0];
  const accent =
    topRating && topRating.averageEffectiveRating
      ? accentForColor(getModInfo(topRating.category).bg)
      : undefined;
  return (
    <div
      className={`panel ${styles.card} ${accent ? accentStyles.border : ""}`}
      style={accent}
    >
      <div className={styles.columns}>
        <section
          className={styles.section}
          aria-labelledby="player-mappool-appearances"
        >
          <h3 className={styles.sectionTitle} id="player-mappool-appearances">
            {tr("Mappool slot count")}
          </h3>
          {breakdown.topSlots.length ? (
            <ol className={styles.list}>
              {breakdown.topSlots.map((slot) => {
                const info = slotModInfo(slot.slot);
                return (
                  <li key={slot.slot}>
                    <div className={styles.head}>
                      <span className={styles.name}>
                        <span
                          className={styles.chip}
                          style={{
                            backgroundColor: info.bg,
                            color: info.color,
                          } as CSSProperties}
                        >
                          {slot.slot}
                        </span>
                      </span>
                      <span className={styles.value}>
                        {slot.plays}
                        <span className={styles.unit}> {tr("times")}</span>
                      </span>
                    </div>
                    <div className={styles.track} aria-hidden="true">
                      <span
                        style={{
                          width: `${(slot.plays / topCount) * 100}%`,
                          backgroundColor: info.bg,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.empty}>
              {tr("No mappool appearances yet.")}
            </p>
          )}
        </section>
        <section className={styles.section} aria-labelledby="player-pool-rating">
          <h3 className={styles.sectionTitle} id="player-pool-rating">
            {tr("Mappool average effective rating")}
          </h3>
          {breakdown.topRatings.length ? (
            <ol className={styles.list}>
              {breakdown.topRatings.map((pool) => {
                const info = getModInfo(pool.category);
                const value = pool.averageEffectiveRating!;
                const [from, to] = ratingColors(value);
                const width = Math.min(Math.max(value / MAX_RATING, 0), 1);
                return (
                  <li key={pool.category}>
                    <div className={styles.head}>
                      <span className={styles.name}>
                        <span
                          className={styles.chip}
                          style={{
                            backgroundColor: info.bg,
                            color: info.color,
                          } as CSSProperties}
                        >
                          {pool.category}
                        </span>
                        <span className={styles.meta}>
                          {pool.ratedMaps} {tr("maps")}
                        </span>
                      </span>
                      <span className={styles.value}>{value.toFixed(2)}</span>
                    </div>
                    <div className={styles.track} aria-hidden="true">
                      <span
                        style={{
                          width: `${width * 100}%`,
                          background: `linear-gradient(90deg, ${from}, ${to})`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.empty}>{tr("No pool ratings yet.")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
