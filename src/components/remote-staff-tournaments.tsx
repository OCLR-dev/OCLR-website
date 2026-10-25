import { getAppTranslations } from "@/i18n/server";
import {
  frontendPrivateTournaments,
  frontendPrivateTournament,
} from "@/lib/frontend-data";
import { PageHeading } from "./ui";
import { EditionCard } from "./edition-card";
import { RulesHandbook } from "./rules-handbook";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
export async function RemoteStaffTournaments({ slug }: { slug?: string }) {
  return remotePage(async () => {
    const tr = await getAppTranslations();
    if (!slug) {
      const rows = await frontendPrivateTournaments();
      return (
        <>
          <PageHeading title={tr("Tournament management")} />
          <p className="notice">{tr("Developer access is read-only.")}</p>
          <div className="edition-grid">
            {rows.map((row) => (
              <EditionCard
                key={row.slug}
                edition={row}
                href={`/admin/tournaments/${row.slug}`}
              />
            ))}
          </div>
        </>
      );
    }
    const data = await frontendPrivateTournament(slug);
    const edition = data.configuration;
    return (
      <>
        <PageHeading title={edition.name} />
        <p className="notice">{tr("Developer access is read-only.")}</p>
        <div className="actions">
          <Link className="context-link" href="/admin/tournaments">
            {tr("Internal tournaments")}
          </Link>
          {edition.published && (
            <Link className="context-link" href={`/tournaments/${slug}`}>
              {tr("View public tournament")}
            </Link>
          )}
        </div>
        <dl className="detail-list">
          {[
            [tr("Edition"), edition.slug],
            [tr("Status"), tr(edition.status)],
            [
              tr("Visibility"),
              edition.published ? tr("Published") : tr("Draft"),
            ],
            [tr("Time zone"), edition.timeZone],
            [tr("Version"), data.source.revision],
            [tr("Last updated"), data.source.updatedAt],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <p>{edition.summary}</p>
        {edition.registration && (
          <section className="panel">
            <h2>{tr("Registration")}</h2>
            <dl className="detail-list">
              <div>
                <dt>{tr("Registration opens")}</dt>
                <dd>
                  <time dateTime={edition.registration.opensAt}>
                    {edition.registration.opensAt}
                  </time>
                </dd>
              </div>
              <div>
                <dt>{tr("Registration closes")}</dt>
                <dd>
                  <time dateTime={edition.registration.closesAt}>
                    {edition.registration.closesAt}
                  </time>
                </dd>
              </div>
            </dl>
          </section>
        )}
        {edition.rules && <RulesHandbook sections={edition.rules.sections} />}
        <p className="muted">
          {tr(
            "Other administration tools are not supported in remote development yet.",
          )}
        </p>
      </>
    );
  });
}
