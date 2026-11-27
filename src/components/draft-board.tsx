import { useAppTranslations } from "@/i18n/shared";
import type { BroadcastBoard } from "@/lib/draft-types";
import { DraftOverview } from "./draft-overview";
import { DraftRoundResults } from "./draft-round-results";
import { OclrLogo } from "./oclr-logo";
export const draftLabels = {
  setup: "Setup",
  ready: "Waiting to start",
  live: "Live draft",
  paused: "Paused",
  completed: "Draft completed",
  finalized: "Rosters finalized",
  aborted: "Draft stopped",
};
export function DraftBoardView({
  board,
  privateTiers,
}: {
  board: BroadcastBoard;
  privateTiers?: ReadonlyMap<number, number>;
}) {
  const tr = useAppTranslations();

  return (
    <>
      <section
        className="draft-turn panel"
        aria-label={tr("Current draft turn")}
      >
        <div>
          <span
            className={`badge ${board.state === "live" ? "status-accepted" : "status-pending"}`}
          >
            {tr(draftLabels[board.state])}
          </span>
          <p className="eyebrow spaced">
            {board.turnCount
              ? tr("Pick {value0} of {value1}", {
                  value0: Math.min(board.turnIndex + 1, board.turnCount),
                  value1: board.turnCount,
                })
              : tr("No picks configured")}
          </p>
          <h2>
            {board.activeTeam?.name ??
              (board.state === "completed" || board.state === "finalized"
                ? tr("The draft is complete.")
                : tr("Awaiting the next stage."))}
          </h2>
          <p className="muted">
            {board.activeTeam
              ? tr("Captain {value0}", {
                  value0: board.activeTeam.captain.username,
                })
              : tr("Follow the published tournament announcements.")}
          </p>
        </div>
        <div className="draft-turn-mark">
          <OclrLogo />
        </div>
      </section>
      {privateTiers ? (
        <DraftOverview board={board} tiers={privateTiers} privatePreview />
      ) : (
        <>
          <DraftOverview
            board={board}
            tiers={
              new Map([
                ...board.rosters.map(
                  ({ team }) => [team.captain.osuId, 0] as const,
                ),
                ...board.picks.flatMap((pick) =>
                  pick.tier === undefined
                    ? []
                    : [[pick.player.osuId, pick.tier] as const],
                ),
              ])
            }
            rostersOnly
          />
          <section
            aria-label={tr("Published pick history")}
            aria-live="polite"
            aria-relevant="additions"
          >
            <h2>{tr("Pick history")}</h2>
            {board.picks.length ? (
              <DraftRoundResults
                picks={board.picks.map((pick) => ({
                  id: pick.id,
                  round: pick.roundPosition?.round,
                  position: pick.roundPosition?.position ?? pick.turnIndex + 1,
                  player: pick.player,
                  playerLabel: pick.player.username,
                  teamLabel: pick.team.name,
                }))}
              />
            ) : (
              <p className="muted small">{tr("No picks published yet.")}</p>
            )}
          </section>
        </>
      )}
      {board.pool && (
        <section className="section-space">
          <h2>{tr("Remaining published pool")}</h2>
          <ul className="public-pool">
            {board.pool.map((p) => (
              <li key={p.osuId}>{p.username}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
