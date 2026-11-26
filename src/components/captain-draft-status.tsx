import { useAppTranslations } from "@/i18n/shared";
import type { DraftBoard, CaptainBoard } from "@/lib/draft-types";
import { draftLabels } from "./draft-board";

export function CaptainDraftStatus({
  board,
  captainId,
  ownTurn,
  connection,
}: {
  board: DraftBoard | CaptainBoard;
  captainId: number;
  ownTurn: boolean;
  connection: string;
}) {
  const tr = useAppTranslations();
  const ownTeam = board.rosters.find(
    (roster) => roster.team.captain.osuId === captainId,
  );
  const turns =
    "eligiblePool" in board && ownTeam
      ? (board.turnSequence ?? []).flatMap((teamId, index) =>
          teamId === ownTeam.team.id ? [index + 1] : [],
        )
      : [];
  return (
    <section
      className="captain-draft-status"
      data-own-turn={ownTurn}
      aria-label={tr("Current draft turn")}
    >
      <div className="captain-draft-turn" role="status" aria-atomic="true">
        <span
          className={`badge ${board.state === "live" ? "status-accepted" : "status-pending"}`}
        >
          {tr(draftLabels[board.state])}
        </span>
        {ownTurn && (
          <strong className="captain-draft-alert">
            {tr("Your team is picking now")}
          </strong>
        )}
        <strong className="captain-draft-progress">
          {board.turnCount
            ? tr("Pick {value0} of {value1}", {
                value0: Math.min(board.turnIndex + 1, board.turnCount),
                value1: board.turnCount,
              })
            : tr("No picks configured")}
        </strong>
        <span>
          {board.activeTeam?.name ??
            tr(
              board.state === "completed" || board.state === "finalized"
                ? "The draft is complete."
                : "Awaiting the next stage.",
            )}
        </span>
      </div>
      <p className="connection-state small" role="status">
        {connection}
      </p>
      {"eligiblePool" in board && (
        <div className="captain-draft-turns">
          <p className="muted small">{tr("Your configured turns:")}</p>
          {turns.length ? (
            <ul aria-label={tr("Your configured turns:")}>
              {turns.map((turn) => (
                <li
                  key={turn}
                  data-past={turn <= board.turnIndex}
                  aria-current={
                    board.activeTeam && turn === board.turnIndex + 1
                      ? "step"
                      : undefined
                  }
                >
                  {turn}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{tr("None")}</p>
          )}
        </div>
      )}
    </section>
  );
}
