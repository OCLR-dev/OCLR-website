import { useAppTranslations } from "@/i18n/shared";
import type { DraftBoard } from "@/lib/draft-types";
import { DraftOverview } from "./draft-overview";
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
  board: DraftBoard;
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
        <div className="draft-layout">
          <section aria-label={tr("Published rosters")}>
            <div className="section-title">
              <h2>{tr("Team rosters")}</h2>
              <span className="muted small">
                {tr("Published draft progress")}
              </span>
            </div>
            <div className="roster-grid">
              {board.rosters.map((r) => (
                <article className="roster-panel" key={r.team.id}>
                  <h3>{r.team.name}</h3>
                  <p className="eyebrow">
                    {tr("Captain: ")}
                    {r.team.captain.username}
                  </p>
                  <ul>
                    {r.players.map((p) => (
                      <li key={p.osuId}>
                        <a
                          href={`https://osu.ppy.sh/users/${p.osuId}`}
                          className="text-link"
                        >
                          {p.username}
                        </a>
                        {p.osuId === r.team.captain.osuId && (
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
            className="pick-history"
            aria-label={tr("Published pick history")}
          >
            <h2>{tr("Pick history")}</h2>
            {board.picks.length ? (
              <ol
                aria-live="polite"
                aria-relevant="additions"
                className="draft-picks"
              >
                {board.picks.map((p) => (
                  <li key={p.id}>
                    <span className="eyebrow">
                      {String(p.turnIndex + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{p.player.username}</strong>
                      <p>
                        {p.team.name} {tr(" · Captain ")}
                        {p.team.captain.username}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">{tr("No picks published yet.")}</p>
            )}
          </section>
        </div>
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
