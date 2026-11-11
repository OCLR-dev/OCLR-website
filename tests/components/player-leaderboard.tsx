import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PlayerLeaderboardCards } from "../../src/components/player-leaderboard-cards";
import type { PlayerRankCardData } from "../../src/components/player-rank-card";
import en from "../../messages/en.json";

const stats = {
  rws: 0.1,
  wins: 2,
  losses: 1,
  appearances: 3,
  winRate: 2 / 3,
  participation: 1,
  nm: 1,
  mod: 1,
  hd: 1,
  hr: 1,
  dt: 1,
};
const statPositions = {
  rws: 0.5,
  wins: 0.5,
  losses: 0.5,
  appearances: 0.5,
  winRate: 0.5,
  participation: 0.5,
  nm: 0.5,
  mod: 0.5,
  hd: 0.5,
  hr: 0.5,
  dt: 0.5,
};
const players: PlayerRankCardData[] = [3, 2, 1].map((mra, index) => ({
  rank: index + 1,
  osuId: 990001 + index,
  username: `Synthetic ${mra}`,
  pp: mra * 1000,
  mra,
  stats,
  mraPosition: 0.5,
  statPositions,
  classification: null,
  avatarUrl: null,
  coverUrl: null,
}));
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <PlayerLeaderboardCards players={players} />
  </NextIntlClientProvider>,
);
