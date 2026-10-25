import { remoteMode } from "@/lib/data-source";
import { RemoteStaffTournaments } from "@/components/remote-staff-tournaments";
import { getAppTranslations } from "@/i18n/server";
import Link from "next/link";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { tournamentList } from "@/lib/tournaments";
import { formatDate } from "@/lib/editions";
import { PageHeading, EmptyState, Action } from "@/components/ui";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Tournament management") };
}

export default async function Tournaments({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    visibility?: string | string[];
  }>;
}) {
  if (remoteMode()) return <RemoteStaffTournaments />;
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const data = await tournamentList(await requireUser());
    const filters = await searchParams;
    const query = typeof filters.q === "string" ? filters.q.slice(0, 100) : "";
    const visibility =
      typeof filters.visibility === "string" ? filters.visibility : "";
    const q = query.toLowerCase();
    const rows = data.rows.filter(
      (r) =>
        (!q ||
          `${r.name} ${r.slug} ${r.season ?? ""}`.toLowerCase().includes(q)) &&
        (visibility !== "published" || r.published) &&
        (visibility !== "draft" || !r.published),
    );
    return (
      <>
        <PageHeading
          eyebrow={tr("OCLR OPERATIONS")}
          title={tr("Tournament management")}
        >
          {tr(
            "Create and configure editions, then open their competition tools.",
          )}
        </PageHeading>
        <div className="actions">
          {data.canCreate && (
            <Action href="/admin/tournaments/new">
              {tr("Create tournament")}
            </Action>
          )}
        </div>
        <form className="filters spaced" method="get">
          <label className="field">
            <span>{tr("Search tournaments")}</span>
            <input name="q" maxLength={100} defaultValue={query} />
          </label>
          <label className="field">
            <span>{tr("Visibility")}</span>
            <select name="visibility" defaultValue={visibility}>
              <option value="">{tr("All assigned editions")}</option>
              <option value="draft">{tr("Draft")}</option>
              <option value="published">{tr("Published")}</option>
            </select>
          </label>
          <button>{tr("Filter")}</button>
        </form>
        {rows.length ? (
          <div className="stack">
            {rows.map((r) => (
              <article className="panel" key={r.slug}>
                <div className="section-title">
                  <div>
                    <p className="eyebrow">
                      {r.season
                        ? tr("Season {value0}", { value0: r.season })
                        : r.slug}
                    </p>
                    <h2>{r.name}</h2>
                  </div>
                  <span className="badge">
                    {r.published ? tr("Published") : tr("Draft")} ·{" "}
                    {tr(r.status)}
                  </span>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>{tr("Registration")}</dt>
                    <dd>
                      {!r.registration
                        ? tr("Not configured")
                        : r.registrationState}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Opens / closes")}</dt>
                    <dd>
                      {r.registration
                        ? `${tr(formatDate(r.registration.opensAt, r.timeZone, tr.locale))} — ${tr(formatDate(r.registration.closesAt, r.timeZone, tr.locale))}`
                        : tr("Not configured")}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Last modified")}</dt>
                    <dd>
                      {tr(formatDate(r.updatedAt, r.timeZone, tr.locale))}
                    </dd>
                  </div>
                </dl>
                <Link
                  className="button secondary"
                  href={`/admin/tournaments/${r.slug}`}
                >
                  {tr("Open tournament")}
                  <span className="sr-only"> {r.name}</span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title={tr("No matching tournaments")}>
            {data.canCreate
              ? tr("Create a private edition to begin, or clear the filters.")
              : tr(
                  "Your authorized tournament workspaces will appear here when assigned.",
                )}
          </EmptyState>
        )}
      </>
    );
  });
}
