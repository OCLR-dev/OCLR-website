import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { canRead, requireStaff, staffAccess } from "@/lib/auth/staff";
import { formatDate } from "@/lib/editions";
import { HttpError } from "@/lib/http";
import { remotePage } from "@/lib/remote-page";
import { tournamentForAdmin, tournamentList } from "@/lib/tournaments";
import Link from "next/link";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Tournament dashboard") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    const { edition: slug } = await params;
    const grants = await staffAccess(actor);
    const row = (await tournamentList(actor)).rows.find((r) => r.slug === slug);
    if (!row) throw new HttpError(404, "Tournament not found.");
    const data = canRead(grants, "configure_tournament", slug)
      ? await tournamentForAdmin(actor, slug)
      : null;
    const primary = data
      ? row.links.find((link) => link.label === "Settings")
      : (row.links.find((link) => link.label === "Mappools") ??
        row.links.find((link) => link.label === "Fixtures & results") ??
        row.links.find((link) => link.group === "Competition"));
    return (
      <>
        <header className="tournament-dashboard-heading">
          <div>
            <p className="eyebrow">{tr("TOURNAMENT DASHBOARD")}</p>
            <h1>{row.name}</h1>
          </div>
          <div className="actions">
            {primary && (
              <Link
                className={`button${data ? " secondary" : ""}`}
                href={primary.href}
              >
                {data
                  ? tr("Configure tournament")
                  : tr("Open {value0}", {
                      value0: primary.label.toLowerCase(),
                    })}
              </Link>
            )}
            {row.published && (
              <Link className="button secondary" href={`/tournaments/${slug}`}>
                {tr("View public tournament")}
              </Link>
            )}
          </div>
        </header>
        <section
          className="registration-readiness"
          aria-labelledby="registration-heading"
        >
          <div className="registration-readiness-header">
            <h2 id="registration-heading">{tr("Registration")}</h2>
            <div className="registration-summary">
              <span
                className={`badge registration-state state-${row.registrationState}`}
              >
                {row.registration
                  ? row.registrationState
                  : tr("Not configured")}
              </span>
              {data && (
                <Link
                  className="button secondary"
                  href={`/admin/tournaments/${slug}/registrations`}
                >
                  {tr("View applications (")}
                  {data.applications})
                </Link>
              )}
            </div>
          </div>
          <div
            className={`registration-overview-body${data ? "" : " is-single"}`}
          >
            <div>
              <h3>{tr("Registration window")}</h3>
              {row.registration ? (
                <dl className="registration-window">
                  <div>
                    <dt>{tr("Opens")}</dt>
                    <dd>
                      {tr(
                        formatDate(
                          row.registration.opensAt,
                          row.timeZone,
                          tr.locale,
                        ),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Closes")}</dt>
                    <dd>
                      {tr(
                        formatDate(
                          row.registration.closesAt,
                          row.timeZone,
                          tr.locale,
                        ),
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="muted small">
                  {tr("Registration dates have not been configured.")}
                </p>
              )}
              <p className="registration-timezone">
                {tr("Time zone: ")}
                {row.timeZone}
              </p>
            </div>
            {data && (
              <div>
                <h3>{tr("Registration checks")}</h3>
                <ul className="readiness-list">
                  {data.readiness.map((item) => (
                    <li key={item.label}>
                      <span>{tr(item.label)}</span>
                      <span className="readiness-outcome">
                        {!item.ready && item.label === "Registration dates" && (
                          <Link
                            className="button secondary"
                            href={`/admin/tournaments/${slug}/settings?section=registration`}
                          >
                            {tr("Configure")}
                            <span className="sr-only">
                              {" "}
                              {tr(" registration dates")}
                            </span>
                          </Link>
                        )}
                        <span
                          className={
                            item.ready ? "readiness-ready" : "readiness-pending"
                          }
                        >
                          {item.ready ? tr("Ready") : tr("Pending")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
