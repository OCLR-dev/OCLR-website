import type { CSSProperties } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { PlayerCompetitionRecord } from "@/lib/player-competition-model";
import type { PersonalMapRecord } from "@/lib/player-map-performance";
import styles from "./player-match-stats.module.css";
import { useAnimatedNumber } from "./use-animated-number";

function percent(wins: number, losses: number) {
  const total = wins + losses;
  return total > 0 ? Math.round((wins / total) * 100) : null;
}

function MatchBar({
  wins,
  losses,
  rate,
  winLabel,
  lossLabel,
}: {
  wins: number;
  losses: number;
  rate: number | null;
  winLabel: string;
  lossLabel: string;
}) {
  const total = wins + losses;
  const targetShare = total > 0 ? (wins / total) * 100 : 50;
  const share = useAnimatedNumber(targetShare);
  const value = rate === null ? "—" : `${Math.round(share)}%`;
  const finalValue = rate === null ? "—" : `${rate}%`;
  return (
    <div
      className={styles.bar}
      style={{ "--win-share": `${share}%` } as CSSProperties}
      role="img"
      aria-label={`${winLabel} ${wins}, ${lossLabel} ${losses}, ${finalValue}`}
    >
      <span className={`${styles.fill} ${styles.winFill}`} aria-hidden="true" />
      <span
        className={`${styles.fill} ${styles.lossFill}`}
        aria-hidden="true"
      />
      <span className={styles.bubbles} aria-hidden="true" />
      {wins > 0 && losses > 0 ? (
        <span className={styles.seam} aria-hidden="true">
          <span className={styles.spark} />
          <span className={styles.spark} />
          <span className={styles.spark} />
          <span className={styles.spark} />
        </span>
      ) : null}
      <span className={`${styles.edge} ${styles.edgeStart}`}>
        <small>{winLabel}</small>
        <strong>{wins}</strong>
      </span>
      <span className={styles.rate}>{value}</span>
      <span className={`${styles.edge} ${styles.edgeEnd}`}>
        <small>{lossLabel}</small>
        <strong>{losses}</strong>
      </span>
    </div>
  );
}

export function PlayerMatchStats({
  record,
  maps,
}: {
  record: PlayerCompetitionRecord;
  maps: PersonalMapRecord | null;
}) {
  const tr = useAppTranslations();
  const matchRate =
    record.winRate === null ? null : Math.round(record.winRate * 100);
  const mapRate = maps ? percent(maps.mapsWon, maps.mapsLost) : null;
  return (
    <div className={`panel ${styles.card}`}>
      <div className={styles.sections}>
        <div className={styles.bars}>
          <MatchBar
            wins={record.wins}
            losses={record.losses}
            rate={matchRate}
            winLabel={tr("Win rounds")}
            lossLabel={tr("Loss rounds")}
          />
          <MatchBar
            wins={maps?.mapsWon ?? 0}
            losses={maps?.mapsLost ?? 0}
            rate={mapRate}
            winLabel={tr("Win scores")}
            lossLabel={tr("Lose scores")}
          />
        </div>
        <dl className={styles.list}>
          <div>
            <dt>{tr("Longest win streak")}</dt>
            <dd>{record.longestWinStreak}</dd>
          </div>
          <div>
            <dt>{tr("Forfeits")}</dt>
            <dd>{record.forfeits}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
