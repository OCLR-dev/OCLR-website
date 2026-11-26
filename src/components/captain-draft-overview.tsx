import { useAppTranslations } from "@/i18n/shared";
import type { DraftBoard } from "@/lib/draft-types";
import { Avatar } from "./avatar";

// Read only the authorized snapshot already used by the Captain's picker.
// The Captain's own roster is rendered once, inside DraftPick.
export function CaptainDraftOverview({
  board,
  ownTeamId,
}: {
  board: Pick<DraftBoard, "rosters" | "picks" | "activeTeam">;
  ownTeamId: string;
}) {
  const tr = useAppTranslations();
  const hasPicks = board.picks.length > 0;
  return (
    <div className="captain-draft-overview">
      <section
        className="captain-roster-section"
        aria-label={tr("Team rosters")}
      >
        <div className="draft-room-heading">
          <h2>{tr("Team rosters")}</h2>
          <a className="context-link small" href="#captain-own-team">
            {tr("My team")} <span aria-hidden="true">↑</span>
          </a>
        </div>
        <div className="captain-rosters">
          {board.rosters
            .filter((r) => r.team.id !== ownTeamId)
            .map(({ team, players }) => (
              <article
                className="captain-roster"
                key={team.id}
                data-active={team.id === board.activeTeam?.id}
              >
                <h3>{team.name}</h3>
                <ul>
                  {[
                    team.captain,
                    ...players.filter((p) => p.osuId !== team.captain.osuId),
                  ].map((player) => (
                    <li key={player.osuId}>
                      <Avatar osuId={player.osuId} username={player.username} />
                      <a
                        className="context-link"
                        href={`https://osu.ppy.sh/users/${player.osuId}`}
                      >
                        {player.username}
                      </a>
                      {player.osuId === team.captain.osuId && (
                        <span className="muted small">{tr("Captain")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
        </div>
      </section>
      <section
        className="captain-history"
        data-empty={!hasPicks}
        aria-label={tr("Published pick history")}
      >
        <div className="draft-room-heading">
          <h2>{tr("Pick history")}</h2>
          {hasPicks && (
            <span className="muted small">{board.picks.length}</span>
          )}
        </div>
        {hasPicks ? (
          <ol
            className="captain-picks"
            reversed
            tabIndex={0}
            aria-label={tr("Pick history")}
            aria-live="polite"
            aria-relevant="additions"
          >
            {[...board.picks].reverse().map((pick) => (
              <li key={pick.id} value={pick.turnIndex + 1}>
                <span className="muted small" aria-hidden="true">
                  {String(pick.turnIndex + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{pick.player.username}</strong>
                  <span className="muted small">{pick.team.name}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">{tr("No picks published yet.")}</p>
        )}
      </section>
    </div>
  );
}
