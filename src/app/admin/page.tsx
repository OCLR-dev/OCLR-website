import { Action, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff, staffAccess } from "@/lib/auth/staff";
import { remotePage } from "@/lib/remote-page";
import { listApplications, parseFilters } from "@/lib/staff";
import { tournamentList } from "@/lib/tournaments";
import Link from "next/link";
import { redirect } from "next/navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Administration overview") };
}

async function Issue271Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    const params = await searchParams;
    if (["q", "edition", "status", "page"].some((key) => key in params)) {
      const filters = parseFilters(params);
      redirect(
        `/admin/registrations?${new URLSearchParams({ q: filters.q, edition: filters.edition, status: filters.status, page: String(filters.page) })}`,
      );
    }
    const access = await staffAccess(actor);
    const isAdmin = access.some(
      (g) => g.role === "admin" || g.role === "developer",
    );
    const data = await tournamentList(actor);
    const pending = isAdmin
      ? await listApplications(actor, { status: "pending" })
      : null;
    const deferred = isAdmin
      ? await listApplications(actor, { status: "deferred" })
      : null;
    return (
      <>
        <PageHeading
          eyebrow={tr("OCLR OPERATIONS")}
          title={tr("Administration overview")}
        />
        <div className="actions">
          <Action href="/admin/tournaments">
            {isAdmin ? tr("Manage tournaments") : tr("Assigned tournaments")}
          </Action>
          {data.canCreate && (
            <Action href="/admin/tournaments/new" secondary>
              {tr("Create tournament")}
            </Action>
          )}
        </div>
        {pending && (
          <section className="panel spaced admin-task">
            <div>
              <h2>{tr("Registration review")}</h2>
              <p className="muted small">
                {tr(
                  "{count, plural, one {# pending application across your authorized editions.} other {# pending applications across your authorized editions.}}",
                  { count: pending.total },
                )}
              </p>
            </div>
            <Link
              className="button secondary"
              href="/admin/registrations?status=pending"
            >
              {tr("Review applications")}
            </Link>
          </section>
        )}
        {deferred && (
          <section className="panel spaced admin-task">
            <div>
              <h2>{tr("deferred")}</h2>
              <p className="muted small">
                {tr(
                  "{count, plural, one {# deferred application across your authorized editions.} other {# deferred applications across your authorized editions.}}",
                  { count: deferred.total },
                )}
              </p>
            </div>
            <Link
              className="button secondary"
              href="/admin/registrations?status=deferred"
            >
              {tr("Review applications")}
            </Link>
          </section>
        )}
        <section className="section-space">
          <h2>
            {isAdmin ? tr("Accessible tournaments") : tr("Your tournaments")}
          </h2>
          {data.rows.length ? (
            <div className="stack spaced">
              {data.rows.slice(0, 6).map((row) => (
                <article className="panel admin-task" key={row.slug}>
                  <div>
                    <h3>{row.name}</h3>
                    <p className="muted small">
                      {row.season
                        ? tr("Season {value0} · ", { value0: row.season })
                        : ""}
                      {tr(row.status)} ·{" "}
                      {row.published ? tr("Published") : tr("Draft")}
                    </p>
                  </div>
                  <Link
                    className="button secondary"
                    href={`/admin/tournaments/${row.slug}`}
                  >
                    {tr("Open tournament")}
                    <span className="sr-only"> {row.name}</span>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="notice small">
              {isAdmin
                ? tr("No tournaments yet. Create a private edition to begin.")
                : tr("No tournaments have been assigned to you yet.")}
            </p>
          )}
        </section>
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
