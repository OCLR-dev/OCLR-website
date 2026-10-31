import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import type {
  CompetitionEditionRecord,
  CompetitionMatchRecord,
  PlayerCompetitionRecord,
} from "@/lib/player-competition-model";
import styles from "./player-competition.module.css";

function record(wins: number, losses: number) {
  return wins + losses ? `${wins}–${losses}` : "—";
}

function maps(edition: CompetitionEditionRecord) {
  const won = edition.matches.reduce(
    (total, match) => total + (match.mapsWon ?? 0),
    0,
  );
  const lost = edition.matches.reduce(
    (total, match) => total + (match.mapsLost ?? 0),
    0,
  );
  return { won, lost };
}

function stage(
  matches: CompetitionMatchRecord[],
  kind: CompetitionMatchRecord["stage"],
) {
  return matches.filter((match) => match.stage === kind);
}

function deciding(matches: CompetitionMatchRecord[], kind: "win" | "loss") {
  return matches.filter((match) => match.outcome === kind).length;
}

export function PlayerCompetition({
  record: summary,
  resetHref,
}: {
  record: PlayerCompetitionRecord;
  /** Set when the profile is narrowed to one edition; links back to every season. */
  resetHref?: string | null;
}) {
  const tr = useAppTranslations();
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(tr.locale, {
          year: "numeric",
          month: "short",
        }).format(new Date(value))
      : "—";
  const role = (edition: CompetitionEditionRecord) =>
    edition.role === "coach"
      ? tr("Coach")
      : edition.captain
        ? tr("Captain")
        : edition.sourceRole === "VICE"
          ? "VICE"
          : edition.tier != null && edition.tier > 0
            ? `Tier ${edition.tier}`
            : tr("Player");
  const unavailable = summary.editions.filter((e) => e.unavailable).length;
  return (
    <section className="spaced" aria-labelledby="competition-record">
      <div className={styles.titleRow}>
        <h2 id="competition-record">{tr("Competition record")}</h2>
        {resetHref && (
          <Link className={`button ${styles.showAll}`} href={resetHref}>
            {tr("Show all seasons")}
          </Link>
        )}
      </div>
      <p className="muted small">
        {tr(
          "Only published, confirmed results are counted. Team results are attributed to every listed player; bench appearances are not distinguished. Championships, runner-up and third place follow the deciding knockout series; a 3-4 finish without a placement series counts both semifinal losers as third place.",
        )}
      </p>
      {summary.matches ? (
        <dl className={styles.summary}>
          <div>
            <dt>{tr("Seasons")}</dt>
            <dd>{summary.seasons}</dd>
          </div>
          <div>
            <dt>{tr("Championships")}</dt>
            <dd>{summary.championships}</dd>
          </div>
          <div>
            <dt>{tr("Runner-up finishes")}</dt>
            <dd>{summary.runnerUps}</dd>
          </div>
          <div>
            <dt>{tr("Third-place finishes")}</dt>
            <dd>{summary.thirdPlaces}</dd>
          </div>
          <div>
            <dt>{tr("Matches played")}</dt>
            <dd>{summary.matches}</dd>
          </div>
          <div>
            <dt>{tr("Wins")}</dt>
            <dd>{summary.wins}</dd>
          </div>
          <div>
            <dt>{tr("Losses")}</dt>
            <dd>{summary.losses}</dd>
          </div>
          <div>
            <dt>{tr("Win rate")}</dt>
            <dd>
              {summary.winRate === null
                ? "—"
                : `${Math.round(summary.winRate * 100)}%`}
            </dd>
          </div>
          <div>
            <dt>{tr("Maps won")}</dt>
            <dd>{summary.mapsWon}</dd>
          </div>
          <div>
            <dt>{tr("Maps lost")}</dt>
            <dd>{summary.mapsLost}</dd>
          </div>
          <div>
            <dt>{tr("Best finish")}</dt>
            <dd>{summary.bestPlacing ?? "—"}</dd>
          </div>
          <div>
            <dt>{tr("Longest win streak")}</dt>
            <dd>{summary.longestWinStreak}</dd>
          </div>
          <div>
            <dt>{tr("Forfeits")}</dt>
            <dd>{summary.forfeits}</dd>
          </div>
          <div>
            <dt>{tr("First appearance")}</dt>
            <dd className={styles.when}>{date(summary.firstAt)}</dd>
          </div>
          <div>
            <dt>{tr("Latest appearance")}</dt>
            <dd className={styles.when}>{date(summary.lastAt)}</dd>
          </div>
        </dl>
      ) : (
        <p className="notice">
          {tr("No published match results are attributed to this player.")}
        </p>
      )}
      {unavailable > 0 && (
        <p className="notice">
          {tr("Some tournament records are temporarily unavailable.")}
        </p>
      )}
      <ul className={`panel ${styles.editions}`}>
        {summary.editions.map((edition) => {
          const group = stage(edition.matches, "group");
          const knockout = stage(edition.matches, "knockout");
          const totals = maps(edition);
          return (
            <li className={styles.edition} key={edition.editionSlug}>
              <div className={styles.head}>
                <h3>
                  <Link
                    className="context-link"
                    href={`/tournaments/${edition.editionSlug}`}
                  >
                    {edition.editionName}
                  </Link>
                </h3>
                <span className="badge">{role(edition)}</span>
                {edition.champion && (
                  <span className={`badge ${styles.champion}`}>
                    {tr("Champion")}
                  </span>
                )}
                {edition.runnerUp && (
                  <span className={`badge ${styles.runnerUp}`}>
                    {tr("Runner-up")}
                  </span>
                )}
                {edition.thirdPlace && (
                  <span className={`badge ${styles.third}`}>
                    {tr("Third place")}
                  </span>
                )}
                {edition.team ? (
                  <Link
                    className="context-link"
                    href={`/tournaments/${edition.editionSlug}/teams/${edition.team.id}`}
                  >
                    {edition.team.name}
                  </Link>
                ) : edition.coachedTeams.length ? null : (
                  <span className="muted small">—</span>
                )}
                {edition.coachedTeams.map((team) => (
                  <Link
                    key={team.id}
                    className="context-link"
                    href={`/tournaments/${edition.editionSlug}/teams/${team.id}`}
                  >
                    {team.name}
                  </Link>
                ))}
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>{tr("Matches played")}</dt>
                  <dd>{edition.matches.length}</dd>
                </div>
                <div>
                  <dt>{tr("Group stage")}</dt>
                  <dd>
                    {record(deciding(group, "win"), deciding(group, "loss"))}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Knockout")}</dt>
                  <dd>
                    {record(
                      deciding(knockout, "win"),
                      deciding(knockout, "loss"),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Maps won")}</dt>
                  <dd>{totals.won}</dd>
                </div>
                <div>
                  <dt>{tr("Maps lost")}</dt>
                  <dd>{totals.lost}</dd>
                </div>
                <div>
                  <dt>
                    {edition.finish
                      ? edition.finish.derived
                        ? tr("Derived placement")
                        : tr("Final placement")
                      : tr("Group rank")}
                  </dt>
                  <dd>
                    {edition.finish
                      ? edition.finish.label
                      : edition.groupRank
                        ? `${edition.groupRank.group ? `${edition.groupRank.group} · ` : ""}${edition.groupRank.rank}`
                        : "—"}
                  </dd>
                </div>
              </dl>
              {edition.unavailable && (
                <p className="muted small">
                  {tr("This record is temporarily unavailable.")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
