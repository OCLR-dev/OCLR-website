import { EmptyState, PageHeading } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import type {
  BeatmapRankCardData,
  BeatmapStatKey,
} from "@/components/beatmap-rank-card";
import { BeatmapLeaderboardCards } from "@/components/beatmap-leaderboard-cards";
import { RankingContext } from "@/components/ranking-context";
import { getAppTranslations } from "@/i18n/server";
import {
  beatmapLeaderboard,
  type BeatmapLeaderboardRow,
} from "@/lib/beatmap-leaderboard";
import { mixColor } from "@/lib/rank-colors";
import { remotePage } from "@/lib/remote-page";

import styles from "./page.module.css";

/** Value used to rank each box colour; percentages are displayed as 0-100. */
const STAT_ACCESSORS: Record<
  BeatmapStatKey,
  (row: BeatmapLeaderboardRow) => number | null
> = {
  picks: (row) => row.picks,
  bans: (row) => row.bans,
  plays: (row) => row.plays,
  averageAccuracy: (row) =>
    row.averageAccuracy === null ? null : row.averageAccuracy * 100,
  averageCombo: (row) => row.averageCombo,
};

/**
 * Map each map to a 0-1 position for one stat. Values are ranked ascending;
 * equal values share a rank, and positions span 0-1 across the assigned ranks
 * so the minimum and maximum groups reach the end bands.
 */
function positionsFor(
  rows: BeatmapLeaderboardRow[],
  pick: (row: BeatmapLeaderboardRow) => number | null,
): Map<number, number> {
  const entries = rows
    .map((row) => ({ beatmapId: row.beatmapId, value: pick(row) }))
    .filter(
      (entry): entry is { beatmapId: number; value: number } =>
        entry.value !== null && Number.isFinite(entry.value),
    )
    .sort(
      (left, right) =>
        left.value - right.value || left.beatmapId - right.beatmapId,
    );
  const positions = new Map<number, number>();
  let rank = 0;
  let previous: number | undefined;
  for (const entry of entries) {
    if (previous === undefined || entry.value !== previous) rank += 1;
    previous = entry.value;
    positions.set(entry.beatmapId, rank);
  }
  const lastRank = rank;
  for (const [beatmapId, rawRank] of positions) {
    positions.set(
      beatmapId,
      lastRank > 1 ? (rawRank - 1) / (lastRank - 1) : 0.5,
    );
  }
  return positions;
}

/**
 * Ten ranked shades per sign. Positive offsets rank from the smallest to the
 * largest (pale to red), negative offsets from the smallest magnitude to the
 * largest (pale to green); equal offsets share one shade. The mix runs in
 * 2.2 gamma space like the star scale.
 */
function offsetPalettes(offsets: number[]) {
  const build = (sorted: number[], target: string) => {
    const palette = new Map<number, string>();
    for (let start = 0; start < sorted.length; ) {
      let end = start;
      while (end + 1 < sorted.length && sorted[end + 1] === sorted[start]) end++;
      const position =
        sorted.length === 1 ? 0.5 : (start + end) / 2 / (sorted.length - 1);
      const tier = Math.min(9, Math.floor(position * 10 + 1e-9));
      const color = mixColor("#ffffff", target, (tier + 1) / 10);
      for (let index = start; index <= end; index++)
        palette.set(sorted[index], color);
      start = end + 1;
    }
    return palette;
  };
  return {
    positive: build(
      offsets.filter((value) => value > 0).sort((left, right) => left - right),
      "#d32f2f",
    ),
    negative: build(
      offsets.filter((value) => value < 0).sort((left, right) => right - left),
      "#2e7d32",
    ),
  };
}

/** Build the card props for every ranked beatmap. */
function rankCards(rows: BeatmapLeaderboardRow[]): BeatmapRankCardData[] {
  const statMaps = {} as Record<BeatmapStatKey, Map<number, number>>;
  for (const key of Object.keys(STAT_ACCESSORS) as BeatmapStatKey[]) {
    statMaps[key] = positionsFor(rows, STAT_ACCESSORS[key]);
  }
  const offsets = rows
    .map((row) => row.fittedOffset)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const palettes = offsetPalettes(offsets);
  return rows.map((row, index) => {
    const statPositions = {} as Record<BeatmapStatKey, number | null>;
    for (const key of Object.keys(STAT_ACCESSORS) as BeatmapStatKey[]) {
      statPositions[key] = statMaps[key].get(row.beatmapId) ?? null;
    }
    const offset = row.fittedOffset;
    const color =
      offset === null
        ? "#aaaaaa"
        : offset === 0
          ? "#ffffff"
          : ((offset > 0 ? palettes.positive : palettes.negative).get(offset) ??
            "#ffffff");
    return {
      rank: index + 1,
      beatmapId: row.beatmapId,
      beatmapSetId: row.beatmapSetId,
      title: row.title,
      difficulty: row.difficulty,
      slot: row.slot,
      season: row.season,
      editionName: row.editionName,
      appearance: row.appearance,
      round: row.round,
      archive: row.archive,
      roundId: row.roundId,
      stars: row.stars,
      fittedStars: row.fittedStars,
      fittedOffset: row.fittedOffset,
      offsetColor: color,
      picks: row.picks,
      bans: row.bans,
      plays: row.plays,
      averageAccuracy: row.averageAccuracy,
      averageCombo: row.averageCombo,
      statPositions,
    };
  });
}

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Beatmap leaderboard"),
    description: tr(
      "Beatmap difficulty, picks, bans, plays and score averages built from published mappools and match statistics.",
    ),
  };
}

async function BeatmapContent() {
  const tr = await getAppTranslations();
  const data = await beatmapLeaderboard();
  const cards = rankCards(data.maps);
  return (
    <div className={`container page ${styles.page}`}>
      <RankingContext current="beatmap" />
      <PageHeading title={tr("Beatmap leaderboard")}>
        {tr(
          "Beatmap difficulty, picks, bans, plays and score averages built from published mappools and match statistics.",
        )}
      </PageHeading>
      <InfoNote>
        <p className="muted small">
          {tr(
            "Each row groups one beatmap across the published editions that contained it. Difficulty uses the newest published star rating.",
          )}
        </p>
        <p className="muted small">
          {tr(
            "Picks and bans count the map's appearances in published fixtures. Plays count every counted score on the map, and the averages only include scores that recorded that value.",
          )}
        </p>
        <p className="muted small">
          {tr(
            "Fitted difficulty blends the star ranking with a guidance-score ranking, then reads the result back off the pool's star distribution. The offset is the fitted value minus the star rating; its colour ranks the positive and the negative offsets into ten shades each.",
          )}
        </p>
        <p className="muted small">
          {tr("{value0} maps · {value1} editions", {
            value0: data.maps.length,
            value1: data.editions,
          })}
          {data.unavailableEditions.length > 0 &&
            ` · ${tr("{value0} editions unavailable", {
              value0: data.unavailableEditions.length,
            })}`}
        </p>
      </InfoNote>
      {data.maps.length ? (
        <BeatmapLeaderboardCards
          maps={cards}
          defaultSort={{ key: "picks", dir: "desc" }}
          ariaLabel={tr("Beatmap leaderboard")}
        />
      ) : (
        <EmptyState title={tr("No beatmap statistics yet")}>
          {tr(
            "The beatmap ranking appears after a season publishes its mappools and match statistics.",
          )}
        </EmptyState>
      )}
    </div>
  );
}

export default function BeatmapLeaderboardPage() {
  return remotePage(() => BeatmapContent());
}
