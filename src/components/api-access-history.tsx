import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import styles from "./api-access-history.module.css";

type HistoryEntry = {
  id: string;
  title: string;
  scopeText: string;
  expiresAt: string;
  revokedAt: string | null;
};

export function ApiAccessHistory({
  entries,
  emptyMessage,
  expiryText,
  pending,
  activeAction,
  onRevoke,
}: {
  entries: HistoryEntry[];
  emptyMessage: string;
  expiryText: (date: string) => string;
  pending: boolean;
  activeAction: string | null;
  onRevoke: (id: string) => void;
}) {
  const tr = useAppTranslations();
  const [openedAt] = useState(Date.now);
  const formatter = new Intl.DateTimeFormat(tr.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return (
    <section className={styles.history} aria-labelledby="developer-existing">
      <h2 id="developer-existing">{tr("Your API access")}</h2>
      <p className={styles.hint}>
        {tr("Up to 50 recent entries are shown. Times are in UTC.")}
      </p>
      {entries.length ? (
        <ul className={styles.list}>
          {entries.slice(0, 50).map((entry) => {
            const expiry = new Date(entry.expiresAt);
            const status = entry.revokedAt
              ? tr("Revoked")
              : expiry.getTime() <= openedAt
                ? tr("Expired")
                : null;
            return (
              <li key={entry.id}>
                <div className={styles.identity}>
                  <strong>{entry.title}</strong>
                  <span>{entry.scopeText}</span>
                </div>
                <time dateTime={entry.expiresAt}>
                  {expiryText(formatter.format(expiry))}
                </time>
                <div className={styles.action}>
                  {status ? (
                    <span>{status}</span>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      disabled={pending}
                      aria-busy={pending && activeAction === entry.id}
                      onClick={() => onRevoke(entry.id)}
                    >
                      {tr("Revoke token")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>{emptyMessage}</p>
      )}
    </section>
  );
}
