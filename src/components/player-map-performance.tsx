"use client";

import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import { InfoHint } from "@/components/info-hint";
import { PlayerPerformanceSummary } from "@/components/player-performance-summary";
import type {
  PlayerMapEdition,
  PlayerMapPerformance,
} from "@/lib/player-map-performance";
import styles from "./player-map-performance.module.css";

const share = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;

const ratio = (value: number | null) =>
  value === null ? "—" : value.toFixed(3);

type Totals = {
  maps: number;
  averagePlacement: number | null;
  firstPlaces: number;
  averageAccuracy: number | null;
  averageEffectiveRating: number | null;
  ratedMaps: number;
};

function totals(tr: ReturnType<typeof useAppTranslations>, value: Totals) {
  return [
    { label: tr("Maps played"), value: value.maps },
    {
      label: tr("Average placement"),
      value:
        value.averagePlacement === null
          ? "—"
          : value.averagePlacement.toFixed(2),
    },
    { label: tr("First-place maps"), value: value.firstPlaces },
    { label: tr("Average accuracy"), value: share(value.averageAccuracy) },
    {
      label: tr("Average effective rating"),
      value: ratio(value.averageEffectiveRating),
    },
    { label: tr("Rated maps"), value: value.ratedMaps },
  ];
}

export function PlayerMapPerformance({
  record: summary,
}: {
  record: PlayerMapPerformance;
}) {
  const tr = useAppTranslations();
  const unavailable = summary.editions.filter((e) => e.unavailable).length;
  return (
    <section className="spaced" aria-labelledby="map-performance">
      <div className={styles.heading}>
        <h2 id="map-performance">{tr("Performance")}</h2>
        <InfoHint label={tr("Explanation")}>
          {tr(
            "Only published or approved MP map scores are counted: archived seasons use their published statistics, live seasons use reviewed results. Effective rating is the player's score divided by that map's average score; maps with an unusable average are skipped. Relative score, combo, misses, pass rate, team share and failed-score counts are intentionally omitted.",
          )}
        </InfoHint>
      </div>
      {summary.mapsPlayed ? (
        <PlayerPerformanceSummary record={summary} />
      ) : (
        <p className="notice">
          {tr("No published map scores are attributed to this player yet.")}
        </p>
      )}
      {unavailable > 0 && (
        <p className="notice">
          {tr("Some tournament records are temporarily unavailable.")}
        </p>
      )}
      {summary.mapsPlayed > 0 && (
        <>
          <div className="section-title">
            <h2 id="season-record">{tr("Season record")}</h2>
          </div>
          <ul className={`panel ${styles.editions}`}>
            {summary.editions
              .filter((edition) => edition.maps.length > 0)
              .map((edition) => (
                <li className={styles.edition} key={edition.editionSlug}>
                  <div className={styles.head}>
                    <h3>
                      <Link
                        className="context-link"
                        href={`/tournaments/${edition.editionSlug}`}
                      >
                        {edition.editionName}
                      </Link>
                    </h3>
                  </div>
                  <dl className={styles.facts}>
                    {totals(tr, {
                      maps: edition.maps.length,
                      averagePlacement: edition.averagePlacement,
                      firstPlaces: edition.firstPlaces,
                      averageAccuracy: edition.averageAccuracy,
                      averageEffectiveRating: edition.averageEffectiveRating,
                      ratedMaps: edition.ratedMaps,
                    }).map((item) => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {edition.maps.length > 0 && <MapTable edition={edition} />}
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

function stageLabel(tr: ReturnType<typeof useAppTranslations>, stage: string) {
  if (stage === "group") return tr("Group stage");
  if (stage === "knockout") return tr("Knockout");
  return stage || "—";
}

function MapTable({ edition }: { edition: PlayerMapEdition }) {
  const tr = useAppTranslations();
  const date = new Intl.DateTimeFormat(tr.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <details className={styles.details}>
      <summary>{tr("Map details")}</summary>
      <div className={styles.scroll}>
        <table className="table">
          <thead>
            <tr>
              <th>{tr("Map")}</th>
              <th>{tr("Stage")}</th>
              <th>{tr("Date")}</th>
              <th>{tr("Rank")}</th>
              <th>{tr("Accuracy")}</th>
              <th>{tr("Effective rating")}</th>
            </tr>
          </thead>
          <tbody>
            {edition.maps.map((row) => (
              <tr key={`${row.fixtureId}-${row.gameId}`}>
                <td>
                  {row.title}
                  {row.slot !== "—" && (
                    <span className="muted small"> · {row.slot}</span>
                  )}
                </td>
                <td>{stageLabel(tr, row.stage)}</td>
                <td>{row.at ? date.format(new Date(row.at)) : "—"}</td>
                <td>{row.placement ?? "—"}</td>
                <td>{share(row.accuracy)}</td>
                <td>{ratio(row.effectiveRating)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
