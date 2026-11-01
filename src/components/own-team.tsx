import { useAppTranslations } from "@/i18n/shared";
import type { ownTeam } from "@/lib/teams";
import { PlayerCard } from "./player-card";
import styles from "./own-team.module.css";

type Team = Pick<
  NonNullable<Awaited<ReturnType<typeof ownTeam>>>,
  "name" | "captainId" | "finalizedAt" | "members"
>;

export function OwnTeam({ team, edition }: { team: Team; edition: string }) {
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
      </header>
      <ul className="archive-player-grid" aria-label={tr("My team roster")}>
        {team.members.map((member) => (
          <PlayerCard
            key={member.osuId}
            osuId={member.osuId}
            username={member.username}
            profileHref={`/players/${member.osuId}?edition=${edition}`}
            roleLabel={
              member.osuId === team.captainId ? tr("Captain") : undefined
            }
            roleCode={member.osuId === team.captainId ? "captain" : "player"}
            prefetch={false}
          />
        ))}
      </ul>
    </section>
  );
}
