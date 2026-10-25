import { AuditModuleTabs } from "@/components/audit-module-tabs";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { auditChanges, auditLog, auditModules } from "@/lib/audit";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff";
import { HttpError } from "@/lib/http";
import { remotePage } from "@/lib/remote-page";
import { tournamentList } from "@/lib/tournaments";
import Link from "next/link";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Audit log") };
}

async function Issue271Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    let data;
    try {
      data = await auditLog(actor, await searchParams);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 400) throw error;
      return (
        <>
          <PageHeading eyebrow={tr("ADMINISTRATION")} title={tr("Audit log")} />
          <p role="alert" className="notice error-text">
            {error.message}
          </p>
          <Link className="context-link" href="/admin/audit">
            {tr("Reset audit filters")}
          </Link>
        </>
      );
    }
    const editions = (await tournamentList(actor)).rows;
    const f = data.filters;
    const query = new URLSearchParams(
      Object.entries(f)
        .filter(([key, value]) => key !== "page" && value !== "")
        .map(([key, value]) => [key, String(value)]),
    );
    const editionNames = new Map(editions.map((e) => [e.slug, e.name]));
    const moreFilters = Boolean(f.actor || f.action || f.from || f.to);
    return (
      <div className="audit-workspace">
        <PageHeading eyebrow={tr("ADMINISTRATION")} title={tr("Audit log")}>
          {tr("All times are UTC.")}
        </PageHeading>
        <AuditModuleTabs
          value={f.module}
          query={query.toString()}
          items={[
            { value: "", label: "All activity" },
            ...auditModules.map((module) => ({
              value: module,
              label:
                module === "developer_api"
                  ? tr("Developer API access")
                  : module === "site"
                    ? tr("Site settings")
                    : module === "draft"
                      ? "draft_module"
                      : module.charAt(0).toUpperCase() + module.slice(1),
            })),
          ]}
        />
        <section
          role="tabpanel"
          id="audit-modules-panel"
          aria-labelledby={`audit-modules-${f.module}`}
          tabIndex={0}
        >
          <form className="audit-filters" method="get" key={query.toString()}>
            <input type="hidden" name="module" value={f.module} />
            <label className="field">
              <span>{tr("Tournament")}</span>
              <select
                aria-label={tr("Tournament")}
                name="edition"
                defaultValue={f.edition}
              >
                <option value="">{tr("All authorized tournaments")}</option>
                {editions.map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="actions audit-filter-actions">
              <button className="secondary">{tr("Filter")}</button>
              {(f.edition || moreFilters) && (
                <Link
                  className="context-link small"
                  href={
                    f.module
                      ? `/admin/audit?module=${f.module}`
                      : "/admin/audit"
                  }
                  scroll={false}
                >
                  {tr("Reset filters")}
                </Link>
              )}
            </div>
            <details className="audit-more-filters" open={moreFilters}>
              <summary>{tr("More filters")}</summary>
              <div className="audit-filter-fields">
                <label className="field">
                  <span>{tr("Actor osu! ID")}</span>
                  <input
                    name="actor"
                    inputMode="numeric"
                    pattern="[1-9][0-9]*"
                    defaultValue={f.actor}
                  />
                </label>
                <label className="field">
                  <span>{tr("Action type")}</span>
                  <input
                    name="action"
                    maxLength={80}
                    defaultValue={f.action}
                    placeholder={tr("e.g. captain_appoint")}
                  />
                </label>
                <label className="field">
                  <span>{tr("From (UTC)")}</span>
                  <input type="date" name="from" defaultValue={f.from} />
                </label>
                <label className="field">
                  <span>{tr("Through (UTC)")}</span>
                  <input type="date" name="to" defaultValue={f.to} />
                </label>
              </div>
            </details>
          </form>
          <div className="audit-list-heading">
            <p className="muted small">
              {tr("{count, plural, one {# event} other {# events}}", {
                count: data.total,
              })}{" "}
              {tr(" · Page ")}
              {f.page}
            </p>
            <span className="muted small">{tr("Newest first · UTC")}</span>
          </div>
          {data.rows.length > 0 ? (
            <>
              <div className="audit-columns muted" aria-hidden="true">
                <span>{tr("Time (UTC)")}</span>
                <span>{tr("Activity / entity")}</span>
                <span>{tr("Actor")}</span>
                <span>{tr("Tournament")}</span>
              </div>
              <ol className="audit-events" aria-label={tr("Audit events")}>
                {data.rows.map((event) => {
                  const changes = auditChanges(event.before, event.after);
                  return (
                    <li key={event.id}>
                      <details className="audit-event" name="audit-event">
                        <summary className="audit-event-summary">
                          <time
                            className="audit-event-time"
                            dateTime={event.timestamp}
                            title={event.timestamp}
                          >
                            <span>{event.timestamp.slice(0, 10)}</span>
                            <span className="muted">
                              {event.timestamp.slice(11, 19)}
                            </span>
                          </time>
                          <span className="audit-event-activity">
                            <strong>{event.action.replaceAll("_", " ")}</strong>
                            <span className="muted">
                              {event.entityType.replaceAll("_", " ")} ·{" "}
                              {event.entityId}
                            </span>
                          </span>
                          <span className="audit-event-actor">
                            <span>
                              {event.username ??
                                (event.actorId
                                  ? tr("Removed account")
                                  : tr("System / removed account"))}
                            </span>
                            {event.actorId && (
                              <span className="muted">
                                {tr("osu! ID ")}
                                {event.actorId}
                              </span>
                            )}
                          </span>
                          <span className="audit-event-edition muted">
                            {event.edition
                              ? (editionNames.get(event.edition) ??
                                event.edition)
                              : tr("Global")}
                          </span>
                          <span
                            className="audit-event-toggle"
                            aria-hidden="true"
                          >
                            ⌄
                          </span>
                        </summary>
                        <div className="audit-event-detail">
                          <h2>
                            {changes.length === 20
                              ? tr("Up to 20 changed fields")
                              : tr(
                                  "{count, plural, one {# changed field} other {# changed fields}}",
                                  { count: changes.length },
                                )}
                          </h2>
                          {changes.length > 0 ? (
                            <dl className="detail-list">
                              {changes.map((change) => (
                                <div key={change.field}>
                                  <dt>{change.field.replaceAll("_", " ")}</dt>
                                  <dd>
                                    {change.before} → {change.after}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="muted small">
                              {tr("No before/after changes recorded.")}
                            </p>
                          )}
                          <details>
                            <summary>{tr("Raw details (redacted)")}</summary>
                            <pre className="audit-json">
                              {JSON.stringify(
                                {
                                  before: event.before,
                                  after: event.after,
                                  detail: event.details,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="notice small">{tr("No matching audit events.")}</p>
          )}
          <nav className="actions spaced" aria-label={tr("Audit pages")}>
            {f.page > 1 && (
              <Link
                className="button secondary"
                href={`/admin/audit?${query}&page=${f.page - 1}`}
                scroll={false}
              >
                {tr("← Previous")}
              </Link>
            )}
            {f.page * 25 < data.total && (
              <Link
                className="button secondary"
                href={`/admin/audit?${query}&page=${f.page + 1}`}
                scroll={false}
              >
                {tr("Next →")}
              </Link>
            )}
          </nav>
        </section>
      </div>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
