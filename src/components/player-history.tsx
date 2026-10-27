import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import type { ParticipationHistory } from "@/lib/player-history-model";
import styles from "./player-history.module.css";

export function PlayerHistory({
  history,
}: {
  history: ParticipationHistory | null;
}) {
  const tr = useAppTranslations();
  return (
    <section
      className="section-space"
      id="participation-history"
      aria-labelledby="history-heading"
    >
      <div className="section-title">
        <h2 id="history-heading">{tr("My participation history")}</h2>
      </div>
      {history === null ? (
        <p className="notice" role="status">
          {tr("Participation history is temporarily unavailable.")}{" "}
          <a href="/dashboard#participation-history" className="context-link">
            {tr("Try again")}
          </a>
        </p>
      ) : history.length === 0 ? (
        <p className="panel muted">
          {tr("No historical participation is recorded yet.")}
        </p>
      ) : (
        <ul className={`panel ${styles.history}`}>
          {history.map((record) => (
            <li className={styles.record} key={record.editionSlug}>
              <h3>
                <Link
                  href={`/tournaments/${record.editionSlug}`}
                  className="context-link"
                >
                  {record.editionName}
                </Link>
              </h3>
              <ul className={styles.experiences}>
                {record.experiences.map((experience) => (
                  <li
                    className={styles.experience}
                    key={JSON.stringify([
                      experience.username,
                      experience.role,
                      experience.team?.id,
                    ])}
                  >
                    <span className={styles.name}>{experience.username}</span>
                    <span className="badge">
                      {experience.role === "captain"
                        ? tr("Captain")
                        : experience.role === "coach"
                          ? tr("Coach")
                          : experience.role === "free_agent"
                            ? tr("Free agent")
                            : experience.role === "player"
                              ? tr("Player")
                              : tr("Role not recorded")}
                    </span>
                    {experience.team ? (
                      <Link
                        className="context-link"
                        href={`/tournaments/${record.editionSlug}/teams/${experience.team.id}`}
                      >
                        {experience.team.name}
                      </Link>
                    ) : (
                      <span className="muted small">
                        {tr("Team not recorded")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
