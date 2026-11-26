import { useAppTranslations } from "@/i18n/shared";
import type { DraftBoard } from "@/lib/draft-types";
import { Avatar } from "./avatar";

function PickList({
  picks,
  highlightLatest = false,
}: {
  picks: DraftBoard["picks"];
  highlightLatest?: boolean;
}) {
  return (
    <ol
      className="captain-picks"
      reversed
      aria-live={highlightLatest ? "polite" : undefined}
      aria-relevant={highlightLatest ? "additions" : undefined}
    >
      {picks.map((pick, index) => (
        <li
          key={pick.id}
          value={pick.turnIndex + 1}
          data-latest={(highlightLatest && index === 0) || undefined}
        >
          <span className="captain-pick-number" aria-hidden="true">
            {String(pick.turnIndex + 1).padStart(2, "0")}
          </span>
          <Avatar osuId={pick.player.osuId} username={pick.player.username} />
          <div>
            <strong>{pick.player.username}</strong>
            <span className="muted small">{pick.team.name}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DraftOverview({
  board,
  ownTeamId,
  tiers,
  privatePreview = false,
}: {
  board: Pick<DraftBoard, "rosters" | "picks" | "activeTeam">;
  ownTeamId?: string;
  privatePreview?: boolean;
  tiers: ReadonlyMap<number, number>;
}) {
  const tr = useAppTranslations();
  const picks = [...board.picks].reverse();
  const recent = picks.slice(0, 6);
  const older = picks.slice(6);
  return (
    <div className="captain-draft-overview">
      <section
        className="captain-roster-section"
        aria-label={tr("Team rosters")}
      >
        <div className="draft-room-heading">
          <h2>{tr("Team rosters")}</h2>
          {ownTeamId && (
            <a className="context-link small" href="#captain-own-team">
              {tr("My team")} <span aria-hidden="true">↑</span>
            </a>
          )}
          {privatePreview && (
            <span className="muted small">{tr("Private roster preview")}</span>
          )}
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
                  ].map((player) => {
                    const tier = tiers.get(player.osuId);
                    return (
                      <li key={player.osuId}>
                        <Avatar
                          osuId={player.osuId}
                          username={player.username}
                        />
                        <a
                          className="context-link"
                          href={`https://osu.ppy.sh/users/${player.osuId}`}
                        >
                          {player.username}
                        </a>
                        {tier !== undefined && (
                          <span className="captain-roster-tier">
                            {tier === 0 ? "Captain" : `Tier ${tier}`}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
        </div>
      </section>
      <section
        className="captain-history"
        data-empty={!picks.length}
        aria-label={
          privatePreview ? tr("Pick history") : tr("Published pick history")
        }
      >
        <div className="draft-room-heading">
          <h2>{tr("Pick history")}</h2>
          {picks.length > 0 && <span className="badge">{picks.length}</span>}
        </div>
        {picks.length ? (
          <>
            <PickList picks={recent} highlightLatest />
            {older.length > 0 && (
              <details className="captain-pick-details">
                <summary>
                  {tr("Details")} <span className="badge">{older.length}</span>
                </summary>
                <PickList picks={older} />
              </details>
            )}
          </>
        ) : (
          <p className="muted small">{tr("No picks published yet.")}</p>
        )}
      </section>
    </div>
  );
}
