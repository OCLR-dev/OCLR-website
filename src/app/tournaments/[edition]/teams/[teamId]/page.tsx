import { historicalPage } from "@/components/historical-archive";
import { PublicPlayerIdentity } from "@/components/public-player-identity";
import { TeamAvatar } from "@/components/team-avatar";
import { EmptyState, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { remotePage } from "@/lib/remote-page";
import { publishedTeams } from "@/lib/teams";
import Link from "next/link";
import { notFound } from "next/navigation";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string; teamId: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition, teamId } = await params;
  const archivePage = await historicalPage(edition, "team", teamId);
  if (archivePage) return archivePage;
  const team = (await publishedTeams(edition)).find((t) => t.id === teamId);
  if (!team) notFound();
  return (
    <>
      <Link className="context-link" href={`/tournaments/${edition}/teams`}>
        {tr("All teams")}
      </Link>
      <TeamAvatar team={team} />
      <PageHeading eyebrow={tr("PUBLISHED TEAM")} title={team.name} />
      {team.members ? (
        <section aria-labelledby="roster-heading">
          <h2 id="roster-heading">{tr("Published roster")}</h2>
          <ul className="public-roster-grid">
            {team.members.map((m) => (
              <li className="panel" key={m.osuId}>
                <PublicPlayerIdentity {...m} edition={edition} />
                {m.osuId === team.captainId && (
                  <span className="badge">{tr("Captain")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState title={tr("Roster awaiting publication")}>
          {tr(
            "Roster details remain private until finalized and approved for release.",
          )}
        </EmptyState>
      )}
      {team.coaches.length > 0 && (
        <section className="spaced" aria-labelledby="coach-heading">
          <h2 id="coach-heading">{tr("Coaches")}</h2>
          <ul className="public-roster-grid">
            {team.coaches.map((c) => (
              <li className="panel" key={c.osuId}>
                <PublicPlayerIdentity {...c} edition={edition} />
                <span className="badge">{tr("Coach")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
