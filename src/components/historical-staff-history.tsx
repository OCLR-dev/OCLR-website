import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import { archiveStaffRoleTitles } from "@/lib/archive-staff-groups";
import type { HistoricalStaffHistory as StaffHistory } from "@/lib/archive-staff-history";
import styles from "./player-history.module.css";

export function HistoricalStaffHistory({
  history,
  personal = false,
}: {
  history: StaffHistory | null;
  personal?: boolean;
}) {
  const tr = useAppTranslations();
  const titles = archiveStaffRoleTitles(tr);
  const roleTitle = (role: string) => titles.get(role) ?? role;
  return (
    <section
      className="section-space"
      id="historical-staff-history"
      aria-labelledby="historical-staff-heading"
    >
      <div className="section-title">
        <h2 id="historical-staff-heading">
          {personal
            ? tr("My historical staff record")
            : tr("Historical staff record")}
        </h2>
      </div>
      {history === null ? (
        <p className="notice" role="status">
          {tr("Historical staff records are temporarily unavailable.")}
        </p>
      ) : history.length === 0 ? (
        <p className="panel muted">
          {tr("No historical staff duties are recorded yet.")}
        </p>
      ) : (
        <ul className={`panel ${styles.history}`}>
          {history.map((record) => (
            <li className={styles.record} key={record.editionSlug}>
              <h3>
                <Link
                  href={`/tournaments/${record.editionSlug}/staff`}
                  className="context-link"
                >
                  {record.editionName}
                </Link>
              </h3>
              <div className={styles.experience}>
                {record.roles.map((role) => (
                  <span className="badge" key={role}>
                    {roleTitle(role)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
