import Link from "next/link";
import { getAppTranslations } from "@/i18n/server";
import {
  overviewTournamentHref,
  overviewTournaments,
  overviewTournamentStatuses,
  type OverviewParams,
} from "@/lib/admin-overview-tournaments";
import type { tournamentList } from "@/lib/tournaments";
import styles from "./admin-overview-tournaments.module.css";

export async function AdminOverviewTournaments({
  rows,
  params,
  isAdmin,
}: {
  rows: Awaited<ReturnType<typeof tournamentList>>["rows"];
  params: OverviewParams;
  isAdmin: boolean;
}) {
  const tr = await getAppTranslations();
  const list = overviewTournaments(rows, params);
  const filtered = Boolean(list.query || list.status);
  return (
    <section
      className={`section-space ${styles.overview}`}
      id="accessible-tournaments"
      aria-labelledby="accessible-tournaments-title"
    >
      <h2 id="accessible-tournaments-title">
        {isAdmin ? tr("Accessible tournaments") : tr("Your tournaments")}
      </h2>
      <form
        action="/admin#accessible-tournaments"
        method="get"
        className={styles.filters}
        key={JSON.stringify([list.query, list.status])}
      >
        <label className="field" htmlFor="overview-tournament-query">
          <span id="overview-tournament-query-label">
            {tr("Search tournaments")}
          </span>
          <input
            id="overview-tournament-query"
            aria-labelledby="overview-tournament-query-label"
            type="search"
            name="tournamentQuery"
            maxLength={100}
            defaultValue={list.query}
          />
        </label>
        <label className="field" htmlFor="overview-tournament-status">
          <span id="overview-tournament-status-label">
            {tr("Tournament status")}
          </span>
          <select
            id="overview-tournament-status"
            aria-labelledby="overview-tournament-status-label"
            name="tournamentStatus"
            defaultValue={list.status}
          >
            <option value="">{tr("All statuses")}</option>
            {overviewTournamentStatuses.map((status) => (
              <option key={status} value={status}>
                {tr(status)}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <button type="submit">{tr("Filter")}</button>
          {filtered && (
            <Link
              className="context-link"
              href={overviewTournamentHref({ query: "", status: "" })}
            >
              {tr("Clear filters")}
            </Link>
          )}
        </div>
      </form>
      <p className={`muted small ${styles.count}`}>
        {tr("{count, plural, one {# tournament} other {# tournaments}}", {
          count: list.total,
        })}
      </p>
      {list.rows.length ? (
        <>
          <div className={styles.cards}>
            {list.rows.map((row) => (
              <article className={`panel ${styles.card}`} key={row.slug}>
                <h3>{row.name}</h3>
                <div className={styles.cardDetails}>
                  <p className="muted small">
                    {row.season
                      ? tr("Season {value0} · ", { value0: row.season })
                      : ""}
                    {tr(row.status)} ·{" "}
                    {row.published ? tr("Published") : tr("Draft")}
                  </p>
                  <Link
                    className="button secondary"
                    href={`/admin/tournaments/${row.slug}`}
                  >
                    {tr("Open tournament")}
                    <span className="sr-only"> {row.name}</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <nav
            className={styles.pagination}
            aria-label={tr("Tournament pages")}
          >
            {list.page > 1 ? (
              <Link
                className="button secondary"
                rel="prev"
                href={overviewTournamentHref(list, list.page - 1)}
              >
                {tr("← Previous")}
              </Link>
            ) : (
              <span className="button secondary" aria-disabled="true">
                {tr("← Previous")}
              </span>
            )}
            <p role="status">
              {tr("Page {page} of {pages}", {
                page: list.page,
                pages: list.pages,
              })}
            </p>
            {list.page < list.pages ? (
              <Link
                className="button secondary"
                rel="next"
                href={overviewTournamentHref(list, list.page + 1)}
              >
                {tr("Next →")}
              </Link>
            ) : (
              <span className="button secondary" aria-disabled="true">
                {tr("Next →")}
              </span>
            )}
          </nav>
        </>
      ) : (
        <div className="notice">
          <p>
            {rows.length
              ? tr("No matching tournaments")
              : isAdmin
                ? tr("No tournaments yet. Create a private edition to begin.")
                : tr("No tournaments have been assigned to you yet.")}
          </p>
        </div>
      )}
    </section>
  );
}
