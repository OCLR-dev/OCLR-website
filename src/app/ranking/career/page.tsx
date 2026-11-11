import { EmptyState, PageHeading } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import type {
  CareerStatKey,
  PlayerCareerRankCardData,
} from "@/components/player-rank-card";
import {
  PlayerLeaderboardCards,
  type LeaderboardColumn,
} from "@/components/player-leaderboard-cards";
import { RankingContext } from "@/components/ranking-context";
import { getAppTranslations } from "@/i18n/server";
import {
  careerLeaderboard,
  type CareerLeaderboardRow,
} from "@/lib/player-career";
import { playerLeaderboard } from "@/lib/player-leaderboard";
import { remotePage } from "@/lib/remote-page";

import styles from "./page.module.css";

/** Value used to rank each career stat; percentages are displayed as 0-100. */
const CAREER_ACCESSORS: Record<
  CareerStatKey,
  (row: CareerLeaderboardRow) => number | null
> = {
  championships: (row) => row.career.championships,
  runnerUps: (row) => row.career.runnerUps,
  thirdPlaces: (row) => row.career.thirdPlaces,
  seasons: (row) => row.career.seasons,
  firstPlaces: (row) => row.career.firstPlaces,
  secondPlaces: (row) => row.career.secondPlaces,
  thirdPlaceMaps: (row) => row.career.thirdPlaceMaps,
  mapsWon: (row) => row.career.mapsWon,
  mapsLost: (row) => row.career.mapsLost,
  mapWinRate: (row) =>
    row.career.mapWinRate === null ? null : row.career.mapWinRate * 100,
  averageAccuracy: (row) =>
    row.career.averageAccuracy === null
      ? null
      : row.career.averageAccuracy * 100,
  longestWinStreak: (row) => row.career.longestWinStreak,
};

/**
 * Map each player to a 0-1 position for one stat. Players are ranked by value
 * ascending; equal values share a rank, and positions span 0-1 across the
 * assigned ranks so the minimum and maximum groups reach the end bands.
 */
function positionsFor<T extends { osuId: number }>(
  rows: T[],
  pick: (row: T) => number | null,
): Map<number, number> {
  const entries = rows
    .map((row) => ({ osuId: row.osuId, value: pick(row) }))
    .filter(
      (entry): entry is { osuId: number; value: number } =>
        entry.value !== null && Number.isFinite(entry.value),
    )
    .sort(
      (left, right) => left.value - right.value || left.osuId - right.osuId,
    );
  const positions = new Map<number, number>();
  let rank = 0;
  let previous: number | undefined;
  for (const entry of entries) {
    if (previous === undefined || entry.value !== previous) rank += 1;
    previous = entry.value;
    positions.set(entry.osuId, rank);
  }
  const lastRank = rank;
  for (const [osuId, rawRank] of positions) {
    positions.set(osuId, lastRank > 1 ? (rawRank - 1) / (lastRank - 1) : 0.5);
  }
  return positions;
}

/** Build the career card props for every ranked row. */
function rankCards(rows: CareerLeaderboardRow[]): PlayerCareerRankCardData[] {
  const statMaps = {} as Record<CareerStatKey, Map<number, number>>;
  for (const key of Object.keys(CAREER_ACCESSORS) as CareerStatKey[]) {
    statMaps[key] = positionsFor(rows, CAREER_ACCESSORS[key]);
  }
  return rows.map((row, index) => {
    const careerPositions = {} as Record<CareerStatKey, number | null>;
    for (const key of Object.keys(CAREER_ACCESSORS) as CareerStatKey[]) {
      careerPositions[key] = statMaps[key].get(row.osuId) ?? null;
    }
    return {
      rank: index + 1,
      osuId: row.osuId,
      username: row.username,
      pp: row.pp,
      classification: row.classification,
      avatarUrl: row.avatarUrl,
      coverUrl: row.coverUrl,
      career: row.career,
      careerPositions,
    };
  });
}

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Career leaderboard"),
    description: tr(
      "Tournament and map career totals built from published results.",
    ),
  };
}

async function CareerContent() {
  const tr = await getAppTranslations();
  const data = await careerLeaderboard(await playerLeaderboard());
  const cards = rankCards(data.players);
  const columns: LeaderboardColumn[] = [
    { key: "uid", label: "#" },
    { key: "player", label: tr("Player") },
    { key: "pp", label: tr("pp") },
    { key: "type", label: tr("type") },
    {
      key: "championships",
      label: tr("Championships"),
      trophy: "champion",
    },
    {
      key: "runnerUps",
      label: tr("Runner-up finishes"),
      trophy: "runnerUp",
    },
    {
      key: "thirdPlaces",
      label: tr("Third-place finishes"),
      trophy: "third",
    },
    { key: "seasons", label: tr("Tournament appearances") },
    { key: "firstPlaces", label: tr("1st place"), trophy: "champion" },
    { key: "secondPlaces", label: tr("2nd place"), trophy: "runnerUp" },
    { key: "thirdPlaceMaps", label: tr("3rd place"), trophy: "third" },
    { key: "mapsWon", label: tr("Maps won") },
    { key: "mapsLost", label: tr("Maps lost") },
    { key: "mapWinRate", label: tr("Map win rate") },
    { key: "averageAccuracy", label: tr("Average accuracy") },
    { key: "longestWinStreak", label: tr("Longest win streak") },
  ];
  return (
    <div className={`container page ${styles.page}`}>
      <RankingContext current="career" />
      <PageHeading title={tr("Career leaderboard")}>
        {tr("Tournament and map career totals built from published results.")}
      </PageHeading>
      <InfoNote>
        <p className="muted small">
          {tr(
            "Championships, runner-up and third place follow each edition's published final placements. Map places rank every counted score on the map.",
          )}
        </p>
        <p className="muted small">
          {tr(
            "Maps won, maps lost and map win rate follow the map result for the player's team. Average accuracy only includes counted maps with a recorded accuracy.",
          )}
        </p>
        <p className="muted small">
          {tr(
            "Tournament appearances count editions with a published roster. Longest win streak counts consecutive series wins across editions.",
          )}
        </p>
        {data.state === "ready" && (
          <p className="muted small">
            {tr("{value0} players · {value1} editions", {
              value0: data.players.length,
              value1: data.editions,
            })}
            {data.unavailableEditions.length > 0 &&
              ` · ${tr("{value0} editions unavailable", {
                value0: data.unavailableEditions.length,
              })}`}
          </p>
        )}
      </InfoNote>
      {data.state === "pending" ? (
        <EmptyState title={tr("Leaderboard calculation pending")}>
          {tr(
            "The leaderboard is calculated in the background. Please check again shortly.",
          )}
        </EmptyState>
      ) : data.players.length ? (
        <PlayerLeaderboardCards
          players={cards}
          columns={columns}
          defaultSort={{ key: "championships", dir: "desc" }}
          ariaLabel={tr("Career leaderboard")}
        />
      ) : (
        <EmptyState title={tr("No career statistics yet")}>
          {tr(
            "The career ranking appears after a season publishes its rosters and match statistics.",
          )}
        </EmptyState>
      )}
    </div>
  );
}

export default function CareerLeaderboardPage() {
  return remotePage(() => CareerContent());
}
