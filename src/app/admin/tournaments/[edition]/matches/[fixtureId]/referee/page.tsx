import { RefereePanel } from "@/components/referee-panel";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { refereeWorkspace } from "@/lib/referee-workspace";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Referee panel") };
}
async function RefereePage({
  params,
}: {
  params: Promise<{ edition: string; fixtureId: string }>;
}) {
  const tr = await getAppTranslations();
  return authorizedPage(async () => {
    const { edition, fixtureId } = await params;
    const data = await refereeWorkspace(
      await requireUser(),
      edition,
      fixtureId,
    );
    return (
      <>
        <PageHeading
          eyebrow={tr("REFEREE WORKSPACE")}
          title={data.fixture.label}
        >
          {data.round.name}
          {data.rules &&
            ` · ${data.rules.playersPerTeam}v${data.rules.playersPerTeam}`}
          {data.series?.type === "first_to" &&
            ` · BO${data.series.wins * 2 - 1}`}
          {data.policy?.maxReplaysPerMap !== undefined &&
            ` · ${tr("Up to {count} replays per map", { count: data.policy.maxReplaysPerMap })}`}
        </PageHeading>
        <RefereePanel data={data} slug={edition} />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof RefereePage>[0]) {
  return remotePage(() => RefereePage(props));
}
