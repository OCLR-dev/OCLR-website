import { historicalPage } from "@/components/historical-archive";
import { PublicTeams } from "@/components/public-teams";
import { EmptyState, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { publicDraftResults } from "@/lib/broadcast";
import { publicCompetition } from "@/lib/public-competition";
import { remotePage } from "@/lib/remote-page";
import { publishedTeams } from "@/lib/team-reads";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Published teams") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition } = await params;
  const archivePage = await historicalPage(edition, "teams");
  if (archivePage) return archivePage;
  const [teams, competition, draft] = await Promise.all([
    publishedTeams(edition),
    publicCompetition(edition),
    publicDraftResults(edition),
  ]);
  const publishedMembers = new Set(
    teams.flatMap((team) => team.members?.map(({ osuId }) => osuId) ?? []),
  );
  const tiers = Object.fromEntries(
    (draft?.picks ?? []).flatMap(({ player, tier }) =>
      tier !== undefined && publishedMembers.has(player.osuId)
        ? [[player.osuId, tier] as const]
        : [],
    ),
  );
  return (
    <>
      <PageHeading title={tr("Teams")} />
      {teams.length ? (
        <PublicTeams
          teams={teams}
          tiers={tiers}
          groups={competition?.groups ?? []}
          slug={edition}
        />
      ) : (
        <EmptyState title={tr("No teams published")}>
          {tr("Approved team identities will appear here when released.")}
        </EmptyState>
      )}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
