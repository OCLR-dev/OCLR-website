"use client";

import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import { InfoHint } from "@/components/info-hint";
import { PlayerMatchStats } from "@/components/player-match-stats";
import { PlayerTrophy } from "@/components/player-trophy";
import type {
  CompetitionEditionRecord,
  CompetitionMatchRecord,
  PlayerCompetitionRecord,
} from "@/lib/player-competition-model";
import type { PersonalMapRecord } from "@/lib/player-map-performance";
import styles from "./player-competition.module.css";

function record(wins: number, losses: number) {
  return wins + losses ? `${wins}–${losses}` : "—";
}

function teamMaps(edition: CompetitionEditionRecord) {
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
  mapRecord,
  resetHref,
}: {
  record: PlayerCompetitionRecord;
  mapRecord: PersonalMapRecord | null;
  /** Set when the profile is narrowed to one edition; links back to every season. */
  resetHref?: string | null;
}) {
  const tr = useAppTranslations();
  const unavailable = summary.editions.filter((e) => e.unavailable).length;
  return (
    <section className="spaced" aria-labelledby="competition-record">
      <div className={styles.titleRow}>
        <div className={styles.title}>
          <h2 id="competition-record">{tr("Career")}</h2>
          <InfoHint label={tr("Explanation")}>
            {tr(
              "Only published, confirmed results are counted. Match results follow the team's series result and are attributed to every listed player; bench appearances are not distinguished. Map results count only maps where this player has a recorded score. Championships, runner-up and third place follow the deciding knockout series; a 3-4 finish without a placement series counts both semifinal losers as third place.",
            )}
          </InfoHint>
        </div>
        {resetHref && (
          <Link className={`button ${styles.showAll}`} href={resetHref}>
            {tr("Show all seasons")}
          </Link>
        )}
      </div>
      {summary.matches ? (
        <div className={styles.highlights}>
          <PlayerTrophy record={summary} />
          <PlayerMatchStats record={summary} maps={mapRecord} />
        </div>
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
    </section>
  );
}

export function PlayerTeamRecord({
  record: summary,
}: {
  record: PlayerCompetitionRecord;
}) {
  const tr = useAppTranslations();
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
  return (
    <section className="spaced" aria-labelledby="team-record">
      <div className={styles.titleRow}>
        <div className={styles.title}>
          <h2 id="team-record">{tr("Team record")}</h2>
          <InfoHint label={tr("Explanation")}>
            {tr(
              "Team map wins and losses follow each series' recorded map score, including matches this player did not appear in.",
            )}
          </InfoHint>
        </div>
      </div>
      <ul className={`panel ${styles.editions}`}>
        {summary.editions.map((edition) => {
          const group = stage(edition.matches, "group");
          const knockout = stage(edition.matches, "knockout");
          const totals = teamMaps(edition);
          const finish = edition.placingRange
            ? {
                label:
                  edition.placingRange.start === edition.placingRange.end
                    ? String(edition.placingRange.start)
                    : `${edition.placingRange.start}–${edition.placingRange.end}`,
                derived: !edition.placingRange.official,
              }
            : edition.finish;
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
                  <dt>{tr("Team map wins")}</dt>
                  <dd>{totals.won}</dd>
                </div>
                <div>
                  <dt>{tr("Team map losses")}</dt>
                  <dd>{totals.lost}</dd>
                </div>
                <div>
                  <dt>
                    {finish
                      ? finish.derived
                        ? tr("Derived placement")
                        : tr("Final placement")
                      : tr("Group rank")}
                  </dt>
                  <dd>
                    {finish
                      ? finish.label
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
