import { EmptyState, PageHeading } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import {
  type PlayerRankCardData,
  type RankStatAnchors,
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

/** Build the card props for every ranked row, using the bulk saved artwork. */
function rankCards(
  rows: PlayerLeaderboardRow[],
  art: Map<number, DirectoryArt>,
): PlayerRankCardData[] {
  return rows.map((row, index) => {
    const saved = art.get(row.osuId);
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
      classification: row.classification,
      avatarUrl: saved?.avatarUrl ?? null,
      coverUrl: saved?.coverUrl ?? null,
    };
  });
}

/** Per-stat colour anchors shared by every ranked card on the page. */
function rankStatAnchors(rows: PlayerLeaderboardRow[]): RankStatAnchors {
  const average = (pick: (row: PlayerLeaderboardRow) => number | null) => {
    let sum = 0;
    let count = 0;
    for (const row of rows) {
      const value = pick(row);
      if (value === null || !Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
    return count ? sum / count : null;
  };
  const maximum = (pick: (row: PlayerLeaderboardRow) => number) =>
    rows.reduce((top, row) => Math.max(top, pick(row)), 0);

  return {
    average: {
      rws: average((row) => (row.rws === null ? null : row.rws * 100)),
      wins: average((row) => row.wins),
      losses: average((row) => row.losses),
      appearances: average((row) => row.appearances),
      winRate: average((row) =>
        row.winRate === null ? null : row.winRate * 100,
      ),
      participation: average((row) =>
        row.participation === null ? null : row.participation * 100,
      ),
      nm: average((row) => row.nm),
      mod: average((row) => row.mod),
      hd: average((row) => row.hd),
      hr: average((row) => row.hr),
      dt: average((row) => row.dt),
    },
    maximum: {
      rws: 30,
      wins: Math.max(
        10,
        maximum((row) => row.wins),
      ),
      losses: Math.max(
        10,
        maximum((row) => row.losses),
      ),
      appearances: Math.max(
        10,
        maximum((row) => row.appearances),
      ),
      winRate: 100,
      participation: 100,
      nm: 2,
      mod: 2,
      hd: 2,
      hr: 2,
      dt: 2,
    },
  };
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
  const anchors = data.players.length ? rankStatAnchors(data.players) : null;
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
      ) : data.players.length && anchors ? (
        <PlayerLeaderboardCards players={cards} anchors={anchors} />
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
