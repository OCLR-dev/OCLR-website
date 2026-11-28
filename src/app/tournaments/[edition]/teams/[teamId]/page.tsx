import { DraftTierBadge } from "@/components/draft-tier-badge";
import { historicalPage } from "@/components/historical-archive";
import { PublicPlayerIdentity } from "@/components/public-player-identity";
import { TeamAvatar } from "@/components/team-avatar";
import { EmptyState, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { publicDraftResults } from "@/lib/broadcast";
import { remotePage } from "@/lib/remote-page";
import { publishedTeams } from "@/lib/team-reads";
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
  const draft = team.members?.length ? await publicDraftResults(edition) : null;
  const tiers = new Map(
    draft?.picks.map(({ player, tier }) => [player.osuId, tier] as const),
  );
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
            {team.members.map((member) => {
              const tier =
                member.osuId === team.captainId ? 0 : tiers.get(member.osuId);
              return (
                <li className="panel" key={member.osuId}>
                  <PublicPlayerIdentity {...member} edition={edition} />
                  {tier !== undefined && <DraftTierBadge tier={tier} />}
                </li>
              );
            })}
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
