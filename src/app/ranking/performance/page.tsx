import { EmptyState, PageHeading } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import {
  type PlayerRankCardData,
  type RankStatKey,
} from "@/components/player-rank-card";
import { PlayerLeaderboardCards } from "@/components/player-leaderboard-cards";
import { RankingContext } from "@/components/ranking-context";
import { getAppTranslations } from "@/i18n/server";
import {
  playerLeaderboard,
  type PlayerLeaderboardRow,
} from "@/lib/player-leaderboard";
import type { DirectoryArt } from "@/lib/osu-profiles";
import { remotePage } from "@/lib/remote-page";

import styles from "./page.module.css";

/** Value used to rank each stat; lower values get the cool end of the scale. */
const STAT_ACCESSORS: Record<
  RankStatKey,
  (row: PlayerLeaderboardRow) => number | null
> = {
  rws: (row) => (row.rws === null ? null : row.rws * 100),
  wins: (row) => row.wins,
  losses: (row) => row.losses,
  appearances: (row) => row.appearances,
  winRate: (row) => (row.winRate === null ? null : row.winRate * 100),
  participation: (row) =>
    row.participation === null ? null : row.participation * 100,
  nm: (row) => row.nm,
  mod: (row) => row.mod,
  hd: (row) => row.hd,
  hr: (row) => row.hr,
  dt: (row) => row.dt,
};

/**
 * Map each player to a 0-1 position for one stat. Players are ranked by value
 * ascending; equal values share a rank, and positions span 0-1 across the
 * assigned ranks so the minimum and maximum groups reach the end bands.
 */
function positionsFor(
  rows: PlayerLeaderboardRow[],
  pick: (row: PlayerLeaderboardRow) => number | null,
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

/** Build the card props for every ranked row, using the bulk saved artwork. */
function rankCards(
  rows: PlayerLeaderboardRow[],
  art: Map<number, DirectoryArt>,
): PlayerRankCardData[] {
  const mraPositions = positionsFor(rows, (row) => row.mra);
  const statMaps = {} as Record<RankStatKey, Map<number, number>>;
  for (const key of Object.keys(STAT_ACCESSORS) as RankStatKey[]) {
    statMaps[key] = positionsFor(rows, STAT_ACCESSORS[key]);
  }
  return rows.map((row, index) => {
    const saved = art.get(row.osuId);
    const statPositions = {} as Record<RankStatKey, number | null>;
    for (const key of Object.keys(STAT_ACCESSORS) as RankStatKey[]) {
      statPositions[key] = statMaps[key].get(row.osuId) ?? null;
    }
    return {
      rank: index + 1,
      osuId: row.osuId,
      username: row.username,
      pp: row.pp,
      mra: row.mra,
      stats: {
        rws: row.rws,
        wins: row.wins,
        losses: row.losses,
        appearances: row.appearances,
        winRate: row.winRate,
        participation: row.participation,
        nm: row.nm,
        mod: row.mod,
        hd: row.hd,
        hr: row.hr,
        dt: row.dt,
      },
      mraPosition: mraPositions.get(row.osuId) ?? 0.5,
      statPositions,
      classification: row.classification,
      avatarUrl: saved?.avatarUrl ?? null,
      coverUrl: saved?.coverUrl ?? null,
    };
  });
}

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Player leaderboard"),
    description: tr(
      "Career YumuRating MRA v4 ranking built from published match statistics.",
    ),
  };
}

async function LeaderboardContent() {
  const tr = await getAppTranslations();
  const data = await playerLeaderboard();
  const cards = rankCards(data.players, data.art);
  return (
    <div className={`container page ${styles.page}`}>
      <RankingContext />
      <PageHeading title={tr("Player leaderboard")}>
        {tr(
          "Career YumuRating MRA v4 ranking built from published match statistics.",
        )}
      </PageHeading>
      <InfoNote>
        <p className="muted small">
          {tr(
            "MRA v4 compares each score with a guidance score from the map's average combo and accuracy plus its verified maximum combo. Maps without a maximum combo are excluded.",
          )}
        </p>
        <p className="muted small">
          {tr(
            "Player type is calculated from a player's career DRA, ERA and RWS percentile ranks. Participation is a player's counted maps divided by their team's maps.",
          )}
        </p>
        <p className="muted small">
          {tr(
            "PP is the player's latest published osu! pp. Wins, losses, appearances and participation are counted per map.",
          )}
        </p>
        {data.state === "ready" && (
          <p className="muted small">
            {tr("{value0} players · {value1} editions · {value2} maps", {
              value0: data.players.length,
              value1: data.editions,
              value2: data.maps,
            })}
            {data.skippedMaps > 0 &&
              ` · ${tr("{value0} maps skipped for missing maximum combo", {
                value0: data.skippedMaps,
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
        <PlayerLeaderboardCards players={cards} />
      ) : (
        <EmptyState title={tr("No player statistics yet")}>
          {tr(
            "The leaderboard appears after a season publishes its match statistics.",
          )}
        </EmptyState>
      )}
    </div>
  );
}

export default function PlayerLeaderboardPage() {
  return remotePage(() => LeaderboardContent());
}
