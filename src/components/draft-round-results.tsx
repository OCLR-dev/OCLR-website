import type { ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { Avatar } from "./avatar";

export function DraftRoundResults({
  picks,
}: {
  picks: {
    id: string;
    round?: number;
    position: number;
    player: { osuId: number; username: string };
    playerLabel: ReactNode;
    teamLabel: ReactNode;
  }[];
}) {
  const tr = useAppTranslations();
  const rounds = new Map<number | undefined, typeof picks>();
  for (const pick of picks) {
    const round = rounds.get(pick.round) ?? [];
    round.push(pick);
    rounds.set(pick.round, round);
  }

  return (
    <div className="archive-draft">
      {[...rounds]
        .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
        .map(([round, results]) => (
          <section key={round ?? "unassigned"} className="archive-draft-round">
            <header>
              <h2>
                {round === undefined
                  ? tr("Pick history")
                  : tr("Round {round}", { round })}
              </h2>
              {round !== undefined && (
                <span className="muted small">{`Tier ${round}`}</span>
              )}
            </header>
            <ol className="archive-draft-picks" role="list">
              {results
                .sort((a, b) => a.position - b.position)
                .map((pick) => (
                  <li key={pick.id} value={pick.position}>
                    <span
                      className="archive-pick-number"
                      aria-label={tr("Pick {pick}", { pick: pick.position })}
                    >
                      {String(pick.position).padStart(2, "0")}
                    </span>
                    <Avatar
                      osuId={pick.player.osuId}
                      username={pick.player.username}
                    />
                    <div>
                      <strong>{pick.playerLabel}</strong>
                      <span className="small muted">{pick.teamLabel}</span>
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        ))}
    </div>
  );
}
