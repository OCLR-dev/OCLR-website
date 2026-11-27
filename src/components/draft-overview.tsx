import { useAppTranslations } from "@/i18n/shared";
import type { DraftBoard } from "@/lib/draft-types";
import { Avatar } from "./avatar";
import { DraftRosterName } from "./draft-roster-name";
import { DraftTierBadge } from "./draft-tier-badge";

function PickList({
  picks,
  label,
}: {
  picks: DraftBoard["picks"];
  label: string;
}) {
  return (
    <ol
      className="captain-picks"
      reversed
      role="list"
      tabIndex={0}
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions"
    >
      {picks.map((pick, index) => (
        <li
          key={pick.id}
          value={pick.turnIndex + 1}
          data-latest={index === 0 || undefined}
        >
          <span className="captain-pick-number" aria-hidden="true">
            {String(pick.turnIndex + 1).padStart(2, "0")}
          </span>
          <Avatar osuId={pick.player.osuId} username={pick.player.username} />
          <div className="captain-pick-identity">
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
                        <DraftRosterName
                          osuId={player.osuId}
                          username={player.username}
                        />
                        {tier !== undefined && <DraftTierBadge tier={tier} />}
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
          <PickList picks={picks} label={tr("Pick history")} />
        ) : (
          <p className="muted small">{tr("No picks published yet.")}</p>
        )}
      </section>
    </div>
  );
}
