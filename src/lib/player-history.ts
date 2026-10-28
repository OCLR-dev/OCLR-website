import { frontendTournaments } from "./frontend-data";
import { publicPlayer } from "./players";
import { playerHistoryModel } from "./player-history-model";

export async function playerParticipationHistory(osuId: number) {
  const [participation, tournaments] = await Promise.all([
    publicPlayer(osuId),
    frontendTournaments(),
  ]);
  return playerHistoryModel(osuId, participation, tournaments);
}
