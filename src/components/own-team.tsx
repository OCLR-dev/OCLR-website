import type { ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { ownTeam } from "@/lib/teams";
import { PublicPlayerIdentity } from "./public-player-identity";
import styles from "./own-team.module.css";

type Team = Pick<
  NonNullable<Awaited<ReturnType<typeof ownTeam>>>,
  "name" | "captainId" | "finalizedAt" | "members"
>;

export function OwnTeam({
  team,
  edition,
  actions,
}: {
  team: Team;
  edition: string;
  actions?: ReactNode;
}) {
  const tr = useAppTranslations();
  return (
    <section className={styles.team} aria-labelledby="own-team-heading">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id="own-team-heading">{team.name}</h2>
          <p className="muted small">
            {team.finalizedAt
              ? tr("Finalized roster")
              : tr("Draft roster in progress")}
          </p>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <ul
        className={`public-roster-grid ${styles.roster}`}
        aria-label={tr("My team roster")}
      >
        {team.members.map((member) => (
          <li className={`panel ${styles.player}`} key={member.osuId}>
            <PublicPlayerIdentity
              osuId={member.osuId}
              username={member.username}
              edition={edition}
            />
            {member.osuId === team.captainId && (
              <span className="badge">{tr("Captain")}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
